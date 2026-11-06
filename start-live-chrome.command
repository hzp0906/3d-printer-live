#!/bin/bash
# 从「终端」启动直播用的 Chrome（端口 9223），这样 macOS 会给它摄像头权限。
# 双击此文件，或在终端运行：./start-live-chrome.command
DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$DIR/.bridge-profile"
ROOM="$(echo "${1:-}" | tr -cd '0-9')"
[ -z "$ROOM" ] && ROOM="$(tr -cd '0-9' < "$DIR/.bridge-room" 2>/dev/null)"
[ -z "$ROOM" ] && read -r -p "请输入抖音直播间号： " ROOM && ROOM="$(echo "$ROOM" | tr -cd '0-9')" && echo "$ROOM" > "$DIR/.bridge-room"

# 先关掉旧的 9223 Chrome（登录信息保存在 .bridge-profile，不会丢）
OLD=$(pgrep -f "remote-debugging-port=9223")
if [ -n "$OLD" ]; then
  echo "关闭旧的直播 Chrome：$OLD"
  kill $OLD
  for i in $(seq 1 20); do pgrep -f "remote-debugging-port=9223" >/dev/null || break; sleep 0.5; done
fi

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9223 \
  --user-data-dir="$PROFILE" \
  --no-first-run --no-default-browser-check --lang=zh-CN \
  --window-position=120,90 --window-size=1180,800 \
  --disable-backgrounding-occluded-windows --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion \
  "https://live.douyin.com/$ROOM" "http://localhost:8080/" "http://localhost:8080/live.html" \
  >/tmp/live-chrome.log 2>&1 &
echo "直播 Chrome 已启动（端口 9223）。第一次打开摄像头时点「允许」。这个终端窗口可以关掉。"
