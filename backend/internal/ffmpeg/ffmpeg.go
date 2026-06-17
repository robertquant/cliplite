package ffmpeg

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// FFmpeg 封装 ffmpeg/ffprobe 调用
type FFmpeg struct {
	Bin     string // ffmpeg 路径
	Probe   string // ffprobe 路径
	Timeout time.Duration
}

func New() *FFmpeg {
	return &FFmpeg{
		Bin:     which("ffmpeg", "ffmpeg"),
		Probe:   which("ffprobe", "ffprobe"),
		Timeout: 10 * time.Minute,
	}
}

// ProbeResult 视频元信息
type ProbeResult struct {
	Duration float64 `json:"duration"`
	Width    int     `json:"width"`
	Height   int     `json:"height"`
	Codec    string  `json:"codec"`
	HasAudio bool    `json:"has_audio"`
	HasVideo bool    `json:"has_video"`
}

// Probe 用 ffprobe 获取媒体元信息
func (f *FFmpeg) ProbeMedia(path string) (*ProbeResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), f.Timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, f.Probe,
		"-v", "quiet",
		"-print_format", "json",
		"-show_format", "-show_streams",
		path,
	)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ffprobe failed: %w", err)
	}

	var raw struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Streams []struct {
			CodecType string `json:"codec_type"`
			CodecName string `json:"codec_name"`
			Width     int    `json:"width"`
			Height    int    `json:"height"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	r := &ProbeResult{}
	fmt.Sscanf(raw.Format.Duration, "%f", &r.Duration)
	for _, s := range raw.Streams {
		if s.CodecType == "video" {
			r.HasVideo = true
			r.Width = s.Width
			r.Height = s.Height
			r.Codec = s.CodecName
		}
		if s.CodecType == "audio" {
			r.HasAudio = true
		}
	}
	return r, nil
}

// Thumbnail 在指定时间点生成缩略图
func (f *FFmpeg) Thumbnail(input, output string, atSec float64) error {
	ctx, cancel := context.WithTimeout(context.Background(), f.Timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, f.Bin,
		"-ss", fmt.Sprintf("%v", atSec),
		"-i", input,
		"-vframes", "1",
		"-s", "320x180",
		"-y", output,
	)
	combined, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("thumbnail failed: %w: %s", err, string(combined))
	}
	return nil
}

// ExtractAudio 从视频提取音频
func (f *FFmpeg) ExtractAudio(input, output, format string) error {
	ctx, cancel := context.WithTimeout(context.Background(), f.Timeout)
	defer cancel()
	codec := "libmp3lame"
	if format == "wav" {
		codec = "pcm_s16le"
	} else if format == "aac" {
		codec = "aac"
	}
	cmd := exec.CommandContext(ctx, f.Bin,
		"-i", input,
		"-vn",
		"-acodec", codec,
		"-y", output,
	)
	combined, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("extract audio failed: %w: %s", err, string(combined))
	}
	return nil
}

// Concat 拼接多个视频（需同编码）。listFile 是 concat 格式的文件列表路径
func (f *FFmpeg) Concat(listFile, output string, reencode bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), f.Timeout)
	defer cancel()
	args := []string{"-f", "concat", "-safe", "0", "-i", listFile}
	if reencode {
		args = append(args, "-c:v", "libx264", "-c:a", "aac")
	} else {
		args = append(args, "-c", "copy")
	}
	args = append(args, "-y", output)
	cmd := exec.CommandContext(ctx, f.Bin, args...)
	combined, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("concat failed: %w: %s", err, string(combined))
	}
	return nil
}

// MixAudio 将背景音乐混入视频。audioVolume 背景音乐音量(0.0-2.0)，keepOriginal 是否保留原视频声音
func (f *FFmpeg) MixAudio(video, audio, output string, audioVolume float64, keepOriginal bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), f.Timeout)
	defer cancel()
	vol := fmt.Sprintf("%.2f", audioVolume)
	var args []string
	if keepOriginal {
		// 原音 + 背景音乐混合
		args = []string{
			"-i", video, "-i", audio,
			"-filter_complex", "[0:a]volume=1.0[a0];[1:a]volume=" + vol + "[a1];[a0][a1]amix=inputs=2:duration=first[aout]",
			"-map", "0:v", "-map", "[aout]",
			"-c:v", "copy", "-c:a", "aac",
		}
	} else {
		// 替换为背景音乐
		args = []string{
			"-i", video, "-i", audio,
			"-filter_complex", "[1:a]volume=" + vol + "[aout]",
			"-map", "0:v", "-map", "[aout]",
			"-c:v", "copy", "-c:a", "aac",
			"-shortest",
		}
	}
	args = append(args, "-y", output)
	cmd := exec.CommandContext(ctx, f.Bin, args...)
	combined, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("mix audio failed: %w: %s", err, string(combined))
	}
	return nil
}

// BurnSubtitles 用 SRT 字幕文件烧录到视频（硬字幕）。forceStyle 为 libass 样式字符串（可空）
func (f *FFmpeg) BurnSubtitles(video, srtFile, output string, forceStyle string) error {
	ctx, cancel := context.WithTimeout(context.Background(), f.Timeout)
	defer cancel()
	// subtitles filter，路径中的特殊字符需要转义冒号和反斜杠
	escaped := strings.ReplaceAll(srtFile, "\\", "\\\\")
	escaped = strings.ReplaceAll(escaped, ":", "\\:")
	filter := "subtitles='" + escaped + "'"
	if forceStyle != "" {
		filter += ":force_style='" + forceStyle + "'"
	}
	args := []string{
		"-i", video,
		"-vf", filter,
		"-c:a", "copy",
		"-y", output,
	}
	cmd := exec.CommandContext(ctx, f.Bin, args...)
	combined, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("burn subtitles failed: %w: %s", err, string(combined))
	}
	return nil
}

// Trim 按源内时间范围裁剪素材（用于片段截取）
func (f *FFmpeg) Trim(input, output string, start, end float64) error {
	ctx, cancel := context.WithTimeout(context.Background(), f.Timeout)
	defer cancel()
	args := []string{
		"-ss", fmt.Sprintf("%.3f", start),
		"-to", fmt.Sprintf("%.3f", end),
		"-i", input,
		"-c", "copy",
		"-y", output,
	}
	cmd := exec.CommandContext(ctx, f.Bin, args...)
	combined, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("trim failed: %w: %s", err, string(combined))
	}
	return nil
}

// Available 检查 ffmpeg/ffprobe 是否可用
func (f *FFmpeg) Available() error {
	if _, err := exec.LookPath(f.Bin); err != nil {
		return fmt.Errorf("ffmpeg not found in PATH: %w", err)
	}
	if _, err := exec.LookPath(f.Probe); err != nil {
		return fmt.Errorf("ffprobe not found in PATH: %w", err)
	}
	return nil
}

func which(names ...string) string {
	for _, n := range names {
		if p, err := exec.LookPath(n); err == nil {
			return p
		}
	}
	return names[0]
}

// helper：判断是否常见视频扩展名
func IsVideoExt(name string) bool {
	return strings.HasSuffix(name, ".mp4") ||
		strings.HasSuffix(name, ".mov") ||
		strings.HasSuffix(name, ".mkv") ||
		strings.HasSuffix(name, ".avi") ||
		strings.HasSuffix(name, ".webm")
}

func IsAudioExt(name string) bool {
	return strings.HasSuffix(name, ".mp3") ||
		strings.HasSuffix(name, ".wav") ||
		strings.HasSuffix(name, ".aac") ||
		strings.HasSuffix(name, ".m4a")
}
