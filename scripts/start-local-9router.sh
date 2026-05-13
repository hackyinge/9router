#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-20502}"
HOST="${HOSTNAME:-127.0.0.1}"
BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:${PORT}}"
GLOBAL_OPENROUTERX_PATTERN="/lib/node_modules/openrouterx/cli.js"
LOCAL_DATA_DIR="${LOCAL_DATA_DIR:-$HOME/.openrouterx}"

cd "$ROOT_DIR"

echo "🚀 启动本地源码版 openrouterx"
echo "📁 项目目录: $ROOT_DIR"
echo "🌐 端口: $PORT"
echo "🔗 Base URL: $BASE_URL"
echo "🗂️ 本地数据目录: $LOCAL_DATA_DIR"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "📝 已根据 .env.example 创建 .env"
fi

mkdir -p "$LOCAL_DATA_DIR"

if [ ! -d "node_modules" ]; then
  echo "📦 未检测到 node_modules，开始安装依赖..."
  npm install
fi

GLOBAL_PIDS="$(pgrep -f "$GLOBAL_OPENROUTERX_PATTERN" || true)"
if [ -n "$GLOBAL_PIDS" ]; then
  echo "🧹 检测到全局安装版 openrouterx 正在运行，准备停止: $GLOBAL_PIDS"
  kill -9 $GLOBAL_PIDS 2>/dev/null || true
  sleep 1
fi

EXISTING_PID="$(lsof -ti tcp:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$EXISTING_PID" ]; then
  echo "🛑 检测到端口 ${PORT} 被占用，正在停止进程: $EXISTING_PID"
  kill -9 $EXISTING_PID 2>/dev/null || true
  sleep 1
fi

echo "✅ 使用当前仓库源码启动 openrouterx"
echo "🌍 Dashboard: http://localhost:${PORT}/dashboard"
echo "🤖 API: http://localhost:${PORT}/v1"
echo

DATA_DIR="$LOCAL_DATA_DIR" \
PORT="$PORT" \
HOSTNAME="$HOST" \
NEXT_PUBLIC_BASE_URL="$BASE_URL" \
npm run dev
