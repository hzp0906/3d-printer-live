@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 头像打印机 · 一键安装
echo == 头像打印机 · 一键安装（Windows）==

where node >nul 2>nul
if errorlevel 1 (
    echo 安装 Node.js LTS（winget）...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
)
where python >nul 2>nul
if errorlevel 1 (
    echo 安装 Python 3（winget）...
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
)
where node >nul 2>nul || (echo 请重新打开本窗口再运行一次 install.bat（刚装完的软件需要新窗口才能识别） & pause & exit /b 1)
where python >nul 2>nul || (echo 请重新打开本窗口再运行一次 install.bat & pause & exit /b 1)

echo 安装 Python 依赖 pywebview（桌面窗口）和 edge-tts（自然人声，可选）...
python -m pip install -q pywebview edge-tts
echo 检查 WebView2 Runtime（Win10/11 一般已自带）...
winget install -e --id Microsoft.EdgeWebView2Runtime --accept-source-agreements --accept-package-agreements >nul 2>nul

echo 运行自检...
call node --test >"%TEMP%\avatar-printer-test.log" 2>&1
if errorlevel 1 (echo 自检有失败项，详情见 %TEMP%\avatar-printer-test.log，一般不影响使用) else (echo 自检通过)

echo.
echo 安装完成！下一步：双击 start.bat，在窗口里填直播间号 → 打开直播间窗口并登录 → 开始抓取。
pause
