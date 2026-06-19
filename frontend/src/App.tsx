import { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Upload, message, Tag, Modal, Input, Segmented, Progress, Tooltip, ColorPicker, Select, InputNumber, Popconfirm } from 'antd';
import {
  UploadOutlined, VideoCameraOutlined, AudioOutlined,
  PlusOutlined, ReloadOutlined, ExportOutlined, DeleteOutlined,
  PlusCircleOutlined, FontSizeOutlined, FolderOpenOutlined,
  ZoomInOutlined, ZoomOutOutlined, PlayCircleOutlined, PauseCircleOutlined,
  StepBackwardOutlined, StepForwardOutlined, AudioMutedOutlined, CloseOutlined,
} from '@ant-design/icons';
import { cliplite } from './api/client';
import type { Asset, ProjectDetail, HealthStatus, Clip, Track, TextStyle, ActiveClipInfo } from './types';

const FONT_OPTIONS = ['Arial', 'Helvetica', 'SimHei', 'Microsoft YaHei', 'SimSun', 'Georgia', 'Times New Roman', 'Courier New'];

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState('');

  // 时间轴缩放（每秒像素数）
  const [pxPerSec, setPxPerSec] = useState(24);

  // 素材库侧边栏宽度（可拖拽调整）
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const draggingRef = useRef(false);

  // 预览模式：'asset'(单素材) | 'timeline'(时间轴成片)
  const [previewMode, setPreviewMode] = useState<'asset' | 'timeline'>('asset');

  // 提取音频的格式选择（仅状态，不立即触发）
  const [extractFormat, setExtractFormat] = useState<'mp3' | 'wav' | 'aac'>('mp3');

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      // sidebar 从窗口左边算起，限制 200-560px
      const w = Math.min(560, Math.max(200, ev.clientX));
      setSidebarWidth(w);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // 时间轴播放头 + 播放
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timelineLaneRef = useRef<HTMLDivElement | null>(null);

  // 渲染
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const renderPollRef = useRef<number | null>(null);

  // 字幕编辑（含样式）
  const [subtitleModal, setSubtitleModal] = useState(false);
  const [subText, setSubText] = useState('');
  const [subStart, setSubStart] = useState(0);
  const [subEnd, setSubEnd] = useState(3);
  const [subStyle, setSubStyle] = useState<TextStyle>({
    font: 'SimHei', size: 24, color: '#FFFFFF',
    strokeColor: '#000000', outlineWidth: 2, position: 'bottom',
  });

  // 工程列表
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [projectList, setProjectList] = useState<any[]>([]);

  // 拖拽状态
  const [dragInfo, setDragInfo] = useState<{ trackId: number; index: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    cliplite.health().then(setHealth).catch(() => {});
    refreshAssets();
    // 刷新自动恢复上次打开的工程
    const lastId = localStorage.getItem('cliplite.lastProjectId');
    if (lastId) {
      cliplite.getProject(Number(lastId))
        .then(p => { setProject(p); message.info(`已恢复工程：${p.project.name}`, 2); })
        .catch(() => localStorage.removeItem('cliplite.lastProjectId')); // 工程已删则清除
    }
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
      await cliplite.extractAudio(asset.id, format);
      message.success({ content: `音频提取成功 (${format})`, key: 'extract' });
      refreshAssets();
    } catch (e: any) {
      message.error({ content: '提取失败: ' + (e?.message || ''), key: 'extract' });
    }
  };

  const handleRemoveAudio = async (asset: Asset) => {
    try {
      message.loading({ content: '去除声音中...', key: 'rmaudio', duration: 0 });
      await cliplite.removeAudio(asset.id);
      message.success({ content: '已生成无声视频', key: 'rmaudio' });
      refreshAssets();
    } catch (e: any) {
      message.error({ content: '去除声音失败: ' + (e?.message || ''), key: 'rmaudio' });
    }
  };

  const handleCreateProject = async () => {
    try {
      const p = await cliplite.createProject(projectName || '未命名工程');
      setProject(p);
      setRenderUrl(null);
      localStorage.setItem('cliplite.lastProjectId', String(p.project.id));
      message.success(`工程已创建: ${p.project.name}`);
      setCreating(false);
      setProjectName('');
    } catch (e: any) {
      message.error('创建失败: ' + (e?.message || ''));
    }
  };

  const loadProjectList = async () => {
    setProjectList(await cliplite.listProjects());
    setProjectListOpen(true);
  };

  const openProject = async (id: number) => {
    const p = await cliplite.getProject(id);
    setProject(p);
    setRenderUrl(null);
    localStorage.setItem('cliplite.lastProjectId', String(id));
    setProjectListOpen(false);
    message.success(`已打开: ${p.project.name}`);
  };

  // 关闭工程（主动退出，不再自动恢复）
  const closeProject = () => {
    stopPlayback();
    setProject(null);
    setSelectedAsset(null);
    setRenderUrl(null);
    setPlayhead(0);
    localStorage.removeItem('cliplite.lastProjectId');
    message.success('已关闭工程');
  };

  // 添加素材到时间轴
  const addAssetToTimeline = async (asset: Asset) => {
    if (!project) { message.warning('请先创建或打开工程'); return; }
    const trackType = asset.type === 'video' ? 'video' : 'audio';
    const track = project.tracks.find(t => t.type === trackType);
    if (!track) return;
    const lastEnd = track.clips.reduce((m, c) => Math.max(m, c.timeline_end), 0);
    const newClip: Clip = {
      track_id: track.id, asset_id: asset.id,
      timeline_start: lastEnd, timeline_end: lastEnd + (asset.duration || 5),
      source_start: 0, source_end: asset.duration || 5,
    };
    await cliplite.saveClips(track.id, [...track.clips, newClip]);
    setProject(await cliplite.getProject(project.project.id));
    message.success(`已添加到${trackType === 'video' ? '视频' : '音乐'}轨`);
  };

  // 删除片段
  const removeClip = async (track: Track, clipIndex: number) => {
    if (!project) return;
    await cliplite.saveClips(track.id, track.clips.filter((_, i) => i !== clipIndex));
    setProject(await cliplite.getProject(project.project.id));
  };

  // 删除素材（DB + 文件 + 关联片段）
  const deleteAsset = async (asset: Asset) => {
    try {
      await cliplite.deleteAsset(asset.id);
      if (selectedAsset?.id === asset.id) setSelectedAsset(null);
      await refreshAssets();
      // 若工程引用了该素材，刷新工程
      if (project) setProject(await cliplite.getProject(project.project.id));
      message.success('已删除素材');
    } catch (e: any) {
      message.error('删除失败: ' + (e?.message || ''));
    }
  };

  // 拖拽重排序（重新计算时间轴位置）
  const reorderClips = async (track: Track, fromIdx: number, toIdx: number) => {
    if (!project || fromIdx === toIdx) return;
    const clips = [...track.clips];
    const [moved] = clips.splice(fromIdx, 1);
    clips.splice(toIdx, 0, moved);
    // 重新紧凑排列（按新顺序累加时长）
    let cursor = 0;
    const reordered = clips.map(c => {
      const dur = c.timeline_end - c.timeline_start;
      const start = cursor;
      cursor += dur;
      return { ...c, timeline_start: start, timeline_end: cursor };
    });
    await cliplite.saveClips(track.id, reordered);
    setProject(await cliplite.getProject(project.project.id));
    message.success('已重新排序');
  };

  // 添加字幕
  const handleAddSubtitle = async () => {
    if (!project || !subText.trim()) return;
    const track = project.tracks.find(t => t.type === 'subtitle');
    if (!track) return;
    const start = subStart;
    const end = Math.max(subEnd, start + 0.5);
    const newClip: Clip = {
      track_id: track.id,
      timeline_start: start, timeline_end: end,
      text: subText.trim(),
      style_json: JSON.stringify(subStyle),
    };
    await cliplite.saveClips(track.id, [...track.clips, newClip]);
    setProject(await cliplite.getProject(project.project.id));
    setSubText('');
    setSubtitleModal(false);
    message.success('字幕已添加');
  };

  const handleExport = async () => {
    if (!project) return;
    const videoTrack = project.tracks.find(t => t.type === 'video');
    if (!videoTrack || videoTrack.clips.length === 0) {
      message.warning('视频轨为空，请先添加视频片段'); return;
    }
    setRendering(true); setRenderProgress(0); setRenderUrl(null);
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
      } catch {}
    }, 1500);
  };

  useEffect(() => () => { if (renderPollRef.current) window.clearInterval(renderPollRef.current); }, []);

  const fmtDuration = (s: number) => {
    if (!s) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const totalDuration = useCallback(() => {
    if (!project) return 0;
    let max = 0;
    project.tracks.forEach(t => t.clips.forEach(c => { if (c.timeline_end > max) max = c.timeline_end; }));
    return max;
  }, [project]);

  const timelineWidth = Math.max(800, totalDuration() * pxPerSec + 100);
  const tracks = project?.tracks || DEMO_TRACKS;

  // 解析字幕片段样式用于预览
  const parseStyle = (clip: Clip): TextStyle => {
    try { return clip.style_json ? JSON.parse(clip.style_json) : {}; }
    catch { return {}; }
  };

  // === 时间轴播放头 / 预览 ===
  // 找覆盖某时间点的视频片段 + 对应素材 + 片段内偏移
  const findVideoClipAt = useCallback((time: number): ActiveClipInfo | null => {
    if (!project) return null;
    const vtrack = project.tracks.find(t => t.type === 'video');
    if (!vtrack) return null;
    for (const clip of vtrack.clips) {
      if (time >= clip.timeline_start && time < clip.timeline_end) {
        const asset = assets.find(a => a.id === clip.asset_id);
        if (!asset) continue;
        const offset = (clip.source_start || 0) + (time - clip.timeline_start);
        return { clip, asset, offsetInClip: Math.max(0, offset) };
      }
    }
    return null;
  }, [project, assets]);

  // 当前激活片段（驱动预览）
  const activeClip = findVideoClipAt(playhead);
  // 用 ref 在 rAF 里拿最新值，避免闭包过期
  const activeClipRef = useRef<ActiveClipInfo | null>(activeClip);
  activeClipRef.current = activeClip;

  // 拖/点时间轴 → 设播放头 + 切到时间轴预览
  const seekToMouse = (e: React.MouseEvent) => {
    const lane = timelineLaneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const t = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    setPlayhead(Math.min(t, totalDuration()));
    setPreviewMode('timeline');
  };

  // 停止播放
  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const v = videoRef.current;
    if (v) v.pause();
  }, []);

  // 播放循环：根据视频 currentTime 同步播放头，跨片段自动切换
  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => {
      const v = videoRef.current;
      const info = activeClipRef.current;
      const dur = totalDuration();
      if (!v || !info) { rafRef.current = requestAnimationFrame(tick); return; }
      // 用视频 currentTime 反推时间轴位置
      const tl = info.clip.timeline_start + (v.currentTime - (info.clip.source_start || 0));
      if (!isNaN(tl)) setPlayhead(tl);
      // 片段播完：推进到下一片段（触发 activeClip 切换 → video remount → onCanPlay 续播）
      const clipEnd = info.clip.source_end || (info.clip.source_start || 0) + (info.clip.timeline_end - info.clip.timeline_start);
      if (v.currentTime >= clipEnd - 0.05 || tl >= dur) {
        const next = Math.min(tl + 0.05, dur);
        setPlayhead(next);
        if (next >= dur) { stopPlayback(); return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);

  // 播放/暂停
  const togglePlay = async () => {
    setPreviewMode('timeline');
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) { stopPlayback(); return; }
    const dur = totalDuration();
    if (dur <= 0) return;
    let info = activeClip;
    if (!info || playhead >= dur) {
      setPlayhead(0);
      // 下一帧再播
      return;
    }
    try { v.currentTime = info.offsetInClip; } catch {}
    try {
      await v.play();
      setIsPlaying(true);
    } catch (e) {
      message.warning('浏览器阻止了自动播放，请再点一次播放');
    }
  };

  // 视频加载就绪：seek 到片段偏移；若处于播放态则继续播
  const onVideoReady = () => {
    const v = videoRef.current;
    if (!v || !activeClipRef.current) return;
    const off = activeClipRef.current.offsetInClip;
    if (Math.abs(v.currentTime - off) > 0.1) {
      try { v.currentTime = off; } catch {}
    }
    if (isPlaying) v.play().catch(() => {});
  };

  // 暂停时：把视频 seek 到播放头对应的帧（所见即所得）
  useEffect(() => {
    if (isPlaying) return;
    const v = videoRef.current;
    if (!v || !activeClip) return;
    if (Math.abs(v.currentTime - activeClip.offsetInClip) > 0.1) {
      try { v.currentTime = activeClip.offsetInClip; } catch {}
    }
  }, [playhead, activeClip, isPlaying]);

  // 切换工程 / 删除片段时停止播放
  useEffect(() => { stopPlayback(); setPlayhead(0); }, [project?.project.id]);

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
        {project && <Button danger ghost icon={<CloseOutlined />} onClick={closeProject}>关闭工程</Button>}
        <Button icon={<ReloadOutlined />} onClick={refreshAssets} />
      </div>

      <div className="app-body">
        <div className="sidebar" style={{ width: sidebarWidth, flexShrink: 0 }}>
          <div style={{ marginBottom: 12, fontWeight: 600, color: '#a1a1aa' }}>素材库 ({assets.length})</div>
          {assets.length === 0 && (
            <div style={{ color: '#71717a', fontSize: 12, padding: 16, textAlign: 'center' }}>点击右上角"导入素材"上传视频/音频</div>
          )}
          {assets.map(a => (
            <div key={a.id} className="asset-item" onClick={() => { setSelectedAsset(a); setPreviewMode('asset'); }} style={selectedAsset?.id === a.id ? { background: '#52525b' } : {}}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.filename}>
                  {a.type === 'video' ? <VideoCameraOutlined /> : <AudioOutlined />} {a.filename}
                </div>
                <div style={{ color: '#71717a', fontSize: 10 }}>{fmtDuration(a.duration)} · {a.width > 0 ? `${a.width}x${a.height}` : 'audio'}</div>
              </div>
              <Tooltip title="加到时间轴">
                <PlusCircleOutlined onClick={(e) => { e.stopPropagation(); addAssetToTimeline(a); }} style={{ color: '#22d3ee', fontSize: 16, marginLeft: 8 }} />
              </Tooltip>
              <Popconfirm
                title="删除该素材？"
                description="将同时删除素材文件和时间轴中引用它的片段"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={(e) => { e?.stopPropagation(); deleteAsset(a); }}
                onCancel={(e) => e?.stopPropagation()}
              >
                <DeleteOutlined onClick={(e) => e.stopPropagation()} style={{ color: '#71717a', fontSize: 14, marginLeft: 6 }} />
              </Popconfirm>
            </div>
          ))}
          {selectedAsset && selectedAsset.type === 'video' && (
            <div style={{ marginTop: 16, padding: 12, background: '#27272a', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 8 }}>音视频处理：</div>
              <div style={{ fontSize: 11, color: '#71717a', marginBottom: 6 }}>提取音频（保存为独立音频文件）</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Segmented value={extractFormat} onChange={(v) => setExtractFormat(v as any)} options={[{ label: 'MP3', value: 'mp3' }, { label: 'WAV', value: 'wav' }, { label: 'AAC', value: 'aac' }]} />
                <Button size="small" type="primary" icon={<ExportOutlined />} onClick={() => handleExtractAudio(selectedAsset, extractFormat)}>提取</Button>
              </div>
              <div style={{ borderTop: '1px solid #3f3f46', margin: '12px 0 8px' }} />
              <div style={{ fontSize: 11, color: '#71717a', marginBottom: 6 }}>去除声音（只保留画面，生成无声视频）</div>
              <Popconfirm
                title="去除该视频的声音？"
                description="会生成一个新的无声视频素材（原视频保留）"
                okText="去除" cancelText="取消"
                onConfirm={() => handleRemoveAudio(selectedAsset)}
              >
                <Button size="small" block icon={<AudioMutedOutlined />}>去除声音</Button>
              </Popconfirm>
            </div>
          )}
        </div>

        {/* 可拖拽分隔条 */}
        <div className="sidebar-resizer" onMouseDown={startResize} title="拖动调整素材库宽度" />

        <div className="main-content">
          <div className="preview-area">
            {renderUrl ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#22d3ee', marginBottom: 12, fontSize: 14 }}>✅ 渲染产物预览</div>
                <video src={renderUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: '70vh' }} />
                <div style={{ marginTop: 12 }}>
                  <a href={renderUrl} download><Button type="primary" icon={<ExportOutlined />}>下载视频</Button></a>
                </div>
              </div>
            ) : previewMode === 'timeline' && project && totalDuration() > 0 ? (
              // 时间轴驱动预览：显示播放头对应的视频帧
              <div style={{ textAlign: 'center', width: '100%' }}>
                {/* 模式切换提示 */}
                <div className="preview-mode-hint">
                  <span>⏱ 时间轴预览</span>
                  {selectedAsset && (
                    <Button type="link" size="small" onClick={() => setPreviewMode('asset')}>
                      ← 返回素材预览（{selectedAsset.filename.slice(0, 16)}）
                    </Button>
                  )}
                </div>
                {activeClip ? (
                  <video
                    key={activeClip.asset.id}
                    ref={videoRef}
                    src={cliplite.assetFileUrl(activeClip.asset.id)}
                    onLoadedData={onVideoReady}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => stopPlayback()}
                    style={{ maxWidth: '100%', maxHeight: '56vh' }}
                  />
                ) : (
                  <div className="empty-hint"><VideoCameraOutlined style={{ fontSize: 48, marginBottom: 16 }} /><div>播放头不在视频片段上，点击时间轴选择位置</div></div>
                )}
                {/* 播放控制条 */}
                <div className="playback-bar">
                  <Button shape="circle" icon={<StepBackwardOutlined />} disabled={playhead <= 0}
                    onClick={() => { stopPlayback(); setPlayhead(0); }} />
                  <Button shape="circle" size="large" type="primary"
                    icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    disabled={!activeClip}
                    onClick={togglePlay} />
                  <Button shape="circle" icon={<StepForwardOutlined />} disabled={playhead >= totalDuration()}
                    onClick={() => { stopPlayback(); setPlayhead(totalDuration()); }} />
                  <span className="time-readout">{fmtDuration(playhead)} / {fmtDuration(totalDuration())}</span>
                </div>
              </div>
            ) : !selectedAsset ? (
              <div className="empty-hint"><VideoCameraOutlined style={{ fontSize: 48, marginBottom: 16 }} /><div>从左侧选择素材预览，或添加片段到时间轴</div></div>
            ) : (
              <div style={{ textAlign: 'center', width: '100%' }}>
                {/* 素材预览模式 + 可切换到时间轴 */}
                {project && totalDuration() > 0 && (
                  <div className="preview-mode-hint">
                    <span>🎬 素材预览：{selectedAsset.filename}</span>
                    <Button type="link" size="small" onClick={() => setPreviewMode('timeline')}>
                      切换到时间轴预览 →
                    </Button>
                  </div>
                )}
                {selectedAsset.type === 'video' ? (
                  <video key={selectedAsset.id} src={cliplite.assetFileUrl(selectedAsset.id)} controls autoPlay style={{ maxWidth: '100%', maxHeight: '60vh' }} />
                ) : (
                  <div>
                    <AudioOutlined style={{ fontSize: 64, color: '#06b6d4' }} />
                    <div style={{ marginTop: 16 }}>{selectedAsset.filename}</div>
                    <audio src={cliplite.assetFileUrl(selectedAsset.id)} controls style={{ marginTop: 16 }} />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="timeline-area">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#a1a1aa', fontSize: 12 }}>
                {project ? `工程: ${project.project.name} · 时长 ${fmtDuration(totalDuration())}` : '未打开工程'}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* 缩放控制 */}
                <Button.Group size="small">
                  <Button icon={<ZoomOutOutlined />} onClick={() => setPxPerSec(p => Math.max(8, p - 6))} />
                  <span style={{ color: '#71717a', fontSize: 11, padding: '0 8px' }}>{pxPerSec}px/s</span>
                  <Button icon={<ZoomInOutlined />} onClick={() => setPxPerSec(p => Math.min(120, p + 6))} />
                </Button.Group>
                <Button size="small" icon={<FontSizeOutlined />} disabled={!project}
                  onClick={() => { setSubStart(totalDuration()); setSubEnd(totalDuration() + 3); setSubtitleModal(true); }}>加字幕</Button>
                <Button size="small" type="primary" icon={<ExportOutlined />} disabled={!project || rendering} onClick={handleExport} loading={rendering}>导出视频</Button>
              </div>
            </div>

            {rendering && <Progress percent={renderProgress} size="small" style={{ marginBottom: 8 }} status="active" />}

            {/* 时间标尺（可点击定位播放头）*/}
            <div className="ruler" style={{ width: timelineWidth }} onClick={seekToMouse}>
              {Array.from({ length: Math.ceil(totalDuration() / 5) + 1 }).map((_, i) => (
                <div key={i} className="ruler-tick" style={{ left: i * 5 * pxPerSec }}><span>{fmtDuration(i * 5)}</span></div>
              ))}
              {/* 播放头标尺指示 */}
              {totalDuration() > 0 && (
                <div className="playhead-marker" style={{ left: playhead * pxPerSec }} title={fmtDuration(playhead)} />
              )}
            </div>

            {tracks.map((track: Track) => (
              <div className="track" key={track.id}>
                <div className="track-label">{track.type === 'video' ? '🎬 视频' : track.type === 'audio' ? '🎵 音乐' : '💬 字幕'}</div>
                <div
                  className="track-lane"
                  ref={track.type === 'video' ? timelineLaneRef : undefined}
                  style={{ width: timelineWidth, cursor: project ? 'pointer' : 'default' }}
                  onClick={project ? seekToMouse : undefined}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { setDragOverIndex(null); }}
                >
                  {/* 播放头竖线（贯穿每个轨道）*/}
                  {project && totalDuration() > 0 && (
                    <div className="playhead-line" style={{ left: playhead * pxPerSec }} />
                  )}
                  {track.clips && track.clips.length > 0 ? (
                    track.clips.map((clip: Clip, i: number) => {
                      const st = parseStyle(clip);
                      return (
                      <Tooltip key={i} title={<div><div>{clip.text || '片段'}</div><div>{fmtDuration(clip.timeline_start)} → {fmtDuration(clip.timeline_end)}</div>{track.type === 'subtitle' && st.font && <div>字体:{st.font} {st.size}px</div>}</div>}>
                        <div
                          className={`clip-block ${track.type}${dragOverIndex === i ? ' drag-over' : ''}`}
                          draggable
                          onDragStart={() => setDragInfo({ trackId: track.id, index: i })}
                          onDragOver={(e) => { e.preventDefault(); if (dragInfo?.trackId === track.id) setDragOverIndex(i); }}
                          onDrop={(e) => {
                            e.stopPropagation();
                            if (dragInfo && dragInfo.trackId === track.id) {
                              reorderClips(track, dragInfo.index, i);
                            }
                            setDragInfo(null); setDragOverIndex(null);
                          }}
                          onDragEnd={() => { setDragInfo(null); setDragOverIndex(null); }}
                          style={{
                            left: `${clip.timeline_start * pxPerSec}px`,
                            width: `${Math.max(40, (clip.timeline_end - clip.timeline_start) * pxPerSec)}px`,
                          }}
                        >
                          <span className="clip-text">{clip.text || (track.type === 'subtitle' ? '字幕' : '片段')}</span>
                          {track.type === 'subtitle' && st.color && (
                            <span className="clip-swatch" style={{ background: st.color, border: `1px solid ${st.strokeColor || '#000'}` }} />
                          )}
                          <DeleteOutlined className="clip-del" onClick={(e) => { e.stopPropagation(); removeClip(track, i); }} />
                        </div>
                      </Tooltip>
                      );
                    })
                  ) : (
                    <div className="track-empty">{track.type === 'subtitle' ? '点击"加字幕"' : '点素材 ➕ 加入，可拖拽排序'}</div>
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

      {/* 加字幕（含样式） */}
      <Modal title="添加字幕" open={subtitleModal} onOk={handleAddSubtitle} onCancel={() => setSubtitleModal(false)} okText="添加" cancelText="取消" width={520}>
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">字幕内容</label>
          <Input.TextArea rows={2} placeholder="输入字幕文字" value={subText} onChange={e => setSubText(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="field-label">开始(秒)</label>
            <InputNumber value={subStart} onChange={v => setSubStart(v || 0)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">结束(秒)</label>
            <InputNumber value={subEnd} onChange={v => setSubEnd(v || 0)} style={{ width: '100%' }} />
          </div>
        </div>
        <div className="style-section">
          <div className="style-title">字幕样式</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">字体</label>
              <Select value={subStyle.font} onChange={v => setSubStyle({ ...subStyle, font: v })} style={{ width: '100%' }}
                options={FONT_OPTIONS.map(f => ({ label: f, value: f }))} />
            </div>
            <div>
              <label className="field-label">字号</label>
              <InputNumber value={subStyle.size} onChange={v => setSubStyle({ ...subStyle, size: v || 24 })} style={{ width: '100%' }} min={8} max={120} />
            </div>
            <div>
              <label className="field-label">文字颜色</label>
              <ColorPicker value={subStyle.color} onChange={c => setSubStyle({ ...subStyle, color: c.toHexString() })} showText />
            </div>
            <div>
              <label className="field-label">描边颜色</label>
              <ColorPicker value={subStyle.strokeColor} onChange={c => setSubStyle({ ...subStyle, strokeColor: c.toHexString() })} showText />
            </div>
            <div>
              <label className="field-label">描边宽度</label>
              <InputNumber value={subStyle.outlineWidth} onChange={v => setSubStyle({ ...subStyle, outlineWidth: v || 0 })} style={{ width: '100%' }} min={0} max={10} />
            </div>
            <div>
              <label className="field-label">位置</label>
              <Select value={subStyle.position} onChange={v => setSubStyle({ ...subStyle, position: v })} style={{ width: '100%' }}
                options={[{ label: '顶部', value: 'top' }, { label: '中间', value: 'center' }, { label: '底部', value: 'bottom' }]} />
            </div>
          </div>
          {/* 实时预览 */}
          <div className="subtitle-preview" style={{ justifyContent: subStyle.position === 'top' ? 'flex-start' : subStyle.position === 'center' ? 'center' : 'flex-end' }}>
            <span style={{
              fontFamily: subStyle.font, fontSize: subStyle.size,
              color: subStyle.color,
              WebkitTextStroke: subStyle.outlineWidth ? `${subStyle.outlineWidth}px ${subStyle.strokeColor}` : 'none',
            }}>
              {subText || '字幕预览效果'}
            </span>
          </div>
        </div>
      </Modal>

      {/* 打开工程 */}
      <Modal title="打开工程" open={projectListOpen} footer={null} onCancel={() => setProjectListOpen(false)}>
        {projectList.length === 0 && <div style={{ color: '#71717a' }}>暂无工程</div>}
        {projectList.map(p => (
          <div key={p.id} className="asset-item" onClick={() => openProject(p.id)}>
            <div><div>{p.name}</div><div style={{ color: '#71717a', fontSize: 10 }}>{p.width}x{p.height} · {p.fps}fps</div></div>
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
