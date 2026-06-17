package main

import (
	"log"

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
		api.GET("/assets/:id/file", h.ServeAssetFile)
		api.POST("/assets/:id/extract-audio", h.ExtractAudio)

		// 工程
		api.GET("/projects", h.ListProjects)
		api.POST("/projects", h.CreateProject)
		api.GET("/projects/:id", h.GetProject)
		api.DELETE("/projects/:id", h.DeleteProject)

		// 片段
		api.PUT("/clips/:trackId", h.SaveClips)
	}

	log.Printf("🚀 ClipLite 后端启动: http://0.0.0.0:%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
