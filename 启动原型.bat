@echo off
chcp 65001 >nul
title 野遇 · 可交互原型
cd /d "%~dp0"

echo.
echo  野遇 · 可交互原型
echo  ----------------------------------------
echo  本地服务: http://127.0.0.1:8765/index.html
echo  （必须用 http 打开，浏览器才允许本地存储，数据才能保存）
echo  关闭此窗口即停止服务。
echo.

rem 依次尝试: 本机已验证的 Python 绝对路径 -> PATH 里的 python -> Node 兜底
set "PY=C:\Users\30987\.workbuddy\binaries\python\versions\3.13.12\python.exe"

if exist "%PY%" (
  echo  正在启动服务...
  start "" http://127.0.0.1:8765/index.html
  "%PY%" -m http.server 8765 --bind 127.0.0.1
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo  正在启动服务...
  start "" http://127.0.0.1:8765/index.html
  python -m http.server 8765 --bind 127.0.0.1
  goto :end
)

echo  未检测到 Python，正在尝试用 Node 启动...
start "" http://127.0.0.1:8765/index.html
npx --yes http-server -p 8765 -a 127.0.0.1

:end
echo.
echo  服务已停止。
pause
