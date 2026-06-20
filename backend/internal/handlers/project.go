package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/cliplite/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// ListProjects GET /api/projects
func (h *Handlers) ListProjects(c *gin.Context) {
	rows, err := h.DB.Query(`SELECT id, name, width, height, fps, created_at, updated_at FROM projects ORDER BY updated_at DESC`)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	projects := []models.Project{}
	for rows.Next() {
		var p models.Project
		rows.Scan(&p.ID, &p.Name, &p.Width, &p.Height, &p.FPS, &p.CreatedAt, &p.UpdatedAt)
		projects = append(projects, p)
	}
	c.JSON(200, projects)
}

// CreateProject POST /api/projects {name}
func (h *Handlers) CreateProject(c *gin.Context) {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		body.Name = "未命名工程"
	}
	res, err := h.DB.Exec(`INSERT INTO projects (name) VALUES (?)`, body.Name)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()

	// 默认创建 3 个轨道：video / audio / subtitle
	for i, t := range []string{"video", "audio", "subtitle"} {
		h.DB.Exec(`INSERT INTO tracks (project_id, type, ord) VALUES (?,?,?)`, id, t, i)
	}

	// 注入 id 参数后复用 GetProject
	c.Params = append(c.Params, gin.Param{Key: "id", Value: strconv.FormatInt(id, 10)})
	h.GetProject(c)
}

// GetProject GET /api/projects/:id （含 tracks + clips）
func (h *Handlers) GetProject(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var p models.Project
	err := h.DB.QueryRow(`SELECT id, name, width, height, fps, created_at, updated_at FROM projects WHERE id=?`, id).
		Scan(&p.ID, &p.Name, &p.Width, &p.Height, &p.FPS, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "工程不存在"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// 加载 tracks + 每个 track 的 clips
	// 注意：先物化 tracks 行并关闭 rows，再查 clips，避免单连接嵌套查询死锁
	type trackRow struct {
		ID        int64
		ProjectID int64
		Type      string
		Ord       int
		Muted     bool
		Volume    float64
	}
	var trackRows []trackRow
	trkRows, err := h.DB.Query(`SELECT id, project_id, type, ord, muted, volume FROM tracks WHERE project_id=? ORDER BY ord`, id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	for trkRows.Next() {
		var t trackRow
		var muted int
		trkRows.Scan(&t.ID, &t.ProjectID, &t.Type, &t.Ord, &muted, &t.Volume)
		t.Muted = muted == 1
		trackRows = append(trackRows, t)
	}
	trkRows.Close()

	type trackWithClips struct {
		models.Track
		Clips []models.Clip `json:"clips"`
	}
	var tracks []trackWithClips
	for _, t := range trackRows {
		clips := []models.Clip{}
		clipRows, _ := h.DB.Query(
			`SELECT id, track_id, asset_id, timeline_start, timeline_end, source_start, source_end, text, style_json, fade_in, fade_out, speed FROM clips WHERE track_id=? ORDER BY timeline_start`,
			t.ID,
		)
		for clipRows.Next() {
			var cl models.Clip
			var assetID sql.NullInt64
			var text, style sql.NullString
			clipRows.Scan(&cl.ID, &cl.TrackID, &assetID, &cl.TimelineStart, &cl.TimelineEnd, &cl.SourceStart, &cl.SourceEnd, &text, &style, &cl.FadeIn, &cl.FadeOut, &cl.Speed)
			if assetID.Valid {
				aid := assetID.Int64
				cl.AssetID = &aid
			}
			cl.Text = text.String
			cl.StyleJSON = style.String
			clips = append(clips, cl)
		}
		clipRows.Close()
		tracks = append(tracks, trackWithClips{
			Track: models.Track{
				ID: t.ID, ProjectID: t.ProjectID, Type: t.Type,
				Ord: t.Ord, Muted: t.Muted, Volume: t.Volume,
			},
			Clips: clips,
		})
	}

	c.JSON(200, gin.H{
		"project": p,
		"tracks":  tracks,
	})
}

// DeleteProject DELETE /api/projects/:id
func (h *Handlers) DeleteProject(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	h.DB.Exec(`DELETE FROM projects WHERE id=?`, id)
	c.JSON(200, gin.H{"ok": true})
}

// SaveClip PUT /api/clips/:trackId （批量保存某轨道的 clips，整体替换）
func (h *Handlers) SaveClips(c *gin.Context) {
	trackID, _ := strconv.ParseInt(c.Param("trackId"), 10, 64)
	var clips []models.Clip
	if err := c.ShouldBindJSON(&clips); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx, _ := h.DB.Begin()
	tx.Exec(`DELETE FROM clips WHERE track_id=?`, trackID)
	for _, cl := range clips {
		var assetID any
		if cl.AssetID != nil {
			assetID = *cl.AssetID
		}
		tx.Exec(
			`INSERT INTO clips (track_id, asset_id, timeline_start, timeline_end, source_start, source_end, text, style_json, fade_in, fade_out, speed) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
			trackID, assetID, cl.TimelineStart, cl.TimelineEnd, cl.SourceStart, cl.SourceEnd, cl.Text, cl.StyleJSON, cl.FadeIn, cl.FadeOut, cl.Speed,
		)
	}
	tx.Commit()
	c.JSON(200, gin.H{"ok": true, "count": len(clips)})
}
