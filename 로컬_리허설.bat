@echo off
title Ieum - Local Rehearsal (server + frontend, no tunnel)
cd /d "%~dp0"

echo ================================================
echo   Ieum Local Rehearsal (same PC, no tunnel)
echo   server http://127.0.0.1:8000 + frontend http://localhost:5173
echo ================================================
echo.

rem 0) checks
if not exist "server\.venv\Scripts\python.exe" (
  echo [ERROR] Python venv missing. Run the analysis-server .bat once first.
  pause & exit /b 1
)
if not exist ".env.local" (
  echo [ERROR] .env.local not found.
  pause & exit /b 1
)

rem node/npm PATH
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if not exist "node_modules" (
  echo [First run] Installing frontend deps... a few minutes
  call npm install || (echo npm install failed & pause & exit /b 1)
)

rem 1) analysis server (new window)
echo [1/2] Starting analysis server (model load 20-90s)
start "Ieum Analysis Server (local)" /D "%~dp0server" cmd /k ".venv\Scripts\python.exe app.py"

set /a _tries=0
:waithealth
curl -s -o nul -m 3 http://127.0.0.1:8000/health
if not errorlevel 1 goto healthok
set /a _tries+=1
if %_tries% geq 60 ( echo [WARN] Server not confirmed ready, continuing anyway. & goto healthok )
timeout /t 3 >nul
goto waithealth
:healthok
echo       Server ready.

rem 2) frontend dev server (new window) + browser
echo [2/2] Starting frontend dev server
start "Ieum Frontend (local)" /D "%~dp0" cmd /k "npm run dev"
start "" /b cmd /c "timeout /t 6 >nul && start http://localhost:5173"

echo.
echo Two windows (server / frontend) will open. Open http://localhost:5173 in your browser.
echo Close both windows to stop.
echo.
pause
