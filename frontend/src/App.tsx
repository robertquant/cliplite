import { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Upload, message, Tag, Modal, Input, Segmented, Progress, Tooltip } from 'antd';
import {
  UploadOutlined, VideoCameraOutlined, AudioOutlined,
  PlusOutlined, ReloadOutlined, ExportOutlined, DeleteOutlined,
  PlusCircleOutlined, FontSizeOutlined, FolderOpenOutlined,
} from '@ant-design/icons';
import { cliplite } from './api/client';
import type { Asset, ProjectDetail, HealthStatus, Clip, Track } from './types';

const PX_PER_SEC = 24; // 时间轴每秒像素宽度

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState('');

  // 渲染状态
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const renderPollRef = useRef<number | null>(null);

  // 字幕输入
  const [subtitleModal, setSubtitleModal] = useState(false);
  const [subText, setSubText] = useState('');
  const [subStart, setSubStart] = useState(0);
  const [subEnd, setSubEnd] = useState(3);

  // 打开已有工程
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [projectList, setProjectList] = useState<any[]>([]);

  useEffect(() => {
    cliplite.health().then(setHealth).catch(() => {});
    refreshAssets();
  }, []);

  const refreshAssets = () => cliplite.listAssets().then(setAssets);

  const handleUpload = async (file: File) => {
    try {
      setUploadProgress(0);
      const asset = await cliplite.uploadAsset(file, setUploadProgress);
      message.success(`上传成功: ${asset.filename}`);
      refreshAssets();
    } catch (e: any) {
      message.error('上传失败: ' + (e?.message || '未知错误'));
    }
    return false;
  };

  const handleExtractAudio = async (asset: Asset, format: 'mp3' | 'wav' | 'aac') => {
    try {
      message.loading({ content: '提取音频中...', key: 'extract', duration: 0 });
      const res = await cliplite.extractAudio(asset.id, format);
      message.success({ content: `音频提取成功 (${format})`, key: 'extract' });
      refreshAssets();
      console.log('extracted', res);
    } catch (e: any) {
      message.error({ content: '提取失败: ' + (e?.message || ''), key: 'extract' });
    }
  };

  const handleCreateProject = async () => {
    try {
      const p = await cliplite.createProject(projectName || '未命名工程');
      setProject(p);
      setRenderUrl(null);
      message.success(`工程已创建: ${p.project.name}`);
      setCreating(false);
      setProjectName('');
    } catch (e: any) {
      message.error('创建失败: ' + (e?.message || ''));
    }
  };

  const loadProjectList = async () => {
    const list = await cliplite.listProjects();
    setProjectList(list);
    setProjectListOpen(true);
  };

  const openProject = async (id: number) => {
    const p = await cliplite.getProject(id);
    setProject(p);
    setRenderUrl(null);
    setProjectListOpen(false);
    message.success(`已打开: ${p.project.name}`);
  };

  // 把素材加到对应轨道
  const addAssetToTimeline = async (asset: Asset) => {
    if (!project) {
      message.warning('请先创建或打开工程');
      return;
    }
    const trackType = asset.type === 'video' ? 'video' : 'audio';
    const track = project.tracks.find(t => t.type === trackType);
    if (!track) {
      message.error(`找不到 ${trackType} 轨道`);
      return;
    }
    // 计算新片段起点（接在已有片段后面）
    const lastEnd = track.clips.reduce((m, c) => Math.max(m, c.timeline_end), 0);
    const newClip: Clip = {
      track_id: track.id,
      asset_id: asset.id,
      timeline_start: lastEnd,
      timeline_end: lastEnd + (asset.duration || 5),
      source_start: 0,
      source_end: asset.duration || 5,
    };
    const updatedClips = [...track.clips, newClip];
    await cliplite.saveClips(track.id, updatedClips);
    // 刷新工程
    const fresh = await cliplite.getProject(project.project.id);
    setProject(fresh);
    message.success(`已添加到${trackType === 'video' ? '视频' : '音乐'}轨`);
  };

  // 删除片段
  const removeClip = async (track: Track, clipIndex: number) => {
    if (!project) return;
    const updated = track.clips.filter((_, i) => i !== clipIndex);
    await cliplite.saveClips(track.id, updated);
    const fresh = await cliplite.getProject(project.project.id);
    setProject(fresh);
  };

  // 添加字幕
  const handleAddSubtitle = async () => {
    if (!project || !subText.trim()) return;
    const track = project.tracks.find(t => t.type === 'subtitle');
    if (!track) return;
    const lastEnd = track.clips.reduce((m, c) => Math.max(m, c.timeline_end), 0);
    const start = subStart;
    const end = Math.max(subEnd, start + 0.5);
    const newClip: Clip = {
      track_id: track.id,
      timeline_start: start,
      timeline_end: end,
      text: subText.trim(),
    };
    await cliplite.saveClips(track.id, [...track.clips, newClip]);
    const fresh = await cliplite.getProject(project.project.id);
    setProject(fresh);
    setSubText('');
    setSubtitleModal(false);
    message.success('字幕已添加');
  };

  // 导出渲染
  const handleExport = async () => {
    if (!project) return;
    const videoTrack = project.tracks.find(t => t.type === 'video');
    if (!videoTrack || videoTrack.clips.length === 0) {
      message.warning('视频轨为空，请先添加视频片段');
      return;
    }
    setRendering(true);
    setRenderProgress(0);
    setRenderUrl(null);
    try {
      await cliplite.startRender(project.project.id);
      message.info('开始渲染...');
      pollRenderStatus(project.project.id);
    } catch (e: any) {
      message.error('渲染启动失败: ' + (e?.message || ''));
      setRendering(false);
    }
  };

  const pollRenderStatus = (pid: number) => {
    if (renderPollRef.current) window.clearInterval(renderPollRef.current);
    renderPollRef.current = window.setInterval(async () => {
      try {
        const st = await cliplite.renderStatus(pid);
        setRenderProgress(st.progress);
        if (st.status === 'done') {
          if (renderPollRef.current) window.clearInterval(renderPollRef.current);
          setRendering(false);
          setRenderUrl(cliplite.renderDownloadUrl(pid));
          message.success('渲染完成！');
        } else if (st.status === 'failed') {
          if (renderPollRef.current) window.clearInterval(renderPollRef.current);
          setRendering(false);
          message.error('渲染失败: ' + (st.error || ''));
        }
      } catch {
        // 忽略轮询错误
      }
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (renderPollRef.current) window.clearInterval(renderPollRef.current);
    };
  }, []);

  const fmtDuration = (s: number) => {
    if (!s) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const totalDuration = useCallback(() => {
    if (!project) return 0;
    let max = 0;
    project.tracks.forEach(t => t.clips.forEach(c => { if (c.timeline_end > max) max = c.timeline_end; }));
    return max;
  }, [project]);

  const timelineWidth = Math.max(800, totalDuration() * PX_PER_SEC + 100);

  return (
    <div className="app-layout">
      <div className="app-header">
        <div className="app-logo">🎬 ClipLite</div>
        <Tag color={health?.ffmpeg ? 'green' : 'red'} style={{ marginLeft: 8 }}>
          ffmpeg {health?.ffmpeg ? '✓' : '✗'}
        </Tag>
        {project && <Tag color="blue">{project.project.name}</Tag>}
        <div style={{ flex: 1 }} />
        <Upload accept="video/*,audio/*" showUploadList={false} beforeUpload={handleUpload}>
          <Button icon={<UploadOutlined />} type="primary">
            导入素材{uploadProgress > 0 && uploadProgress < 100 ? ` ${uploadProgress}%` : ''}
          </Button>
        </Upload>
        <Button icon={<PlusOutlined />} onClick={() => setCreating(true)}>新建工程</Button>
        <Button icon={<FolderOpenOutlined />} onClick={loadProjectList}>打开工程</Button>
        <Button icon={<ReloadOutlined />} onClick={refreshAssets} />
      </div>

      <div className="app-body">
        {/* 素材库 */}
        <div className="sidebar">
          <div style={{ marginBottom: 12, fontWeight: 600, color: '#a1a1aa', display: 'flex', justifyContent: 'space-between' }}>
            <span>素材库 ({assets.length})</span>
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
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.type === 'video' ? <VideoCameraOutlined /> : <AudioOutlined />} {a.filename}
                </div>
                <div style={{ color: '#71717a', fontSize: 10 }}>
                  {fmtDuration(a.duration)} · {a.width > 0 ? `${a.width}x${a.height}` : 'audio'}
                </div>
              </div>
              <Tooltip title="加到时间轴">
                <PlusCircleOutlined
                  onClick={(e) => { e.stopPropagation(); addAssetToTimeline(a); }}
                  style={{ color: '#22d3ee', fontSize: 16, marginLeft: 8 }}
                />
              </Tooltip>
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

        {/* 主区 */}
        <div className="main-content">
          <div className="preview-area">
            {renderUrl ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#22d3ee', marginBottom: 12, fontSize: 14 }}>✅ 渲染产物预览</div>
                <video src={renderUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: '70vh' }} />
                <div style={{ marginTop: 12 }}>
                  <a href={renderUrl} download>
                    <Button type="primary" icon={<ExportOutlined />}>下载视频</Button>
                  </a>
                </div>
              </div>
            ) : !selectedAsset ? (
              <div className="empty-hint">
                <VideoCameraOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <div>从左侧选择素材预览</div>
              </div>
            ) : selectedAsset.type === 'video' ? (
              <video key={selectedAsset.id} src={cliplite.assetFileUrl(selectedAsset.id)} controls autoPlay />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <AudioOutlined style={{ fontSize: 64, color: '#06b6d4' }} />
                <div style={{ marginTop: 16 }}>{selectedAsset.filename}</div>
                <audio src={cliplite.assetFileUrl(selectedAsset.id)} controls style={{ marginTop: 16 }} />
              </div>
            )}
          </div>

          {/* 时间轴 */}
          <div className="timeline-area">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#a1a1aa', fontSize: 12 }}>
                {project ? `工程: ${project.project.name} · 时长 ${fmtDuration(totalDuration())}` : '未打开工程（点击"新建工程"或"打开工程"）'}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  size="small"
                  icon={<FontSizeOutlined />}
                  disabled={!project}
                  onClick={() => { setSubStart(totalDuration()); setSubEnd(totalDuration() + 3); setSubtitleModal(true); }}
                >加字幕</Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<ExportOutlined />}
                  disabled={!project || rendering}
                  onClick={handleExport}
                  loading={rendering}
                >导出视频</Button>
              </div>
            </div>

            {rendering && (
              <Progress percent={renderProgress} size="small" style={{ marginBottom: 8 }} status="active" />
            )}

            {/* 时间标尺 */}
            <div className="ruler" style={{ width: timelineWidth }}>
              {Array.from({ length: Math.ceil(totalDuration() / 5) + 1 }).map((_, i) => (
                <div key={i} className="ruler-tick" style={{ left: i * 5 * PX_PER_SEC }}>
                  <span>{fmtDuration(i * 5)}</span>
                </div>
              ))}
            </div>

            {(project?.tracks || DEMO_TRACKS).map((track: Track) => (
              <div className="track" key={track.id}>
                <div className="track-label">
                  {track.type === 'video' ? '🎬 视频' : track.type === 'audio' ? '🎵 音乐' : '💬 字幕'}
                </div>
                <div className="track-lane" style={{ width: timelineWidth }}>
                  {track.clips && track.clips.length > 0 ? (
                    track.clips.map((clip: Clip, i: number) => (
                      <Tooltip key={i} title={
                        <div>
                          <div>{clip.text || '片段'}</div>
                          <div>{fmtDuration(clip.timeline_start)} → {fmtDuration(clip.timeline_end)}</div>
                        </div>
                      }>
                        <div
                          className={`clip-block ${track.type}`}
                          style={{
                            left: `${clip.timeline_start * PX_PER_SEC}px`,
                            width: `${Math.max(40, (clip.timeline_end - clip.timeline_start) * PX_PER_SEC)}px`,
                          }}
                        >
                          <span className="clip-text">{clip.text || (track.type === 'subtitle' ? '字幕' : '片段')}</span>
                          <DeleteOutlined
                            className="clip-del"
                            onClick={(e) => { e.stopPropagation(); removeClip(track, i); }}
                          />
                        </div>
                      </Tooltip>
                    ))
                  ) : (
                    <div className="track-empty">
                      {track.type === 'subtitle' ? '点击"加字幕"' : '点素材上的 ➕ 加入'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 新建工程 */}
      <Modal title="新建工程" open={creating} onOk={handleCreateProject} onCancel={() => setCreating(false)} okText="创建" cancelText="取消">
        <Input placeholder="工程名称" value={projectName} onChange={e => setProjectName(e.target.value)} onPressEnter={handleCreateProject} />
      </Modal>

      {/* 加字幕 */}
      <Modal title="添加字幕" open={subtitleModal} onOk={handleAddSubtitle} onCancel={() => setSubtitleModal(false)} okText="添加" cancelText="取消">
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#a1a1aa' }}>字幕内容</label>
          <Input.TextArea rows={3} placeholder="输入字幕文字" value={subText} onChange={e => setSubText(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: '#a1a1aa' }}>开始(秒)</label>
            <Input type="number" value={subStart} onChange={e => setSubStart(parseFloat(e.target.value) || 0)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: '#a1a1aa' }}>结束(秒)</label>
            <Input type="number" value={subEnd} onChange={e => setSubEnd(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
      </Modal>

      {/* 打开工程 */}
      <Modal title="打开工程" open={projectListOpen} footer={null} onCancel={() => setProjectListOpen(false)}>
        {projectList.length === 0 && <div style={{ color: '#71717a' }}>暂无工程</div>}
        {projectList.map(p => (
          <div
            key={p.id}
            className="asset-item"
            onClick={() => openProject(p.id)}
          >
            <div>
              <div>{p.name}</div>
              <div style={{ color: '#71717a', fontSize: 10 }}>{p.width}x{p.height} · {p.fps}fps</div>
            </div>
          </div>
        ))}
      </Modal>
    </div>
  );
}

const DEMO_TRACKS: Track[] = [
  { id: 0, project_id: 0, type: 'video', ord: 0, muted: false, volume: 1, clips: [] },
  { id: 1, project_id: 0, type: 'audio', ord: 1, muted: false, volume: 1, clips: [] },
  { id: 2, project_id: 0, type: 'subtitle', ord: 2, muted: false, volume: 1, clips: [] },
];
