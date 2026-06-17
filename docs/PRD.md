# ClipLite — 轻量级视频剪辑工具 PRD

> 版本：v1.0 · 状态：需求评审 · 日期：2026-06-17

---

## 一、项目概述

### 1.1 产品定位
**ClipLite** 是一款轻量级视频剪辑工具，模仿「剪映」的核心剪辑体验，但功能聚焦——只做四件事，做到好用：**拼接视频、添加音乐、添加字幕、提取音频**。

### 1.2 设计理念
- **前后端分离**：Go 后端做重活（ffmpeg 渲染、ASR 代理），React 前端做交互（时间轴、预览）
- **单二进制部署**：Go 编译 + embed 前端，一个可执行文件跑起来，Linux/macOS 通吃
- **不做大而全**：不碰特效、滤镜、AI 美颜、关键帧动画等专业功能
- **做精核心流程**：让用户 5 分钟内完成"导入→剪辑→导出"
- **数据可持久**：SQLite3 存工程/素材/历史，刷新不丢，可多设备访问

### 1.3 一句话价值主张
> "自部署的视频剪辑工具——Go 后端跑原生 ffmpeg，5 分钟拼好视频、配好音乐字幕，工程数据 SQLite 持久化，全平台浏览器访问。"

---

## 二、目标用户

| 用户画像 | 核心诉求 |
|---------|---------|
| 短视频新手 | 门槛低、上手快、导出无水印 |
| Vlog 爱好者 | 多段拼接 + 配乐 + 字幕 |
| 自媒体创作者 | 批量处理、音频提取做播客 |
| 知识分享者 | 录屏拼接 + 字幕讲解 |

**非目标用户**：专业剪辑师、需要调色/特效/绿幕的用户。

---

## 三、功能需求（核心四大功能）

### F1. 视频拼接

**用户故事**：作为创作者，我想把多段视频按顺序拼成一个完整视频。

| 需求项 | 说明 | 优先级 |
|--------|------|--------|
| 导入多视频 | 支持批量导入 mp4/mov/mkv/avi，拖拽或文件选择 | P0 |
| 时间轴排序 | 拖拽片段调整顺序，可视化时间轴 | P0 |
| 片段裁剪 | 设置每个片段的入点/出点（裁头去尾） | P0 |
| 片段删除 | 从时间轴移除片段 | P0 |
| 转场效果 | 简单淡入淡出 / 黑场过渡（不做花哨转场） | P1 |
| 片段复制 | 复制片段到时间轴 | P2 |

**输入输出**
- 输入：N 个视频文件
- 输出：1 个拼接后的视频文件

---

### F2. 添加音乐

**用户故事**：作为创作者，我想给我的视频配上背景音乐。

| 需求项 | 说明 | 优先级 |
|--------|------|--------|
| 导入音频 | 支持 mp3/wav/aac/m4a | P0 |
| 音频轨道 | 独立音轨，与视频轨并列 | P0 |
| 原音控制 | 保留/静音原视频声音（开关） | P0 |
| 音量调节 | 背景音乐音量 0-200% | P0 |
| 淡入淡出 | 音乐首尾淡入淡出（秒数可调） | P1 |
| 对齐时长 | 音乐自动裁剪/循环到视频长度 | P1 |
| 多音轨 | 支持多段音乐拼接 | P2 |

**输入输出**
- 输入：视频 + 1~N 个音频文件
- 输出：合成带背景音的视频

---

### F3. 添加字幕

**用户故事**：作为创作者，我想给视频添加字幕让观众更好理解。

| 需求项 | 说明 | 优先级 |
|--------|------|--------|
| 手动添加 | 文本框输入字幕内容 | P0 |
| 时间区间 | 设置字幕显示起止时间 | P0 |
| 字幕轨道 | 独立字幕轨，可视化时间块 | P0 |
| 文字样式 | 字体、字号、颜色、描边 | P0 |
| 位置 | 顶部/中部/底部，可拖拽 | P0 |
| 批量编辑 | 复制字幕样式到所有 | P1 |
| 字幕导入 | 导入 SRT / VTT 字幕文件 | P1 |
| 语音转字幕 (ASR) | 调用用户自带 ASR API 自动生成字幕（**本期暂不做，后期阶段实现**） | 后期 |

