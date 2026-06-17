# 🎬 ClipLite — 轻量级视频剪辑工具

一个自部署的、剪映风格的视频剪辑 Web 应用。**Go 后端 + React 前端 + SQLite3 + 原生 ffmpeg**。

## ✨ 核心功能（MVP 已完成）

- 🎞️ **视频拼接** — 多段视频按顺序拼成一个
- 🎵 **添加音乐** — 给视频配背景音乐（混音）
- 💬 **添加字幕** — 手动输入字幕，烧录到画面（SRT）
- 🔊 **音频提取** — 从视频一键提取 mp3/wav/aac

## 🏗️ 架构

```
React SPA (Ant Design)  ──REST──►  Go (Gin)  ──►  原生 ffmpeg
                                          ├──► SQLite3 (工程/素材元数据)
                                          └──► 本地文件系统 (素材/产物)
```

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 |
| 后端 | Go 1.22 + Gin |
| 视频 | 原生 ffmpeg（os/exec 调用，比 wasm 快 3-5 倍） |
| 数据库 | SQLite3（modernc.org/sqlite 纯 Go 驱动，免 CGO） |
| 部署 | 单二进制 + 托管前端 dist，一个端口提供完整服务 |

## 🚀 快速开始

### 依赖

- Go 1.22+
- Node.js 18+
- ffmpeg + ffprobe（系统 PATH）

```bash
# Ubuntu/Debian
sudo apt install -y ffmpeg
# macOS
brew install ffmpeg
```

### 一键启动

```bash
./start.sh
```

脚本会自动：检查依赖 → 构建前端 → 构建后端 → 启动服务。

访问 **http://localhost:16014** 即可使用。

#### 其他模式

```bash
./start.sh dev      # 开发模式（vite 5173 热更新 + 后端）
./start.sh build    # 仅构建，不启动
./start.sh stop     # 停止服务
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLIPLITE_PORT` | 16014 | 服务端口 |
| `CLIPLITE_DATA_DIR` | ./data | 数据库 + 素材目录 |
| `CLIPLITE_FRONTEND_DIR` | ../frontend/dist | 前端静态文件目录 |

## 📁 项目结构

```
video-editor/
├── start.sh                  # 一键启动脚本
├── docs/
│   └── PRD.md                # 产品需求文档
├── backend/                  # Go 后端
│   ├── main.go               # 入口 + 路由 + 静态托管
│   ├── go.mod
│   └── internal/
│       ├── config/           # 配置
│       ├── db/               # SQLite 迁移（6 张表）
│       ├── ffmpeg/           # ffmpeg 封装（probe/concat/mix/字幕/裁剪）
│       ├── handlers/         # HTTP（asset/project/render）
│       ├── models/           # 数据结构
│       └── storage/          # 文件存储
└── frontend/                 # React 前端
    └── src/
        ├── App.tsx           # 主界面（素材库/预览/时间轴/导出）
        ├── api/client.ts     # API 客户端
        └── types/            # TypeScript 类型
```

## 🔌 API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/health` | 健康检查（含 ffmpeg 状态） |
| GET / POST | `/api/assets` | 素材列表 / 上传 |
| GET | `/api/assets/:id/file` | 下载/预览素材 |
| POST | `/api/assets/:id/extract-audio` | 提取音频（?format=mp3\|wav\|aac） |
| GET / POST | `/api/projects` | 工程 CRUD |
| GET / DELETE | `/api/projects/:id` | 工程详情（含轨道+片段） |
| PUT | `/api/clips/:trackId` | 保存轨道片段 |
| POST | `/api/render` | 触发渲染（拼接+混音+字幕） |
| GET | `/api/render/:projectId` | 渲染状态轮询 |
| GET | `/api/render/:projectId/download` | 下载渲染产物 |

## 🎬 使用流程

1. 点「导入素材」上传视频/音频
2. 点「新建工程」
3. 点素材上的 ➕ → 加到时间轴（视频/音乐自动分轨）
4. 点「加字幕」输入文字和时间区间
5. 点「导出视频」→ 进度条 → 完成后预览/下载

## 📝 License

MIT
