package handlers

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cliplite/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// 渲染任务内存状态（MVP 单机足够；后续可入 render_jobs 表）
type renderState struct {
	mu     sync.Mutex
	jobs   map[int64]*renderStatus
}

type renderStatus struct {
	ProjectID int64
	Status    string // queued / running / done / failed
	Progress  int
	Output    string
	Error     string
	StartedAt time.Time
}

var renders = &renderState{jobs: make(map[int64]*renderStatus)}

// Render POST /api/render {project_id}
// 异步触发渲染：拼接视频轨 → 混入音频轨 → 烧录字幕轨
func (h *Handlers) Render(c *gin.Context) {
	var body struct {
		ProjectID int64 `json:"project_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.ProjectID == 0 {
		c.JSON(400, gin.H{"error": "project_id 必填"})
		return
	}

	// 已有任务在跑则拒绝
	renders.mu.Lock()
	if st, ok := renders.jobs[body.ProjectID]; ok && st.Status == "running" {
		renders.mu.Unlock()
		c.JSON(409, gin.H{"error": "该工程正在渲染中"})
		return
	}
	renders.jobs[body.ProjectID] = &renderStatus{
		ProjectID: body.ProjectID,
		Status:    "running",
		Progress:  0,
		StartedAt: time.Now(),
	}
	renders.mu.Unlock()

	go h.doRender(body.ProjectID)

	c.JSON(202, gin.H{"project_id": body.ProjectID, "status": "running"})
}

// RenderStatus GET /api/render/:projectId
func (h *Handlers) RenderStatus(c *gin.Context) {
	pid, _ := strconv.ParseInt(c.Param("projectId"), 10, 64)
	renders.mu.Lock()
	st := renders.jobs[pid]
	renders.mu.Unlock()
	if st == nil {
		c.JSON(404, gin.H{"error": "无渲染任务"})
		return
	}
	resp := gin.H{
		"project_id": st.ProjectID,
		"status":     st.Status,
		"progress":   st.Progress,
	}
	if st.Error != "" {
		resp["error"] = st.Error
	}
	if st.Status == "done" && st.Output != "" {
		resp["download_url"] = "/api/render/" + strconv.FormatInt(pid, 10) + "/download"
	}
	c.JSON(200, resp)
}

// RenderDownload GET /api/render/:projectId/download
func (h *Handlers) RenderDownload(c *gin.Context) {
	pid, _ := strconv.ParseInt(c.Param("projectId"), 10, 64)
	renders.mu.Lock()
	st := renders.jobs[pid]
	renders.mu.Unlock()
	if st == nil || st.Status != "done" || st.Output == "" {
		c.JSON(404, gin.H{"error": "产物不存在"})
		return
	}
	c.FileAttachment(st.Output, fmt.Sprintf("cliplite_%d.mp4", pid))
}

// doRender 实际渲染流程（goroutine）
func (h *Handlers) doRender(projectID int64) {
	defer func() {
		if r := recover(); r != nil {
			h.failRender(projectID, fmt.Sprintf("panic: %v", r))
		}
	}()

	setProgress := func(p int) {
		renders.mu.Lock()
		if st, ok := renders.jobs[projectID]; ok {
			st.Progress = p
		}
		renders.mu.Unlock()
	}

	// 1. 加载工程轨道 + 片段
	videoClips, audioClips, subClips, err := h.loadTimeline(projectID)
	if err != nil {
		h.failRender(projectID, "加载时间轴失败: "+err.Error())
		return
	}

	if len(videoClips) == 0 {
		h.failRender(projectID, "视频轨为空，无法渲染")
		return
	}

	tmpDir := h.Storage.NewDir("renders")
	defer os.RemoveAll(tmpDir)

	// 2. 准备视频片段文件（每个片段可能是源内裁剪）
	setProgress(10)
	segFiles := []string{}
	for i, cl := range videoClips {
		var srcPath string
		if err := h.DB.QueryRow(`SELECT storage_path FROM assets WHERE id=?`, cl.AssetID).Scan(&srcPath); err != nil {
			h.failRender(projectID, fmt.Sprintf("视频素材 %d 未找到", *cl.AssetID))
			return
		}
		// 若指定了源内截取范围，先裁剪；否则直接用原文件
		if cl.SourceStart > 0 || cl.SourceEnd > cl.SourceStart {
			seg := filepath.Join(tmpDir, fmt.Sprintf("v%d.mp4", i))
			if err := h.FFmpeg.Trim(srcPath, seg, cl.SourceStart, cl.SourceEnd); err != nil {
				h.failRender(projectID, "裁剪视频片段失败: "+err.Error())
				return
			}
			segFiles = append(segFiles, seg)
		} else {
			segFiles = append(segFiles, srcPath)
		}
	}

	// 3. 拼接视频
	setProgress(30)
	listFile := filepath.Join(tmpDir, "concat.txt")
	var sb strings.Builder
	for _, seg := range segFiles {
		sb.WriteString("file '" + seg + "'\n")
	}
	if err := os.WriteFile(listFile, []byte(sb.String()), 0o644); err != nil {
		h.failRender(projectID, "写 concat 列表失败: "+err.Error())
		return
	}
	stage1 := filepath.Join(tmpDir, "concat.mp4")
	if len(segFiles) == 1 {
		// 单片段直接复制
		stage1 = segFiles[0]
	} else {
		// 先尝试流复制，失败则重编码
		if err := h.FFmpeg.Concat(listFile, stage1, false); err != nil {
			if err := h.FFmpeg.Concat(listFile, stage1, true); err != nil {
				h.failRender(projectID, "拼接失败: "+err.Error())
				return
			}
		}
	}
	current := stage1

	// 4. 混入音频（若有）
	setProgress(55)
	if len(audioClips) > 0 {
		audioPath, err := h.resolveAudio(audioClips, tmpDir)
		if err != nil {
			h.failRender(projectID, "音频处理失败: "+err.Error())
			return
		}
		stage2 := filepath.Join(tmpDir, "mixed.mp4")
		if err := h.FFmpeg.MixAudio(current, audioPath, stage2, 0.6, true); err != nil {
			h.failRender(projectID, "混音失败: "+err.Error())
			return
		}
		current = stage2
	}

	// 5. 烧录字幕（若有）
	setProgress(75)
	if len(subClips) > 0 {
		srtFile := filepath.Join(tmpDir, "subs.srt")
		if err := writeSRT(srtFile, subClips); err != nil {
			h.failRender(projectID, "生成字幕失败: "+err.Error())
			return
		}
		stage3 := filepath.Join(tmpDir, "subtitled.mp4")
		if err := h.FFmpeg.BurnSubtitles(current, srtFile, stage3); err != nil {
			// 字幕失败不致命，用无字幕版本继续
			_ = err
		} else {
			current = stage3
		}
	}

	// 6. 复制到 renders 目录作为最终产物
	setProgress(95)
	finalPath := h.Storage.NewPath("renders", ".mp4")
	if err := copyFile(current, finalPath); err != nil {
		h.failRender(projectID, "保存产物失败: "+err.Error())
		return
	}

	// 7. 完成
	renders.mu.Lock()
	if st, ok := renders.jobs[projectID]; ok {
		st.Status = "done"
		st.Progress = 100
		st.Output = finalPath
	}
	renders.mu.Unlock()
	setProgress(100)
}

func (h *Handlers) loadTimeline(projectID int64) (videoClips, audioClips, subClips []models.Clip, err error) {
	// 查所有轨道
	rows, err := h.DB.Query(`SELECT id, type FROM tracks WHERE project_id=? ORDER BY ord`, projectID)
	if err != nil {
		return nil, nil, nil, err
	}
	type trk struct {
		id   int64
		typ  string
	}
	var tracks []trk
	for rows.Next() {
		var t trk
		rows.Scan(&t.id, &t.typ)
		tracks = append(tracks, t)
	}
	rows.Close()

	for _, t := range tracks {
		clipRows, err := h.DB.Query(
			`SELECT id, track_id, asset_id, timeline_start, timeline_end, source_start, source_end, text, style_json, fade_in, fade_out FROM clips WHERE track_id=? ORDER BY timeline_start`,
			t.id,
		)
		if err != nil {
			continue
		}
		for clipRows.Next() {
			var cl models.Clip
			var assetID sql.NullInt64
			var text, style sql.NullString
			clipRows.Scan(&cl.ID, &cl.TrackID, &assetID, &cl.TimelineStart, &cl.TimelineEnd, &cl.SourceStart, &cl.SourceEnd, &text, &style, &cl.FadeIn, &cl.FadeOut)
			if assetID.Valid {
				aid := assetID.Int64
				cl.AssetID = &aid
			}
			cl.Text = text.String
			cl.StyleJSON = style.String
			switch t.typ {
			case "video":
				videoClips = append(videoClips, cl)
			case "audio":
				audioClips = append(audioClips, cl)
			case "subtitle":
				subClips = append(subClips, cl)
			}
		}
		clipRows.Close()
	}
	return
}

func (h *Handlers) resolveAudio(clips []models.Clip, tmpDir string) (string, error) {
	if len(clips) == 0 {
		return "", fmt.Errorf("无音频")
	}
	// MVP：用第一个音频片段的素材（取整段）
	cl := clips[0]
	if cl.AssetID == nil {
		return "", fmt.Errorf("音频片段无素材")
	}
	var src string
	if err := h.DB.QueryRow(`SELECT storage_path FROM assets WHERE id=?`, cl.AssetID).Scan(&src); err != nil {
		return "", err
	}
	return src, nil
}

func (h *Handlers) failRender(projectID int64, msg string) {
	renders.mu.Lock()
	if st, ok := renders.jobs[projectID]; ok {
		st.Status = "failed"
		st.Error = msg
	}
	renders.mu.Unlock()
}

// writeSRT 把字幕片段写成 SRT 文件
func writeSRT(path string, clips []models.Clip) error {
	var sb strings.Builder
	for i, cl := range clips {
		sb.WriteString(strconv.Itoa(i + 1))
		sb.WriteString("\n")
		sb.WriteString(srtTime(cl.TimelineStart))
		sb.WriteString(" --> ")
		sb.WriteString(srtTime(cl.TimelineEnd))
		sb.WriteString("\n")
		sb.WriteString(cl.Text)
		sb.WriteString("\n\n")
	}
	return os.WriteFile(path, []byte(sb.String()), 0o644)
}

func srtTime(sec float64) string {
	h := int(sec) / 3600
	m := (int(sec) % 3600) / 60
	s := int(sec) % 60
	ms := int((sec - float64(int(sec))) * 1000)
	return fmt.Sprintf("%02d:%02d:%02d,%03d", h, m, s, ms)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	buf := make([]byte, 1024*1024)
	for {
		n, err := in.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				return werr
			}
		}
		if err != nil {
			break
		}
	}
	return nil
}
