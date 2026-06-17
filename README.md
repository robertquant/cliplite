# ClipLite — 轻量级视频剪辑工具

模仿剪映核心体验的轻量级视频剪辑工具。**Go 后端 + React 前端 + SQLite3**。

## ✨ 核心功能（M0 骨架已就绪）

- 🎬 视频拼接（多段拼接成一个视频）
- 🎵 添加音乐（背景音乐混音）
- 💬 添加字幕（手动 + 样式）
- 🎚️ 音频提取（视频 → mp3/wav/aac）

## 🏗️ 架构

```
React (Vite, :5173) ──proxy──► Go (Gin, :8765) ──► 原生 ffmpeg
                                     ├──► SQLite3 (元数据)
                                     └──► 本地文件系统 (素材/产物)
```

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 + Zustand |
| 后端 | Go 1.22 + Gin + sqlx |
| 视频 | 原生 ffmpeg（os/exec 调用） |
| 数据库 | SQLite3（modernc.org/sqlite 纯 Go 驱动，免 CGO） |
| 存储 | 本地文件系统 |

## 🚀 快速开始

### 1. 环境要求

- Go 1.22+
- Node.js 18+
- ffmpeg + ffprobe（系统 PATH 中）

```bash
# Ubuntu/Debian
sudo apt install -y ffmpeg
# macOS
brew install ffmpeg
```

### 2. 启动后端

```bash
cd backend
go mod tidy
go build -o cliplite-server .
CLIPLITE_PORT=8765 CLIPLITE_DATA_DIR=./data ./cliplite-server
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173

## 📁 项目结构

```
video-editor/
├── backend/                      # Go 后端
│   ├── main.go                   # 入口 + 路由
│   ├── go.mod
│   ├── internal/
│   │   ├── config/               # 配置加载
│   │   ├── db/                   # SQLite + 迁移
│   │   ├── ffmpeg/               # ffmpeg 封装
│   │   ├── handlers/             # HTTP 处理器
│   │   ├── models/               # 数据模型
│   │   └── storage/              # 文件存储
│   └── data/                     # 运行时数据（gitignore）
│       ├── cliplite.db           # SQLite 数据库
│       └── storage/              # 素材和产物
├── frontend/                     # React 前端
│   ├── src/
│   │   ├── api/client.ts         # API 客户端
│   │   ├── types/index.ts        # TypeScript 类型
│   │   ├── App.tsx               # 主界面
│   │   └── main.tsx              # 入口
│   └── package.json
└── docs/PRD.md                   # 产品需求文档
```

## 🔌 API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/health` | GET | 健康检查（含 ffmpeg 状态） |
| `/api/assets` | GET/POST | 素材列表 / 上传 |
| `/api/assets/:id` | GET | 素材详情 |
| `/api/assets/:id/file` | GET | 下载/预览原文件 |
| `/api/assets/:id/extract-audio` | POST | 提取音频（?format=mp3/wav/aac） |
| `/api/projects` | GET/POST | 工程 CRUD |
| `/api/projects/:id` | GET/DELETE | 工程详情（含轨道+片段） |
| `/api/clips/:trackId` | PUT | 保存轨道片段 |

## ⚙️ 配置（环境变量）

| 变量 | 默认 | 说明 |
|------|------|------|
| `CLIPLITE_PORT` | 8080 | 后端端口 |
| `CLIPLITE_DATA_DIR` | ./data | 数据目录（DB + 存储） |

## 📊 当前进度（M0 完成）

- ✅ Go 后端骨架（Gin + SQLite3 + ffmpeg）
- ✅ 素材上传 + ffprobe 元信息探测
- ✅ 音频提取（F4）
- ✅ 工程/轨道/片段数据模型 + CRUD
- ✅ React 前端骨架（素材库 + 预览 + 时间轴 + 抽音 UI）
- ⏳ F1 视频拼接渲染（ffmpeg concat）
- ⏳ F2 添加音乐混音
- ⏳ F3 字幕系统
- ⏳ 渲染进度 SSE 推送
- ⏳ 拖拽到时间轴
