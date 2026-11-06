# 给 AI 的安装说明（AI-INSTALL）

> 用户：把下面这句话发给你的 AI 助手（Claude Code、Cursor、Codex、Trae、豆包 MarsCode 等能执行命令的 AI 都可以）：
>
> **请按照 https://github.com/hzp0906/3d-printer-live/blob/main/AI-INSTALL.md 帮我安装头像打印机直播间，装好后帮我启动。**

---

以下内容写给 AI 助手。请严格按步骤执行，每一步检查结果再继续；遇到需要用户本人操作的地方（扫码登录、填直播间号、允许权限），停下来用一句大白话告诉用户怎么做。

## 0. 项目是什么
抖音直播间互动画面：数据桥（Node.js）通过本机 Chrome 读取用户自己直播间的公开弹幕（进场/评论/点赞/关注/礼物），网页里的 3D 打印机把观众头像打印出来。只读取公开弹幕，不发弹幕、不送礼、不替用户点关注。

## 1. 获取代码
```bash
git clone https://github.com/hzp0906/3d-printer-live.git
cd 3d-printer-live
```
没有 git 时：下载 https://github.com/hzp0906/3d-printer-live/archive/refs/heads/main.zip 并解压。建议放在用户桌面。

## 2. 一键安装依赖
需要：Node.js ≥ 22、Python 3、Google Chrome（或 Edge）。可选：edge-tts（自然人声）。无 npm 依赖，不需要 `npm install`。

- **macOS / Linux：** `bash install.sh`
  （有 Homebrew 时会自动装缺失的 Node 22 / Python / Chrome；没有 Homebrew 就提示用户去官网下载安装包。）
- **Windows：** 双击或运行 `install.bat`
  （用 winget 安装 Node.js LTS、Python 3，再 `pip install pywebview edge-tts`。装完 Node/Python 后若提示找不到命令，让用户关掉窗口重新运行一次。）

脚本最后会跑 `node --test` 自检，`# fail 0` 即正常。

## 3. 向用户要直播间号
直播间号是一串 5～25 位数字（不是昵称）。获取方式告诉用户：
- 开播后在电脑浏览器打开自己的直播间，地址栏 `live.douyin.com/` 后面的数字；或
- 直播伴侣 / 抖音 App 分享直播间链接，链接里的那串数字。

## 4. 启动
- **macOS：** `./start-live.command 直播间号`
  会同时启动打印页面 http://127.0.0.1:8080 和数据桥，并弹出一个独立 Chrome 打开直播间。房间号会记在 `.bridge-room`，下次直接双击 `start-live.command` 回车即可。
- **Windows：** 运行 `start.bat` 打开桌面窗口 → 在「直播连接」里填直播间号 → 点「打开直播间窗口」并登录 → 点「开始抓取」。

只想先看效果（不连直播间）：macOS `./start-mac.command`，Windows `start.bat`，会自动打印测试头像。

## 5. 需要用户本人做的事（逐条告诉用户）
1. 在弹出的独立 Chrome 直播间窗口里**扫码登录抖音**（只需第一次，登录后头像抓得更全）。
2. 打印页面右上角出现「● 直播数据 · 数据桥已连接」即成功。
3. 在打印页面点「弹出直播窗口」，得到 1080×1920 竖屏画面。
4. 打开「抖音直播伴侣」→ 竖屏 → 添加素材 →「窗口」→ 选这个竖屏窗口 → 拉满画面 → 开始直播。
5. macOS 想在画面里加摄像头：改用 `./start-live-chrome.command` 启动直播 Chrome，第一次点「允许」摄像头。

## 6. 验证（AI 自查）
- `curl -s http://127.0.0.1:8080/ | grep -c "AVATAR PRINT STUDIO"` 输出 1。
- 数据桥终端出现「✅ 已读到直播数据」「🖨 打印页面已连接」，之后有「💬 / ⭐ / 👋」事件日志。
- 用户还没开播时，数据桥会提示未开播并继续等待，这是正常的。

## 7. 常见问题
| 现象 | 处理 |
|---|---|
| `8080 端口被其他程序占用` | 关掉占用 8080 的程序（`lsof -i :8080` / `netstat -ano \| findstr 8080`）后重试 |
| 直播间窗口卡在「直播加载中」 | 刷新那个窗口；数据桥也会每 10 分钟自动重开 |
| 有字幕没声音 | 检查电脑是否静音；打印页「播报」音量调到 40～60 |
| 自然人声不响 | 没装 edge-tts 或网络不好，会自动退回浏览器语音，不影响使用 |
| Node 版本低 | 必须 ≥ 22（用了内置 WebSocket） |
| macOS 提示无法打开 .command | 终端里 `chmod +x *.command` 或 `bash start-live.command` |

## 8. 停止
关掉 `start-live.command` 的终端窗口（或 Ctrl+C）即可全部停止。下播后数据桥检测到直播结束 30 分钟也会自己退出。

## 9. 隐私与合规（请提醒用户）
- `.bridge-profile/`（抖音登录态）、`fan-book.json`（观众昵称）、`.tts-cache/`、`clips/` 都在 `.gitignore` 里，不要上传或分享。
- 直播话术用“点关注打金色大头像”这类画面效果，不要承诺实物/红包奖励；幸运卡/能量卡仅供娱乐。
