import { useEffect, useState } from 'react';
import { Button, Upload, message, Tag, Modal, Input, Segmented } from 'antd';
import {
  UploadOutlined, VideoCameraOutlined, AudioOutlined,
  ScissorOutlined, PlusOutlined, ReloadOutlined, ExportOutlined,
} from '@ant-design/icons';
import { cliplite } from './api/client';
import type { Asset, ProjectDetail, HealthStatus } from './types';

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState('');

  // 初始化：健康检查 + 加载素材
  useEffect(() => {
    cliplite.health().then(setHealth).catch(() => {});
    refreshAssets();
  }, []);

  const refreshAssets = () => cliplite.listAssets().then(setAssets);

  const handleUpload = async (file: File) => {
    try {
      setUploadProgress(0);
      const asset = await cliplite.uploadAsset(file, setUploadProgress);
      message.success(`上传成功: ${asset.filename} (${asset.duration.toFixed(1)}s, ${asset.width}x${asset.height})`);
      refreshAssets();
    } catch (e: any) {
      message.error('上传失败: ' + (e?.message || '未知错误'));
    }
    return false; // 阻止 antd 默认上传
  };

  const handleExtractAudio = async (asset: Asset, format: 'mp3' | 'wav' | 'aac') => {
    try {
      const res = await cliplite.extractAudio(asset.id, format);
      message.success(`音频提取成功 (${format})，新素材 ID: ${res.asset_id}`);
      refreshAssets();
    } catch (e: any) {
      message.error('提取失败: ' + (e?.message || ''));
    }
  };

  const handleCreateProject = async () => {
    try {
      const p = await cliplite.createProject(projectName || '未命名工程');
      setProject(p);
      message.success(`工程已创建: ${p.project.name}`);
      setCreating(false);
      setProjectName('');
    } catch (e: any) {
      message.error('创建失败: ' + (e?.message || ''));
    }
  };

  const fmtDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app-layout">
      {/* Header */}
      <div className="app-header">
        <div className="app-logo">🎬 ClipLite</div>
        <Tag color={health?.ffmpeg ? 'green' : 'red'}>
          ffmpeg {health?.ffmpeg ? '✓' : '✗'}
        </Tag>
        <div style={{ flex: 1 }} />
        <Upload
          accept="video/*,audio/*"
          showUploadList={false}
          beforeUpload={handleUpload}
        >
          <Button icon={<UploadOutlined />} type="primary">
            导入素材 {uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : ''}
          </Button>
        </Upload>
        <Button icon={<PlusOutlined />} onClick={() => setCreating(true)}>新建工程</Button>
        <Button icon={<ReloadOutlined />} onClick={refreshAssets} />
      </div>

      <div className="app-body">
        {/* Sidebar: 素材库 */}
        <div className="sidebar">
          <div style={{ marginBottom: 12, fontWeight: 600, color: '#a1a1aa' }}>
            素材库 ({assets.length})
          </div>
          {assets.length === 0 && (
            <div style={{ color: '#71717a', fontSize: 12, padding: 16, textAlign: 'center' }}>
              点击右上角"导入素材"上传视频/音频
            </div>
          )}
          {assets.map(a => (
            <div
              key={a.id}
              className="asset-item"
              onClick={() => setSelectedAsset(a)}
              style={selectedAsset?.id === a.id ? { background: '#52525b' } : {}}
            >
              <div style={{ overflow: 'hidden' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.type === 'video' ? <VideoCameraOutlined /> : <AudioOutlined />}
                  {' '}{a.filename}
                </div>
                <div style={{ color: '#71717a', fontSize: 10 }}>
                  {fmtDuration(a.duration)} · {a.width > 0 ? `${a.width}x${a.height}` : 'audio'}
                </div>
              </div>
              <span className={`asset-type ${a.type}`}>{a.type}</span>
            </div>
          ))}

          {selectedAsset && selectedAsset.type === 'video' && (
            <div style={{ marginTop: 16, padding: 12, background: '#27272a', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 8 }}>从该视频提取音频：</div>
              <Segmented
                options={[
                  { label: 'MP3', value: 'mp3' },
                  { label: 'WAV', value: 'wav' },
                  { label: 'AAC', value: 'aac' },
                ]}
                onChange={(v) => handleExtractAudio(selectedAsset, v as any)}
              />
            </div>
          )}
        </div>

        {/* Main: 预览 + 时间轴 */}
        <div className="main-content">
          <div className="preview-area">
            {!selectedAsset ? (
              <div className="empty-hint">
                <VideoCameraOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <div>从左侧选择素材预览</div>
              </div>
            ) : selectedAsset.type === 'video' ? (
              <video
                key={selectedAsset.id}
                src={cliplite.assetFileUrl(selectedAsset.id)}
                controls
                autoPlay
              />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <AudioOutlined style={{ fontSize: 64, color: '#06b6d4' }} />
                <div style={{ marginTop: 16 }}>{selectedAsset.filename}</div>
                <audio src={cliplite.assetFileUrl(selectedAsset.id)} controls style={{ marginTop: 16 }} />
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="timeline-area">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#a1a1aa', fontSize: 12 }}>
                {project ? `工程: ${project.project.name}` : '未打开工程'} · 时间轴
              </span>
              <Button size="small" icon={<ExportOutlined />} disabled={!project}>
                导出
              </Button>
            </div>
            {(project?.tracks || [
              { id: 0, type: 'video', ord: 0, muted: false, volume: 1, clips: [] },
              { id: 1, type: 'audio', ord: 1, muted: false, volume: 1, clips: [] },
              { id: 2, type: 'subtitle', ord: 2, muted: false, volume: 1, clips: [] },
            ] as any).map((track: any) => (
              <div className="track" key={track.id}>
                <div className="track-label">
                  {track.type === 'video' ? '🎬 视频' : track.type === 'audio' ? '🎵 音乐' : '💬 字幕'}
                </div>
                <div className="track-lane">
                  {track.clips && track.clips.length > 0 ? (
                    track.clips.map((clip: any, i: number) => (
                      <div
                        key={i}
                        className={`clip-block ${track.type}`}
                        style={{
                          left: `${clip.timeline_start * 20}px`,
                          width: `${(clip.timeline_end - clip.timeline_start) * 20}px`,
                        }}
                      >
                        {clip.text || '片段'}
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '10px 12px', color: '#52525b', fontSize: 11 }}>
                      拖拽素材到此轨道
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 创建工程弹窗 */}
      <Modal
        title="新建工程"
        open={creating}
        onOk={handleCreateProject}
        onCancel={() => setCreating(false)}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="工程名称"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          onPressEnter={handleCreateProject}
        />
      </Modal>
    </div>
  );
}
