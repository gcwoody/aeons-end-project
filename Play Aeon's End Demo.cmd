@echo off
setlocal
for %%I in ("%~dp0.") do set "PROJECT_ROOT=%%~fI"
set "LAUNCHER=%PROJECT_ROOT%\play-local-demo.ps1"
if not exist "%LAUNCHER%" goto missing

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%" -RepositoryRoot "%PROJECT_ROOT%"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo The local game launcher stopped with an error. Please send a screenshot of this window.
) else (
  echo The local game server has stopped.
)
echo Press any key to close this window, or close it now.
pause >nul
exit /b %EXIT_CODE%

:missing
echo The launcher script was not found: "%LAUNCHER%"
echo Make sure both launcher files are in the extracted project folder.
echo Press any key to close this window.
pause >nul
exit /b 1