**输入输出**
- 输入：字幕文本 + 时间区间
- 输出：硬字幕（烧录到画面）或软字幕（可选）

#### F3.1 ASR 集成说明（用户自带 API，后端代理）

| 项 | 设计 |
|----|------|
| **API 来源** | 用户提供（设置页填入 Endpoint URL + Auth Key），不内置任何 ASR 服务 |
| **调用方式** | **Go 后端代理转发**（浏览器不直连 ASR API），天然解决 CORS、隐藏 Key |
| **输入** | 从视频中提取的音频片段（mp3/wav，由后端 ffmpeg 生成） |
| **期望输出** | 带时间戳的文本片段（后端归一化为 `{text, start, end}[]`） |
| **协议适配** | 后端实现协议模板（兼容 OpenAI Whisper / 阿里云 / 自定义 JSON 映射） |
| **Key 存储** | AES 加密存 SQLite `asr_configs` 表，不暴露给前端 |
| **失败处理** | API 超时/报错时降级为手动输入，保留已识别部分 |
| **隐私** | 仅音频片段经后端转发到用户自己的 ASR API，不经任何第三方 |

**配置示例（设置页 → POST /api/asr/config）**：
```
ASR Endpoint:  https://your-api.com/v1/transcribe
Auth Header:   Authorization: Bearer xxx
协议模板:       [whisper] / [aliyun] / [custom]
语言:          zh / en / auto
```

**调用流程**：
```
前端：选视频片段 → POST /api/asr {asset_id, start, end}
后端：ffmpeg 抽音频 → 转发用户 ASR API → 解析归一化 → 写入 clips 表
       → 返回字幕 clips 数组给前端
```

---

### F4. 音频提取

**用户故事**：作为播客创作者，我想从视频里把音频单独抽出来用。

| 需求项 | 说明 | 优先级 |
|--------|------|--------|
| 选择视频 | 单选/多选视频文件 | P0 |
| 一键提取 | 提取完整音频轨 | P0 |
| 格式选择 | 导出 mp3 / wav / aac | P0 |
| 片段提取 | 提取指定时间段的音频 | P1 |
| 批量处理 | 多视频批量提取 | P1 |
| 质量选择 | 码率/采样率可选 | P2 |

**输入输出**
- 输入：视频文件
- 输出：独立音频文件

---

## 四、非功能需求

| 维度 | 要求 |
|------|------|
| **性能** | 1 分钟 1080p 视频导出 < 30 秒（Go 后端原生 ffmpeg） |
| **兼容格式** | 输入：mp4/mov/mkv/webm/avi；输出：mp4(h264+aac) |
| **稳定性** | ffmpeg 子进程崩溃不影响主服务；任务可重试 |
| **响应式** | 前端预览流畅，API 响应 < 200ms（渲染除外） |
| **目标平台** | **Linux + macOS**（核心目标），后端 Go 单二进制跨平台编译 |
| **浏览器** | Linux: Chrome / Firefox；macOS: Chrome / Firefox / Safari |
| **并发** | worker pool 限制并行渲染数（默认 = CPU 核数） |
| **存储** | SQLite3（元数据）+ 本地文件系统（素材/产物） |
| **隐私** | 用户自部署；素材存服务器，传输加密；ASR 仅音频片段经用户自己的 API |
| **部署** | 单二进制 + embed 前端，1 核 2G VPS 即可运行 |

---

