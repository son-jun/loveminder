@echo off
title Ieum - Analysis Server + Cloudflare Tunnel
cd /d "%~dp0server"

echo ================================================
echo   Ieum KoBERT Analysis Server + Cloudflare Tunnel
echo ================================================
echo.

rem 0) Model weight check (search by ASCII filename, no Korean path needed)
dir /b /s kobert_multilabel.pt >nul 2>&1
if errorlevel 1 (
  echo [ERROR] model weight not found: server\...\kobert_multilabel.pt
  echo         Put the original .pt there and run again.
  echo.
  pause
  exit /b 1
)

rem 1) Python venv check
if not exist ".venv\Scripts\python.exe" (
  echo [First run] Creating venv + installing deps... this takes a few minutes
  python -m venv .venv
  .venv\Scripts\python.exe -m pip install --upgrade pip
  .venv\Scripts\python.exe -m pip install -r requirements.txt
)

rem 2) cloudflared: add install folder to PATH (works even before reboot)
if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "PATH=%ProgramFiles(x86)%\cloudflared;%PATH%"
if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "PATH=%ProgramFiles%\cloudflared;%PATH%"
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [ERROR] cloudflared not found.
  echo         Install: winget install --id Cloudflare.cloudflared
  echo         If already installed, reboot the PC and run again.
  echo.
  pause
  exit /b 1
)

rem 3) Start analysis server in a new window
echo [Ieum] Starting analysis server (http://127.0.0.1:8000)
start "Ieum Analysis Server" /D "%~dp0server" cmd /k ".venv\Scripts\python.exe app.py"

rem Wait until /health responds (model load can be slow on first start)
echo [Ieum] Waiting for server... model load 20-90s, up to 3 min
set /a _tries=0
:waithealth
curl -s -o nul -m 3 http://127.0.0.1:8000/health
if not errorlevel 1 goto healthok
set /a _tries+=1
if %_tries% geq 60 (
  echo [WARN] Server not confirmed ready. Starting tunnel anyway - check the server window.
  goto healthok
)
timeout /t 3 >nul
goto waithealth
:healthok
echo [Ieum] Server ready. Starting tunnel.

rem 4) Cloudflare Quick Tunnel in a new window
echo [Ieum] Copy the https://xxxx.trycloudflare.com URL shown in the new window.
echo        Put it into Vercel VITE_ANALYZE_API and Redeploy.
echo.
start "Ieum Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:8000"

echo.
echo Keep BOTH windows (server / tunnel) open during the session. Disable PC sleep.
echo You can close THIS window.
echo.
pause
