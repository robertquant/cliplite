package config

import (
	"os"
	"path/filepath"
)

// Config 全局配置
type Config struct {
	Port       string // HTTP 端口
	DataDir    string // 数据根目录（数据库、素材、产物）
	DBPath     string // SQLite 数据库路径
	StorageDir string // 素材/产物存储目录
	MaxUpload  int64  // 单文件最大字节数（默认 2GB）
}

// Load 加载配置，带默认值
func Load() *Config {
	dataDir := getEnv("CLIPLITE_DATA_DIR", "./data")
	dataDir, _ = filepath.Abs(dataDir)

	cfg := &Config{
		Port:       getEnv("CLIPLITE_PORT", "8080"),
		DataDir:    dataDir,
		DBPath:     filepath.Join(dataDir, "cliplite.db"),
		StorageDir: filepath.Join(dataDir, "storage"),
		MaxUpload:  2 * 1024 * 1024 * 1024, // 2GB
	}

	// 确保目录存在
	for _, dir := range []string{
		dataDir,
		cfg.StorageDir,
		filepath.Join(cfg.StorageDir, "uploads"),
		filepath.Join(cfg.StorageDir, "renders"),
		filepath.Join(cfg.StorageDir, "thumbnails"),
	} {
		_ = os.MkdirAll(dir, 0o755)
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