## 五、技术架构（Go 后端 + React 前端 + SQLite3）

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│         前端：React SPA (浏览器)                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐         │
│  │ 素材库    │  │ 时间轴    │  │ 预览播放器  │         │
│  └──────────┘  └──────────┘  └────────────┘         │
│         axios / fetch  →  REST + JSON               │
└─────────────────────┬───────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────┐
│         后端：Go 服务 (单二进制)                      │
│  ┌────────────────────────────────────────────┐     │
│  │  HTTP API 层 (Gin)                          │     │
│  │  /api/upload  /api/project  /api/render     │     │
│  │  /api/extract /api/subtitles /api/asr       │     │
│  └────────────────────────────────────────────┘     │
│  ┌──────────────────┐  ┌────────────────────────┐   │
│  │ ffmpeg (原生)     │  │  ASR 代理              │   │
│  │ os/exec 子进程    │  │  转发用户 API，隐藏 key │   │
│  │ 拼接/混音/字幕/抽音│  │  解决 CORS            │   │
│  └──────────────────┘  └────────────────────────┘   │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
   SQLite3 (data.db)         本地文件系统 (storage/)
   - users / projects        - uploads/   原始素材
   - clips / tracks          - renders/   导出产物
   - subtitles / assets      - thumbnails/ 缩略图
```

### 5.2 技术选型

| 层 | 技术选型 | 理由 |
|----|---------|------|
| **前端框架** | React 18 + TypeScript + Vite | 生态成熟、组件化适合时间轴 |
| **HTTP 客户端** | axios / fetch + React Query | 请求缓存、loading 状态管理 |
| **UI 库** | Ant Design 5 / Tailwind CSS | 快速搭建工具型界面 |
| **状态管理** | Zustand | 时间轴状态复杂，轻量且好用 |
| **时间轴** | 自研（canvas 渲染波形/缩略图） | 多轨编辑必需 |
| **预览** | 原生 `<video>` + Web Audio API | 流畅播放 + 实时混音预览 |
| **后端语言** | **Go 1.22+** | 单二进制部署、并发强、ffmpeg 调用稳定 |
| **Web 框架** | **Gin** | 最流行的 Go HTTP 框架，中间件生态好 |
| **视频引擎** | **原生 ffmpeg**（os/exec 调用） | 比 wasm 快 3-5 倍，无浏览器内存限制 |
| **数据库** | **SQLite3**（`modernc.org/sqlite` 纯 Go 驱动） | 单文件、零配置、单机足够；纯 Go 驱动免 CGO |
| **ORM** | sqlx / GORM | sqlx 轻、GORM 全功能；MVP 用 sqlx |
| **文件存储** | 本地文件系统（按 project_id 分目录） | 视频大文件不入库，DB 只存路径 |
| **ASR 代理** | Go HTTP client 转发 | 隐藏用户 API key、解决浏览器 CORS |
| **部署** | 单二进制 + 前端 dist（Go embed 静态资源） | 一个可执行文件搞定，Docker 可选 |

### 5.3 核心 API 设计（REST）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/upload` | POST | 上传视频/音频素材（multipart） |
| `/api/assets` | GET | 列出用户素材 |
| `/api/assets/:id` | DELETE | 删除素材 |
| `/api/projects` | GET/POST | 工程 CRUD |
| `/api/projects/:id` | GET/PUT/DELETE | 单个工程（含 tracks/clips） |
| `/api/render` | POST | 提交渲染任务（拼接+配乐+字幕） |
| `/api/render/:job` | GET | 查询渲染进度（SSE 或轮询） |
| `/api/extract-audio` | POST | 从视频提取音频 |
| `/api/probe` | POST | 获取视频元信息（ffprobe，时长/分辨率/编码） |
| `/api/thumbnail` | POST | 生成视频缩略图（时间轴用） |
| `/api/asr` | POST | **转发用户 ASR API**（音频 → 字幕） |
| `/api/asr/config` | PUT/GET | 配置用户 ASR endpoint/key（加密存储） |
| `/api/files/:id` | GET | 下载/预览产物（带 token） |

### 5.4 ffmpeg 命令映射（Go 后端 os/exec 调用）

| 功能 | ffmpeg 命令核心 |
|------|----------------|
| 视频拼接 | `ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4` |
| 添加音乐 | `ffmpeg -i video.mp4 -i music.mp3 -filter_complex amix out.mp4` |
| 烧录字幕 | `ffmpeg -i video.mp4 -vf subtitles=sub.srt out.mp4` |
| 提取音频 | `ffmpeg -i video.mp4 -vn -acodec libmp3lame out.mp3` |
| 探测元信息 | `ffprobe -v quiet -print_format json -show_format -show_streams in.mp4` |
| 缩略图 | `ffmpeg -ss 1 -i in.mp4 -vframes 1 -s 320x180 thumb.jpg` |

