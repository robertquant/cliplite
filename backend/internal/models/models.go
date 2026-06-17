package models

// Asset 素材（对应 assets 表）
type Asset struct {
	ID          int64   `json:"id"`
	Type        string  `json:"type"` // video / audio
	Filename    string  `json:"filename"`
	Duration    float64 `json:"duration"`
	Width       int     `json:"width"`
	Height      int     `json:"height"`
	Codec       string  `json:"codec"`
	SizeBytes   int64   `json:"size_bytes"`
	CreatedAt   string  `json:"created_at"`
	Thumbnail   string  `json:"thumbnail,omitempty"`
}

// Project 工程（对应 projects 表）
type Project struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	FPS       int    `json:"fps"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// Track 轨道
type Track struct {
	ID        int64   `json:"id"`
	ProjectID int64   `json:"project_id"`
	Type      string  `json:"type"` // video / audio / subtitle
	Ord       int     `json:"ord"`
	Muted     bool    `json:"muted"`
	Volume    float64 `json:"volume"`
}

// Clip 片段
type Clip struct {
	ID            int64   `json:"id"`
	TrackID       int64   `json:"track_id"`
	AssetID       *int64  `json:"asset_id,omitempty"`
	TimelineStart float64 `json:"timeline_start"`
	TimelineEnd   float64 `json:"timeline_end"`
	SourceStart   float64 `json:"source_start,omitempty"`
	SourceEnd     float64 `json:"source_end,omitempty"`
	Text          string  `json:"text,omitempty"`
	StyleJSON     string  `json:"style_json,omitempty"`
	FadeIn        float64 `json:"fade_in,omitempty"`
	FadeOut       float64 `json:"fade_out,omitempty"`
}

// RenderJob 渲染任务
type RenderJob struct {
	ID         int64   `json:"id"`
	ProjectID  int64   `json:"project_id"`
	Status     string  `json:"status"` // queued / running / done / failed
	Progress   int     `json:"progress"`
	OutputPath string  `json:"output_path,omitempty"`
	Error      string  `json:"error,omitempty"`
	CreatedAt  string  `json:"created_at"`
	FinishedAt *string `json:"finished_at,omitempty"`
}
