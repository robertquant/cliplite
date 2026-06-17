package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/cliplite/backend/internal/config"
	"github.com/cliplite/backend/internal/db"
	"github.com/cliplite/backend/internal/ffmpeg"
	"github.com/cliplite/backend/internal/handlers"
	"github.com/cliplite/backend/internal/storage"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	// 初始化数据库
	database, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("打开数据库失败: %v", err)
	}
	defer database.Close()
	log.Printf("数据库就绪: %s", cfg.DBPath)

	// 初始化 ffmpeg
	ff := ffmpeg.New()
	if err := ff.Available(); err != nil {
		log.Printf("⚠️  ffmpeg 不可用: %v（视频功能将无法使用）", err)
	} else {
		log.Printf("ffmpeg 就绪")
	}

	// 初始化存储
	st := storage.New(cfg.StorageDir)

	h := &handlers.Handlers{
		DB:        database,
		FFmpeg:    ff,
		Storage:   st,
		MaxUpload: cfg.MaxUpload,
	}

	// 路由
	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		AllowCredentials: true,
	}))

	api := r.Group("/api")
	{
		api.GET("/health", h.Health)

		// 素材
		api.GET("/assets", h.ListAssets)
		api.POST("/assets", h.UploadAsset)
		api.GET("/assets/:id", h.GetAsset)
		api.DELETE("/assets/:id", h.DeleteAsset)
		api.GET("/assets/:id/file", h.ServeAssetFile)
		api.POST("/assets/:id/extract-audio", h.ExtractAudio)
		api.POST("/assets/:id/remove-audio", h.RemoveAudioTrack)

		// 工程
		api.GET("/projects", h.ListProjects)
		api.POST("/projects", h.CreateProject)
		api.GET("/projects/:id", h.GetProject)
		api.DELETE("/projects/:id", h.DeleteProject)

		// 片段
		api.PUT("/clips/:trackId", h.SaveClips)

		// 渲染
		api.POST("/render", h.Render)
		api.GET("/render/:projectId", h.RenderStatus)
		api.GET("/render/:projectId/download", h.RenderDownload)
	}

	// 托管前端静态文件（dist 目录）。CLIPLITE_FRONTEND_DIR 可覆盖
	frontendDir := getEnv("CLIPLITE_FRONTEND_DIR", "../frontend/dist")
	if _, err := os.Stat(frontendDir); err == nil {
		r.Static("/assets", filepath.Join(frontendDir, "assets"))
		r.GET("/", func(c *gin.Context) {
			c.File(filepath.Join(frontendDir, "index.html"))
		})
		// SPA fallback：未匹配的路由返回 index.html
		r.NoRoute(func(c *gin.Context) {
			p := filepath.Join(frontendDir, c.Request.URL.Path)
			if _, err := os.Stat(p); err == nil {
				c.File(p)
				return
			}
			c.File(filepath.Join(frontendDir, "index.html"))
		})
		log.Printf("前端静态文件: %s", frontendDir)
	}

	log.Printf("🚀 ClipLite 启动: http://0.0.0.0:%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