> 后端用 `exec.CommandContext` 调 ffmpeg，配合 context 控制超时；
> 渲染进度通过解析 ffmpeg stderr 的 `frame=` `time=` 实时推送前端（SSE）。

### 5.5 数据持久化（SQLite3 表结构）

```sql
-- 用户（MVP 可单用户，预留多用户）
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 素材
CREATE TABLE assets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,          -- video / audio
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,  -- 文件系统路径
  duration REAL,               -- 秒
  width INTEGER, height INTEGER,
  codec TEXT,
  size_bytes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 工程
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  width INTEGER DEFAULT 1920,
  height INTEGER DEFAULT 1080,
  fps INTEGER DEFAULT 30,
  thumbnail_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 轨道
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  type TEXT NOT NULL,          -- video / audio / subtitle
  ord INTEGER NOT NULL,        -- 轨道顺序
  muted INTEGER DEFAULT 0,
  volume REAL DEFAULT 1.0
);

-- 片段
CREATE TABLE clips (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL,
  asset_id INTEGER,            -- 关联素材（字幕可为空）
  timeline_start REAL NOT NULL,
  timeline_end REAL NOT NULL,
  source_start REAL,
  source_end REAL,
  text TEXT,                   -- 字幕文本
  style_json TEXT,             -- TextStyle JSON
  fade_in REAL, fade_out REAL
);

-- 渲染任务
CREATE TABLE render_jobs (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  status TEXT NOT NULL,        -- queued / running / done / failed
  progress INTEGER DEFAULT 0,  -- 0-100
  output_path TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME
);

-- ASR 配置（加密存储 key）
CREATE TABLE asr_configs (
  user_id INTEGER PRIMARY KEY,
  endpoint TEXT NOT NULL,
  auth_key_enc BLOB,           -- AES 加密
  protocol TEXT,               -- whisper / aliyun / custom
  language TEXT DEFAULT 'auto'
);
```

### 5.6 ASR 集成（后端代理，简化版）

相比之前的纯前端方案，**后端代理让 ASR 集成更简单**：

| 优势 | 说明 |
|------|------|
| 解决 CORS | 浏览器不直连 ASR API，由 Go 后端转发 |
| 隐藏 Key | API key 加密存 SQLite，不暴露给前端 |
| 统一协议 | 后端做协议适配（whisper/aliyun/custom → 统一返回 `{text,start,end}[]`） |
| 流程闭环 | 提取音频 → ASR → 直接写入 clips 表，前端只刷新 |

**流程**：
```
前端：选视频 → POST /api/asr {asset_id, range}
后端：ffmpeg 提取音频片段 → 转发用户 ASR API → 解析响应 → 生成字幕 clips
       → 返回 clips 数组给前端渲染到字幕轨
```

### 5.7 部署形态

**单二进制 + embed 静态资源**（推荐）：
```
cliplite-server (单个可执行文件，~30MB)
├── embed.FS 嵌入 React build 产物
├── 启动时初始化 data.db (SQLite)
├── 创建 storage/ 目录
└── 监听 :16014
```

启动一行：`./cliplite-server`，访问 `http://your-server:16014` 即用。
Docker 化可选：`Dockerfile` + volume 挂载 `data.db` 和 `storage/`。

### 5.8 关键约束与应对

| 约束 | 影响 | 应对 |
|------|------|------|
| 上传大文件占带宽/磁盘 | 服务器成本 | 限制单文件 < 2GB；分片上传；定期清理 |
| ffmpeg 渲染占 CPU | 并发受限 | 任务队列 + worker pool；超时取消 |
| SQLite 并发写 | 多用户写入冲突 | WAL 模式；写操作串行化 |
| 部署需服务器 | 非零成本 | 1 核 2G VPS (~$5/月) 足够个人/小团队 |
| 素材存服务器 | 隐私变化 | 可选自部署；传输加密；定期清理策略 |

