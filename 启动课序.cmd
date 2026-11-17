@echo off
setlocal
cd /d "%~dp0third_party\classflow-full"
title Kexu Launcher
node "scripts\open-kexu.mjs"
if errorlevel 1 pause
endlocal