#!/bin/bash
# macOS 本地演示入口：仅启动打印页面，不连接真实直播间。
set -euo pipefail
cd "$(dirname "$0")"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "未找到 Python 3，请先安装：https://www.python.org/downloads/"
  exit 1
fi

"$PYTHON_BIN" launch.py --server-only &
SERVER_PID=$!
cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# 启动失败（例如 8080 被其他程序占用）时直接显示错误，不打开错误页面。
sleep 1
if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  wait "$SERVER_PID"
  exit 1
fi

echo "打印页面：http://127.0.0.1:8080"
echo "当前为本地演示模式；关闭此终端窗口或按 Ctrl+C 停止。"
open "http://127.0.0.1:8080"
wait "$SERVER_PID"