### 5.9 Linux / macOS 平台支持

**Go 单二进制 + Web 前端 = 全平台零安装运行**：

| 维度 | Linux | macOS |
|------|-------|-------|
| 后端运行 | Go 交叉编译 linux/amd64 二进制 | darwin/amd64 + darwin/arm64 (Apple Silicon) |
| ffmpeg 依赖 | `apt install ffmpeg` 或静态链接 | `brew install ffmpeg` 或打包 |
| 浏览器 | Chrome / Firefox | Chrome / Firefox / Safari |
| 部署方式 | systemd 服务 + nginx 反代 | launchd / 直接运行 |

**测试矩阵**：
| 组合 | 必测 |
|------|------|
| Linux 服务器 + Chrome 客户端 | ✅ |
| Linux 服务器 + Firefox 客户端 | ✅ |
| macOS 服务器 + Safari 客户端 | ✅ |
| macOS 服务器 + Chrome 客户端 | ✅ |
| Docker 部署 | ⚪ 抽测 |

---

## 六、数据模型（TypeScript 视图模型，对应 SQLite3 表）

> 后端 Go struct ↔ SQLite3 表（见 5.5）；前端 React 用以下 TypeScript 类型对接 API。

```typescript
// 工程文件（对应 projects 表 + 关联 tracks/clips）
interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  resolution: { width: number; height: number };  // 默认 1920x1080
  fps: number;                                      // 默认 30
  tracks: Track[];
}

// 轨道（视频轨/音频轨/字幕轨）
interface Track {
  id: string;
  type: 'video' | 'audio' | 'subtitle';
  clips: Clip[];
  muted?: boolean;
  volume?: number;  // 音轨音量
}

// 片段（时间轴上的一个块）
interface Clip {
  id: string;
  sourcePath: string;          // 源文件路径
  type: 'video' | 'audio' | 'text';
  // 在时间轴上的位置
  timelineStart: number;       // 秒
  timelineEnd: number;
  // 源文件内的截取范围
  sourceStart: number;
  sourceEnd: number;
  // 文本片段（字幕专用）
  text?: string;
  style?: TextStyle;
  // 音频属性
  fadeIn?: number;
  fadeOut?: number;
}

interface TextStyle {
  font: string;
  size: number;
  color: string;
  strokeColor?: string;
  position: 'top' | 'center' | 'bottom';
  x?: number; y?: number;
}
```

---

## 七、UI / UX 设计

### 7.1 主界面布局

```
┌──────────────────────────────────────────────────────┐
│  菜单栏：导入 | 导出 | 撤销 | 重做        [导出视频] │
├────────────┬─────────────────────┬───────────────────┤
│            │                     │                   │
│  素材库     │     预览播放器       │    属性面板       │
│  - 视频     │   ┌─────────────┐   │  - 选中片段属性   │
│  - 音乐     │   │             │   │  - 时长/音量/样式 │
│  - 字幕     │   │   视频预览    │   │                   │
│            │   │             │   │                   │
│  [+导入]   │   └─────────────┘   │                   │
│            │   ▶ ⏸ ⏭  00:12/03:45│                   │
├────────────┴─────────────────────┴───────────────────┤
│  时间轴 (可缩放)                                      │
│  🎬 视频:  [片段1────][片段2──][片段3──────]          │
│  🎵 音乐:       [背景音乐────────────────]           │
│  💬 字幕:  [你好][世界][ ClipLite]                    │
│  ▲ 时间标尺: 0:00    0:10    0:20    0:30             │
└──────────────────────────────────────────────────────┘
```

### 7.2 核心交互流程

```
导入素材 → 拖到时间轴 → 调整/裁剪 → 预览 → 导出
```

**关键交互**：
- 拖拽：素材库 → 时间轴，时间轴内排序
- 缩放：时间轴鼠标滚轮缩放，精确到帧
- 预览：实时预览当前时间轴位置的画面
- 进度条：点击/拖动定位播放头

