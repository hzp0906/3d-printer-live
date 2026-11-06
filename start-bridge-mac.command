#!/bin/bash
# macOS 真实直播数据桥：会打开独立 Chrome 直播窗口，需用户主动运行。
set -euo pipefail
cd "$(dirname "$0")"

NODE_BIN="${NODE_BIN:-node}"
if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  echo "未找到 Node.js 22 或更高版本，请先安装：https://nodejs.org/"
  exit 1
fi
NODE_MAJOR="$("$NODE_BIN" -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "当前 Node.js 版本过低，数据桥需要 Node.js 22 或更高版本。"
  exit 1
fi

ROOM="${1:-}"
if [ -z "$ROOM" ]; then
  read -r -p "请输入抖音直播间号（不是主播昵称）： " ROOM
fi
if [[ ! "$ROOM" =~ ^[0-9]{5,25}$ ]]; then
  echo "直播间号格式不正确，应只包含 5～25 位数字。"
  exit 1
fi

echo "即将打开独立 Chrome 并连接直播间 ${ROOM}；按 Ctrl+C 停止数据桥。"
exec "$NODE_BIN" douyin-bridge.mjs "$ROOM"
