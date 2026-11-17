@echo off
setlocal
cd /d "%~dp0"
title Kexu Launcher
node "%~dp0scripts\open-kexu.mjs"
if errorlevel 1 pause
endlocal