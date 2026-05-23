@echo off
setlocal
cd /d "%~dp0"
title Paiban System Launcher
echo Starting Paiban System Launcher...
call "%~dp0start_server.bat"
set "LAUNCH_EXIT_CODE=%ERRORLEVEL%"
if not "%LAUNCH_EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] Failed to start Paiban System. Exit code: %LAUNCH_EXIT_CODE%
    echo [ERROR] Please check server_launcher.log for details.
    pause
    exit /b %LAUNCH_EXIT_CODE%
)