### 7.3 导出流程

```
点击"导出" → 选择分辨率/格式/质量 → POST /api/render → SSE 实时进度条 → 完成提示 → 浏览器下载
```

---

## 八、开发里程碑

| 阶段 | 周期 | 交付内容 |
|------|------|---------|
| **M0 工程搭建** | 1.5 周 | Go(Gin)+SQLite 后端骨架、React+Vite 前端骨架、ffmpeg 集成、文件存储、API 路由 |
| **M1 MVP（拼接 + 抽音）** | 2 周 | F1 拼接 + F4 抽音（跑通 上传→ffmpeg→下载 全链路） |
| **M2 音频集成** | 1.5 周 | F2 添加音乐（含音量/淡入淡出） |
| **M3 字幕系统** | 2 周 | F3 添加字幕（手动 + 样式 + SRT 导入） |
| **M4 体验打磨** | 1.5 周 | 时间轴优化、渲染进度 SSE、缩略图、错误处理、任务队列 |
| **M5 发布** | 1 周 | 单二进制打包（embed 前端）、Docker、文档、Linux/macOS 交叉编译 |
| ~~M6 ASR~~ | — | ~~语音转字幕（用户自带 API）—— 本期暂不做，后期阶段实现~~ |

**总计：约 9.5 周**（单人全职估算，不含 ASR）

---

## 九、MVP 范围定义（v0.1）

为了快速验证，**第一版只做最小可用闭环**：

✅ **包含**：
- 导入多个 mp4
- 拖拽排序拼接
- 简单片段裁剪（头尾）
- 一键导出拼接视频

❌ **暂不做**（v0.2+）：
- 音乐/字幕/抽音
- 转场、特效
- 复杂时间轴编辑
- 自动字幕（ASR）

---

## 十、风险与待定问题

| 风险 | 影响 | 应对 |
|------|------|------|
| 上传大文件占带宽/磁盘 | 服务器成本 | 限制单文件 < 2GB；分片上传；定期清理 |
| ffmpeg 渲染占 CPU | 并发受限 | worker pool + 任务队列；context 超时取消 |
| SQLite 并发写冲突 | 多用户写入报错 | WAL 模式；写操作串行化（单写多读） |
| 部署需服务器 | 非零运营成本 | 1 核 2G VPS (~$5/月) 够用；或本地自部署零成本 |
| 素材存服务器 | 隐私顾虑 | 自部署保证数据自主；传输 HTTPS；定期清理 |
| **Linux ffmpeg 版本差异** | 命令参数不兼容 | Docker 固定 ffmpeg 版本；或静态编译 |
| **macOS Apple Silicon** | 需 arm64 二进制 | Go 交叉编译 `darwin/arm64`；ffmpeg 用 brew arm64 版 |
| 字幕硬编码耗时 | 导出慢 | libass filter；进度通过 stderr 解析推送 |
| 时间轴多片段卡顿 | 体验差 | canvas 渲染缩略图 + 虚拟滚动 |

**待定问题（需你确认）**：
1. ❓ **部署环境**：你打算部署在哪？自有 VPS（Linux）/ 本地 Mac / Docker？影响打包和 ffmpeg 依赖方式。
2. ❓ **字幕实现**：先做硬字幕（烧录画面）还是软字幕（可关闭）？
3. ❓ **是否需要多用户/登录**？还是单用户自用（MVP 可省略鉴权）？
4. ❓ **是否开源 / 商业化**：影响 license 和后续功能规划。
5. ❓ **Go 框架偏好**：Gin（推荐）/ Echo / Fiber / 标准库？

> ASR 相关（API 协议格式等）暂缓，后期阶段再做。

---

## 十一、成功指标

| 指标 | 目标 |
|------|------|
| 核心流程完成时间 | 从导入到导出 < 5 分钟（1 分钟视频） |
| 导出成功率 | > 98% |
| 安装包体积 | < 150 MB |
| 学习成本 | 新用户无教程 10 分钟内完成第一个视频 |

---

**下一步**：确认待定问题 → 我开始搭建 M0 工程骨架。
