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
		if err := rows.Scan(&a.ID, &a.Type, &a.Filename, &a.Duration, &a.Width, &a.Height, &a.Codec, &a.SizeBytes, &a.CreatedAt); err != nil {
			continue
		}
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
	err := h.DB.QueryRow(
		`SELECT id, type, filename, duration, width, height, codec, size_bytes, created_at, storage_path FROM assets WHERE id=?`, id,
	).Scan(&a.ID, &a.Type, &a.Filename, &a.Duration, &a.Width, &a.Height, &a.Codec, &a.SizeBytes, &a.CreatedAt, &path)
	if err != nil {
		c.JSON(404, gin.H{"error": "素材不存在"})
		return
	}
	a.Thumbnail = "/api/assets/" + strconv.FormatInt(id, 10) + "/file"
	c.JSON(200, a)
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

	// 记录为新素材
	res, _ := h.DB.Exec(
		`INSERT INTO assets (type, filename, storage_path, size_bytes) VALUES ('audio', ?, ?, ?)`,
		"extracted_"+filepath.Base(outPath), outPath, fileSize(outPath),
	)
	newID, _ := res.LastInsertId()

	c.JSON(200, gin.H{
		"asset_id": newID,
		"path":     "/api/assets/" + strconv.FormatInt(newID, 10) + "/file",
		"format":   format,
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
