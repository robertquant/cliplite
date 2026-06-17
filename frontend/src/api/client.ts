import axios from 'axios';
import type { Asset, HealthStatus, Project, ProjectDetail, Clip, RenderStatus } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

export const cliplite = {
  // 健康
  health: () => api.get<HealthStatus>('/health').then(r => r.data),

  // 素材
  listAssets: () => api.get<Asset[]>('/assets').then(r => r.data),
  uploadAsset: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<Asset>('/assets', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress?.(Math.round((e.loaded * 100) / (e.total || 1))),
    }).then(r => r.data);
  },
  getAsset: (id: number) => api.get<Asset>(`/assets/${id}`).then(r => r.data),
  deleteAsset: (id: number) => api.delete(`/assets/${id}`),
  assetFileUrl: (id: number) => `/api/assets/${id}/file`,
  extractAudio: (id: number, format: 'mp3' | 'wav' | 'aac' = 'mp3') =>
    api.post<{ asset_id: number; format: string; path: string }>(
      `/assets/${id}/extract-audio?format=${format}`
    ).then(r => r.data),

  // 工程
  listProjects: () => api.get<Project[]>('/projects').then(r => r.data),
  createProject: (name: string) =>
    api.post<ProjectDetail>('/projects', { name }).then(r => r.data),
  getProject: (id: number) => api.get<ProjectDetail>(`/projects/${id}`).then(r => r.data),
  deleteProject: (id: number) => api.delete(`/projects/${id}`),

  // 片段
  saveClips: (trackId: number, clips: Clip[]) =>
    api.put(`/clips/${trackId}`, clips),

  // 渲染
  startRender: (projectId: number) =>
    api.post('/render', { project_id: projectId }).then(r => r.data),
  renderStatus: (projectId: number) =>
    api.get<RenderStatus>(`/render/${projectId}`).then(r => r.data),
  renderDownloadUrl: (projectId: number) => `/api/render/${projectId}/download`,
};
