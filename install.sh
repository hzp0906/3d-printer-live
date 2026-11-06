#!/bin/bash
# 一键安装（macOS / Linux）：检查并安装 Node.js 22+、Python 3、edge-tts（自然人声），然后跑一遍自检。
# 用法：bash install.sh
set -uo pipefail
cd "$(dirname "$0")"

ok()   { echo "  ✅ $*"; }
warn() { echo "  ⚠️  $*"; }
fail() { echo "  ❌ $*"; exit 1; }

echo "== 头像打印机 · 一键安装 =="

has_brew=0; command -v brew >/dev/null 2>&1 && has_brew=1

# 1. Node.js 22+
node_major=0
command -v node >/dev/null 2>&1 && node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if [ "$node_major" -lt 22 ]; then
  if [ "$has_brew" = 1 ]; then
    echo "安装 Node.js 22（brew）…"; brew install node@22 && brew link --overwrite --force node@22 || true
    node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  fi
  [ "$node_major" -ge 22 ] || fail "需要 Node.js 22 或更高版本：https://nodejs.org/ 下载 LTS 安装后重新运行本脚本"
fi
ok "Node.js $(node -v)"

# 2. Python 3
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
if ! command -v "$PY" >/dev/null 2>&1; then
  if [ "$has_brew" = 1 ]; then echo "安装 Python 3（brew）…"; brew install python || true; PY=python3; fi
  command -v "$PY" >/dev/null 2>&1 || fail "需要 Python 3：https://www.python.org/downloads/ 安装后重新运行本脚本"
fi
ok "Python $("$PY" -V 2>&1)"

# 3. Chrome
if [ "$(uname)" = "Darwin" ] && [ ! -d "/Applications/Google Chrome.app" ] && [ ! -d "/Applications/Microsoft Edge.app" ]; then
  if [ "$has_brew" = 1 ]; then echo "安装 Google Chrome（brew）…"; brew install --cask google-chrome || true; fi
  [ -d "/Applications/Google Chrome.app" ] || warn "没找到 Chrome / Edge：数据桥需要它，请到 https://www.google.com/chrome/ 安装"
fi
ok "浏览器已就绪"

# 4. edge-tts（可选：自然人声播报；装不上会自动用浏览器自带语音）
if command -v edge-tts >/dev/null 2>&1; then
  ok "edge-tts 已安装（自然人声）"
else
  echo "安装 edge-tts（自然人声，可选）…"
  "$PY" -m pip install --user -q edge-tts 2>/dev/null || "$PY" -m pip install -q edge-tts 2>/dev/null || true
  if command -v edge-tts >/dev/null 2>&1 || "$PY" -m edge_tts --help >/dev/null 2>&1; then ok "edge-tts 安装完成"
  else warn "edge-tts 没装上，不影响使用（会用浏览器自带语音）"; fi
fi

chmod +x ./*.command ./*.sh 2>/dev/null || true

# 5. 自检
echo "运行自检（node --test）…"
if node --test >/tmp/avatar-printer-test.log 2>&1; then
  ok "自检通过：$(grep -E '^# pass' /tmp/avatar-printer-test.log | head -1)"
else
  warn "自检有失败项，详情见 /tmp/avatar-printer-test.log（一般不影响直播使用）"
fi

echo
echo "安装完成 🎉  下一步：双击 start-live.command（或终端运行 ./start-live.command 直播间号）"
