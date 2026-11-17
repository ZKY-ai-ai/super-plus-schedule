@echo off
rem ClassFlow launcher: start the dev server and open the app in the default browser.
cd /d "%~dp0third_party\classflow-full"

if not exist node_modules (
  echo [ClassFlow] Dependencies are not installed.
  echo Run "pnpm install" inside third_party\classflow-full first.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:5173/').StatusCode -eq 200 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  start "" "http://127.0.0.1:5173/"
  exit /b 0
)

start "ClassFlow" /min cmd /c "npm run dev -- --open"
exit /b 0