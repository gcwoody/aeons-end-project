@echo off
setlocal
for %%I in ("%~dp0.") do set "PROJECT_ROOT=%%~fI"
set "UPDATER=%PROJECT_ROOT%\update-local-demo.ps1"
set "LAUNCHER=%PROJECT_ROOT%\play-local-demo.ps1"
if not exist "%LAUNCHER%" goto missing
if not exist "%UPDATER%" goto updater_missing

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%UPDATER%" -RepositoryRoot "%PROJECT_ROOT%"
set "UPDATE_EXIT=%ERRORLEVEL%"
if not "%UPDATE_EXIT%"=="0" goto update_failed
goto start_game

:updater_missing
echo This local copy does not include the automatic updater yet.
echo Download the latest CMD launcher and update script into this project folder.
echo.

:start_game

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

:update_failed
echo The local updater stopped before the game could start. Please send a screenshot of this window.
echo Press any key to close this window.
pause >nul
exit /b %UPDATE_EXIT%

:missing
echo The launcher script was not found: "%LAUNCHER%"
echo Make sure both launcher files are in the extracted project folder.
echo Press any key to close this window.
pause >nul
exit /b 1
