package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/cliplite/backend/internal/ffmpeg"
	"github.com/cliplite/backend/internal/models"
	"github.com/cliplite/backend/internal/storage"
	"github.com/gin-gonic/gin"
)

type Handlers struct {
	DB      *sql.DB
	FFmpeg  *ffmpeg.FFmpeg
	Storage *storage.Storage
	MaxUpload int64
}

// ListAssets GET /api/assets
func (h *Handlers) ListAssets(c *gin.Context) {
	rows, err := h.DB.Query(`SELECT id, type, filename, duration, width, height, codec, size_bytes, created_at FROM assets ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	assets := []models.Asset{}
	for rows.Next() {
		var a models.Asset
		var dur sql.NullFloat64
		var width, height sql.NullInt64
		var codec sql.NullString
		if err := rows.Scan(&a.ID, &a.Type, &a.Filename, &dur, &width, &height, &codec, &a.SizeBytes, &a.CreatedAt); err != nil {
			continue
		}
		a.Duration = dur.Float64
		a.Width = int(width.Int64)
		a.Height = int(height.Int64)
		a.Codec = codec.String
		assets = append(assets, a)
	}
	c.JSON(200, assets)
}

// UploadAsset POST /api/assets (multipart, field "file")
func (h *Handlers) UploadAsset(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, h.MaxUpload)

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"error": "文件上传失败: " + err.Error()})
		return
	}

	// 保存文件
	dst, err := h.Storage.SaveUpload(file)
	if err != nil {
		c.JSON(500, gin.H{"error": "保存失败: " + err.Error()})
		return
	}

	// 探测元信息
	assetType := "video"
	if ffmpeg.IsAudioExt(file.Filename) {
		assetType = "audio"
	}

	var probe *ffmpeg.ProbeResult
	if p, err := h.FFmpeg.ProbeMedia(dst); err == nil {
		probe = p
	}

	a := models.Asset{
		Type:      assetType,
		Filename:  file.Filename,
		SizeBytes: file.Size,
	}
	if probe != nil {
		a.Duration = probe.Duration
		a.Width = probe.Width
		a.Height = probe.Height
		a.Codec = probe.Codec
	}

	res, err := h.DB.Exec(
		`INSERT INTO assets (type, filename, storage_path, duration, width, height, codec, size_bytes) VALUES (?,?,?,?,?,?,?,?)`,
		a.Type, a.Filename, dst, a.Duration, a.Width, a.Height, a.Codec, a.SizeBytes,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": "数据库写入失败: " + err.Error()})
		return
	}
	a.ID, _ = res.LastInsertId()

	c.JSON(201, a)
}

// GetAsset GET /api/assets/:id
func (h *Handlers) GetAsset(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var a models.Asset
	var path string
	var dur sql.NullFloat64
	var width, height sql.NullInt64
	var codec sql.NullString
	err := h.DB.QueryRow(
		`SELECT id, type, filename, duration, width, height, codec, size_bytes, created_at, storage_path FROM assets WHERE id=?`, id,
	).Scan(&a.ID, &a.Type, &a.Filename, &dur, &width, &height, &codec, &a.SizeBytes, &a.CreatedAt, &path)
	if err != nil {
		c.JSON(404, gin.H{"error": "素材不存在"})
		return
	}
	a.Duration = dur.Float64
	a.Width = int(width.Int64)
	a.Height = int(height.Int64)
	a.Codec = codec.String
	a.Thumbnail = "/api/assets/" + strconv.FormatInt(id, 10) + "/file"
	c.JSON(200, a)
}

// DeleteAsset DELETE /api/assets/:id — 删除素材（DB 记录 + 文件 + 关联片段）
func (h *Handlers) DeleteAsset(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)

	// 先拿到文件路径
	var storagePath string
	err := h.DB.QueryRow(`SELECT storage_path FROM assets WHERE id=?`, id).Scan(&storagePath)
	if err != nil {
		c.JSON(404, gin.H{"error": "素材不存在"})
		return
	}

	// 删除引用该素材的片段（避免悬空引用）
	h.DB.Exec(`DELETE FROM clips WHERE asset_id=?`, id)

	// 删除 DB 记录
	if _, err := h.DB.Exec(`DELETE FROM assets WHERE id=?`, id); err != nil {
		c.JSON(500, gin.H{"error": "删除失败: " + err.Error()})
		return
	}

	// 删除磁盘文件（忽略错误，文件可能已被删）
	if storagePath != "" {
		_ = os.Remove(storagePath)
	}

	c.JSON(200, gin.H{"ok": true, "id": id})
}

// ServeAssetFile GET /api/assets/:id/file — 直接返回原文件（预览用）
func (h *Handlers) ServeAssetFile(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var path, filename string
	err := h.DB.QueryRow(`SELECT storage_path, filename FROM assets WHERE id=?`, id).Scan(&path, &filename)
	if err != nil {
		c.JSON(404, gin.H{"error": "素材不存在"})
		return
	}
	c.FileAttachment(path, filename)
}

// ExtractAudio POST /api/assets/:id/extract-audio?format=mp3
func (h *Handlers) ExtractAudio(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var srcPath string
	if err := h.DB.QueryRow(`SELECT storage_path FROM assets WHERE id=?`, id).Scan(&srcPath); err != nil {
		c.JSON(404, gin.H{"error": "素材不存在"})
		return
	}

	format := c.DefaultQuery("format", "mp3")
	if format != "mp3" && format != "wav" && format != "aac" {
		format = "mp3"
	}
	outPath := h.Storage.NewPath("renders", "."+format)
	if err := h.FFmpeg.ExtractAudio(srcPath, outPath, format); err != nil {
		c.JSON(500, gin.H{"error": "音频提取失败: " + err.Error()})
		return
	}

	// 探测音频时长
	var duration float64
	if p, err := h.FFmpeg.ProbeMedia(outPath); err == nil {
		duration = p.Duration
	}

	// 记录为新素材
	res, _ := h.DB.Exec(
		`INSERT INTO assets (type, filename, storage_path, duration, size_bytes) VALUES ('audio', ?, ?, ?, ?)`,
		"extracted_"+filepath.Base(outPath), outPath, duration, fileSize(outPath),
	)
	newID, _ := res.LastInsertId()

	c.JSON(200, gin.H{
		"asset_id": newID,
		"path":     "/api/assets/" + strconv.FormatInt(newID, 10) + "/file",
		"format":   format,
		"duration": duration,
	})
}

// RemoveAudioTrack POST /api/assets/:id/remove-audio — 去除视频声音，只保留画面
func (h *Handlers) RemoveAudioTrack(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var srcPath string
	if err := h.DB.QueryRow(`SELECT storage_path FROM assets WHERE id=?`, id).Scan(&srcPath); err != nil {
		c.JSON(404, gin.H{"error": "素材不存在"})
		return
	}

	outPath := h.Storage.NewPath("renders", ".mp4")
	if err := h.FFmpeg.RemoveAudioTrack(srcPath, outPath); err != nil {
		c.JSON(500, gin.H{"error": "去音轨失败: " + err.Error()})
		return
	}

	// 探测时长
	var duration float64
	var w, ht int
	var codec string
	if p, err := h.FFmpeg.ProbeMedia(outPath); err == nil {
		duration, w, ht, codec = p.Duration, p.Width, p.Height, p.Codec
	}

	res, _ := h.DB.Exec(
		`INSERT INTO assets (type, filename, storage_path, duration, width, height, codec, size_bytes) VALUES ('video', ?, ?, ?, ?, ?, ?, ?)`,
		"muted_"+filepath.Base(outPath), outPath, duration, w, ht, codec, fileSize(outPath),
	)
	newID, _ := res.LastInsertId()

	c.JSON(200, gin.H{
		"asset_id": newID,
		"path":     "/api/assets/" + strconv.FormatInt(newID, 10) + "/file",
		"duration": duration,
	})
}

// Health GET /api/health
func (h *Handlers) Health(c *gin.Context) {
	ffErr := ""
	if err := h.FFmpeg.Available(); err != nil {
		ffErr = err.Error()
	}
	c.JSON(200, gin.H{
		"status":  "ok",
		"ffmpeg":  ffErr == "",
		"ffprobe": ffErr == "",
		"ffmpeg_error": ffErr,
	})
}

func fileSize(p string) int64 {
	if info, err := os.Stat(p); err == nil {
		return info.Size()
	}
	return 0
}
