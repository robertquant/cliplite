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
