#!/bin/bash
# macOS 一键开播：同时启动打印页面（8080）+ 数据桥（8765，弹出独立 Chrome 直播间窗口）。
# 用法：双击本文件；或 ./start-live.command 直播间号。第一次填过的房间号会记住。
set -uo pipefail
cd "$(dirname "$0")"

PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
command -v "$PY" >/dev/null 2>&1 || { echo "未找到 Python 3，请先运行 bash install.sh"; read -r -p "按回车退出"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "未找到 Node.js，请先运行 bash install.sh"; read -r -p "按回车退出"; exit 1; }

ROOM="$(echo "${1:-}" | tr -cd '0-9')"
SAVED="$(tr -cd '0-9' < .bridge-room 2>/dev/null || true)"
if [ -z "$ROOM" ]; then
  if [ -n "$SAVED" ]; then
    read -r -p "直播间号（直接回车用上次的 $SAVED）： " ROOM; ROOM="$(echo "$ROOM" | tr -cd '0-9')"; ROOM="${ROOM:-$SAVED}"
  else
    read -r -p "请输入抖音直播间号（live.douyin.com/后面的数字，不是昵称）： " ROOM; ROOM="$(echo "$ROOM" | tr -cd '0-9')"
  fi
fi
[[ "$ROOM" =~ ^[0-9]{5,25}$ ]] || { echo "直播间号格式不对，应为 5～25 位数字"; read -r -p "按回车退出"; exit 1; }
echo "$ROOM" > .bridge-room

PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT INT TERM

if curl -fsS -m 2 http://127.0.0.1:8080/ 2>/dev/null | grep -q 'AVATAR PRINT STUDIO'; then
  echo "打印页面已经在运行"
else
  "$PY" launch.py --server-only & PIDS+=($!)
  sleep 1
fi

echo "打开打印页面：http://127.0.0.1:8080"
open "http://127.0.0.1:8080/" 2>/dev/null || true
echo "启动数据桥，连接直播间 $ROOM（会弹出一个独立 Chrome，第一次请在里面扫码登录抖音）"
echo "直播伴侣里：添加素材 → 窗口 → 选打印页点「弹出直播窗口」后的竖屏窗口"
echo "关闭本窗口或按 Ctrl+C 即可全部停止。"
node douyin-bridge.mjs "$ROOM" & PIDS+=($!)
wait
