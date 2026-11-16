@echo off
chcp 65001 >nul
setlocal
title Aeon's End Digital - 本地启动器
for %%I in ("%~dp0.") do set "PROJECT_ROOT=%%~fI"
set "UPDATER=%PROJECT_ROOT%\update-local-demo.ps1"
set "LAUNCHER=%PROJECT_ROOT%\play-local-demo.ps1"
echo.
echo 正在启动 Aeon's End Digital...
if not exist "%LAUNCHER%" goto missing
if not exist "%UPDATER%" goto updater_missing

echo 正在检查版本更新，请稍候...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%UPDATER%" -RepositoryRoot "%PROJECT_ROOT%"
set "UPDATE_EXIT=%ERRORLEVEL%"
if not "%UPDATE_EXIT%"=="0" goto update_failed
goto start_game

:updater_missing
echo 当前文件夹没有自动更新程序，将直接启动本地游戏。
echo.

:start_game

echo 检查完成，正在启动本地游戏...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%" -RepositoryRoot "%PROJECT_ROOT%"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo 本地游戏启动时遇到问题，请截取此窗口并反馈。
) else (
  echo 本地游戏已关闭。
)
echo 按任意键关闭此窗口，也可以直接关闭窗口。
pause >nul
exit /b %EXIT_CODE%

:update_failed
echo 更新程序未能继续启动游戏，请截取此窗口并反馈。
echo 按任意键关闭此窗口。
pause >nul
exit /b %UPDATE_EXIT%

:missing
echo 找不到本地游戏启动脚本："%LAUNCHER%"
echo 请确认压缩包已完整解压，且文件没有被移动。
echo 按任意键关闭此窗口。
pause >nul
exit /b 1
