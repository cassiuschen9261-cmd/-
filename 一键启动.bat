@echo off
setlocal
cd /d "%~dp0"
call "%~dp0scripts\launchers\一键启动.bat" %*
exit /b %ERRORLEVEL%
