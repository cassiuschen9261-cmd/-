@echo off
setlocal

:: =======================================================
:: Paiban System - Main Launcher / Multi-Instance Template
:: =======================================================
:: To run an independent department instance, you can copy this file
:: (e.g., start_neike.bat) and uncomment/modify the settings below.
:: =======================================================

:: 1. PORT (Set to 0 for auto-allocation, leave empty for default 3000)
:: set PORT=3001

:: 2. INSTANCE_NAME (Used for background service and auto-start)
:: Only use letters, numbers, underscores, and hyphens (e.g., neike)
:: set INSTANCE_NAME=neike

:: 3. DATA_DIR (Relative or absolute path)
:: System will automatically create data.json in this directory
:: set DATA_DIR=data_neike

:: =======================================================
:: Start the system
:: =======================================================
cd /d "%~dp0"
call "%~dp0scripts\launchers\start_server.bat" %*
exit /b %ERRORLEVEL%
