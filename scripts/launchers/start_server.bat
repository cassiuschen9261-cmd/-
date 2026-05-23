@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%"
title Paiban System Launcher

if not "%~1"=="" (
    set "choice=%~1"
    goto PROCESS_CHOICE
)

:MENU
cls
echo =========================================
echo    Paiban System Launcher (English)
echo =========================================
echo.
echo 1. Start Server (Visible Window)
echo 2. Start Server (Silent Background)
echo 3. Stop Server
echo 4. Show Server Status
echo 5. Enable Auto-start on Boot
echo 6. Disable Auto-start
echo 7. Open System in Browser
echo 8. Exit
echo.
set /p choice="Select (1-8): "

:PROCESS_CHOICE
if "%choice%"=="1" goto RUN_VISIBLE_FAST
if "%choice%"=="2" goto RUN_SILENT_FAST
if "%choice%"=="3" goto STOP_FAST
if "%choice%"=="4" goto RUN_STATUS
if "%choice%"=="5" goto RUN_POWERSHELL
if "%choice%"=="6" goto RUN_POWERSHELL
if "%choice%"=="7" goto RUN_OPEN
if "%choice%"=="8" exit /b 0

echo [ERROR] Invalid choice: %choice%
if "%~1"=="" (
    timeout /t 1 >nul
    goto MENU
) else (
    exit /b 1
)

:RUN_POWERSHELL
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_server_cn.ps1" -Choice %choice%
set "launcher_exit_code=%ERRORLEVEL%"
if not "%~1"=="" exit /b %launcher_exit_code%

echo.
if "%choice%"=="1" (
    echo Visible server session finished. Press any key to return to the menu.
    pause >nul
    goto MENU
)
if "%choice%"=="3" (
    echo Server stop command completed. Press any key to return to the menu.
    pause >nul
    goto MENU
)
if "%choice%"=="4" (
    echo Status check completed. Press any key to return to the menu.
    pause >nul
    goto MENU
)

goto MENU

:CHECK_START_READY
where node >nul 2>&1 || exit /b 1
if not exist "%PROJECT_ROOT%\node_modules" exit /b 1
exit /b 0

:START_BROWSER_WATCHER
if exist "%SCRIPT_DIR%open_browser.vbs" (
    start "" wscript.exe "%SCRIPT_DIR%open_browser.vbs" >nul 2>&1
)
exit /b 0

:REMOVE_RUNTIME_STATE
del /q "%PROJECT_ROOT%\.cache\runtime\.server-port" 2>nul
del /q "%PROJECT_ROOT%\.cache\runtime\.server-pid" 2>nul
exit /b 0

:HAS_RUNTIME_HINT
if exist "%PROJECT_ROOT%\.cache\runtime\.server-pid" exit /b 0
if exist "%PROJECT_ROOT%\.cache\runtime\.server-port" exit /b 0
exit /b 1

:STOP_SERVER_INTERNAL
set "ACTIVE_PID="
if exist "%PROJECT_ROOT%\.cache\runtime\.server-pid" set /p ACTIVE_PID=<"%PROJECT_ROOT%\.cache\runtime\.server-pid"
if defined ACTIVE_PID (
    taskkill /PID %ACTIVE_PID% /T /F >nul 2>&1
)
if exist "%SCRIPT_DIR%start_server_cn.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_server_cn.ps1" -Choice 3 >nul 2>&1
)
call :REMOVE_RUNTIME_STATE
exit /b 0

:RUN_VISIBLE_FAST
if defined PORT goto RUN_POWERSHELL
if defined DATA_DIR goto RUN_POWERSHELL
if defined INSTANCE_NAME goto RUN_POWERSHELL
if defined RUNTIME_DIR goto RUN_POWERSHELL

call :CHECK_START_READY
if errorlevel 1 goto RUN_POWERSHELL
call :HAS_RUNTIME_HINT
if not errorlevel 1 (
    call :STOP_SERVER_INTERNAL
) else (
    call :REMOVE_RUNTIME_STATE
)
call :START_BROWSER_WATCHER
echo.
echo =========================================
echo    Starting Visible Server...
echo =========================================
node server.js
set "launcher_exit_code=%ERRORLEVEL%"
echo.
echo Server session finished (Exit Code: %launcher_exit_code%).
pause
goto MENU

:RUN_SILENT_FAST
call :CHECK_START_READY
if errorlevel 1 goto RUN_POWERSHELL
set "choice=2"
goto RUN_POWERSHELL

:STOP_FAST
if defined PORT goto RUN_POWERSHELL
if defined DATA_DIR goto RUN_POWERSHELL
if defined INSTANCE_NAME goto RUN_POWERSHELL
if defined RUNTIME_DIR goto RUN_POWERSHELL

call :STOP_SERVER_INTERNAL
set "launcher_exit_code=0"
if not "%~1"=="" exit /b 0
echo.
echo Server stop command completed. Press any key to return to the menu.
pause >nul
goto MENU

:RUN_STATUS
if defined PORT goto RUN_POWERSHELL
if defined DATA_DIR goto RUN_POWERSHELL
if defined INSTANCE_NAME goto RUN_POWERSHELL
if defined RUNTIME_DIR goto RUN_POWERSHELL

node "%PROJECT_ROOT%\scripts\status-check.js"
set "launcher_exit_code=%ERRORLEVEL%"
if not "%~1"=="" exit /b %launcher_exit_code%
echo.
echo Status check completed. Press any key to return to the menu.
pause >nul
goto MENU

:RUN_OPEN
if defined PORT goto RUN_POWERSHELL
if defined DATA_DIR goto RUN_POWERSHELL
if defined INSTANCE_NAME goto RUN_POWERSHELL
if defined RUNTIME_DIR goto RUN_POWERSHELL

set "ACTIVE_PORT="
if exist "%PROJECT_ROOT%\.cache\runtime\.server-port" set /p ACTIVE_PORT=<"%PROJECT_ROOT%\.cache\runtime\.server-port"
if not defined ACTIVE_PORT (
    set "launcher_exit_code=1"
    if not "%~1"=="" exit /b %launcher_exit_code%
    echo [ERROR] Server port file was not found.
    goto MENU
)
set "TARGET_URL=http://localhost:%ACTIVE_PORT%"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%TARGET_URL%"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%TARGET_URL%"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%TARGET_URL%"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%TARGET_URL%"
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" start "" "%ProgramFiles%\Mozilla Firefox\firefox.exe" "%TARGET_URL%"
if exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" start "" "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" "%TARGET_URL%"
if not exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" if not exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" if not exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" if not exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" if not exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" if not exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" start "" "%TARGET_URL%"
set "launcher_exit_code=%ERRORLEVEL%"
if not "%~1"=="" exit /b %launcher_exit_code%
goto MENU
