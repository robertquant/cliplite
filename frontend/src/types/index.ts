// 前端类型定义（对应后端 models）

export interface Asset {
  id: number;
  type: 'video' | 'audio';
  filename: string;
  duration: number;
  width: number;
  height: number;
  codec: string;
  size_bytes: number;
  created_at: string;
  thumbnail?: string;
}

export interface Project {
  id: number;
  name: string;
  width: number;
  height: number;
  fps: number;
  created_at: string;
  updated_at: string;
}

export interface TextStyle {
  font?: string;
  size?: number;
  color?: string;        // #RRGGBB
  strokeColor?: string;  // #RRGGBB，描边色
  outlineWidth?: number;
  position?: 'top' | 'center' | 'bottom';
}

export interface Clip {
  id?: number;
  track_id?: number;
  asset_id?: number | null;
  timeline_start: number;
  timeline_end: number;
  source_start?: number;
  source_end?: number;
  text?: string;
  style_json?: string;
  fade_in?: number;
  fade_out?: number;
}

export interface Track {
  id: number;
  project_id: number;
  type: 'video' | 'audio' | 'subtitle';
  ord: number;
  muted: boolean;
  volume: number;
  clips: Clip[];
}

// 时间轴上一个视频/音频片段，附带其素材时长（用于预览 seek）
export interface ActiveClipInfo {
  clip: Clip;
  asset: Asset;
  offsetInClip: number; // 播放头在片段内的偏移（秒）
  mediaType: 'video' | 'audio'; // 片段来源轨道类型
}

export interface ProjectDetail {
  project: Project;
  tracks: Track[];
}

export interface HealthStatus {
  status: string;
  ffmpeg: boolean;
  ffprobe: boolean;
  ffmpeg_error: string;
}

export interface RenderStatus {
  project_id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  error?: string;
  download_url?: string;
}
