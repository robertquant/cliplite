package storage

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
)

// Storage 管理本地文件存储
type Storage struct {
	Root string // storage 根目录
}

func New(root string) *Storage {
	_ = os.MkdirAll(filepath.Join(root, "uploads"), 0o755)
	_ = os.MkdirAll(filepath.Join(root, "renders"), 0o755)
	_ = os.MkdirAll(filepath.Join(root, "thumbnails"), 0o755)
	return &Storage{Root: root}
}

// SaveUpload 保存上传的文件，返回相对存储路径
func (s *Storage) SaveUpload(fh *multipart.FileHeader) (string, error) {
	src, err := fh.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	name := randName() + filepath.Ext(fh.Filename)
	dst := filepath.Join(s.Root, "uploads", name)

	out, err := os.Create(dst)
	if err != nil {
		return "", err
	}
	defer out.Close()

	if _, err := io.Copy(out, src); err != nil {
		return "", err
	}
	return dst, nil
}

// SaveBytes 保存字节数据到指定子目录
func (s *Storage) SaveBytes(subdir, ext string, data []byte) (string, error) {
	_ = os.MkdirAll(filepath.Join(s.Root, subdir), 0o755)
	name := randName() + ext
	dst := filepath.Join(s.Root, subdir, name)
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		return "", err
	}
	return dst, nil
}

// SavePath 生成一个新文件路径（用于 ffmpeg 输出）
func (s *Storage) NewPath(subdir, ext string) string {
	_ = os.MkdirAll(filepath.Join(s.Root, subdir), 0o755)
	return filepath.Join(s.Root, subdir, randName()+ext)
}

func randName() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}
