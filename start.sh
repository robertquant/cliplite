#!/usr/bin/env bash
# ClipLite 一键启动脚本
# 用法：
#   ./start.sh          构建前端+后端并启动（生产模式）
#   ./start.sh dev      开发模式（vite 热更新 + 后端）
#   ./start.sh build    仅构建，不启动
#   ./start.sh stop     停止运行中的服务
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PORT="${CLIPLITE_PORT:-8765}"
DATA_DIR="${CLIPLITE_DATA_DIR:-$ROOT/data}"
LOG_FILE="/tmp/cliplite.log"
PID_FILE="/tmp/cliplite.pid"

c_green='\033[0;32m'; c_yellow='\033[1;33m'; c_red='\033[0;31m'; c_reset='\033[0m'
log()  { echo -e "${c_green}[ClipLite]${c_reset} $*"; }
warn() { echo -e "${c_yellow}[ClipLite]${c_reset} $*"; }
err()  { echo -e "${c_red}[ClipLite]${c_reset} $*" >&2; }

# ---- 依赖检查 ----
check_dep() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "缺少依赖: $1 $2"
    exit 1
  fi
}
check_dep go      "(https://go.dev/dl/)"
check_dep node    "(https://nodejs.org/)"
check_dep npm
check_dep ffmpeg  "(apt install ffmpeg / brew install ffmpeg)"
check_dep ffprobe

# ---- 停止 ----
stop_service() {
  if [ -f "$PID_FILE" ]; then
    local pid; pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      log "已停止服务 (pid=$pid)"
    fi
    rm -f "$PID_FILE"
  else
    pkill -f "cliplite-server" 2>/dev/null && log "已停止 cliplite-server" || warn "无运行中的服务"
  fi
}

case "${1:-start}" in
  stop)
    stop_service
    exit 0
    ;;
  dev)
    log "开发模式：vite(5173) + 后端($PORT)，前端热更新"
    mkdir -p "$DATA_DIR"
    # 启动后端
    ( cd "$BACKEND" && go run . ) &
    BACKEND_PID=$!
    # 启动前端 dev server（已配置代理到 8765）
    ( cd "$FRONTEND" && npm run dev ) &
    FRONTEND_PID=$!
    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM
    log "前端: http://localhost:5173  后端API: http://localhost:$PORT"
    wait
    exit 0
    ;;
esac

# ---- 生产模式：构建 ----
log "构建前端..."
( cd "$FRONTEND" && npm install --silent && npm run build )

log "构建后端..."
( cd "$BACKEND" && go build -o cliplite-server . )

if [ "${1:-start}" = "build" ]; then
  log "仅构建完成，未启动"
  exit 0
fi

# ---- 启动 ----
stop_service 2>/dev/null || true
mkdir -p "$DATA_DIR"
log "启动服务 端口=$PORT 数据目录=$DATA_DIR"
(
  cd "$BACKEND"
  CLIPLITE_PORT="$PORT" \
  CLIPLITE_DATA_DIR="$DATA_DIR" \
  CLIPLITE_FRONTEND_DIR="$FRONTEND/dist" \
  nohup ./cliplite-server > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
)

sleep 2
if curl -s "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  log "✅ 启动成功！"
  log "   访问:  http://localhost:$PORT"
  log "   日志:  tail -f $LOG_FILE"
  log "   停止:  ./start.sh stop"
else
  err "❌ 启动失败，查看日志: $LOG_FILE"
  tail -20 "$LOG_FILE"
  exit 1
fi
