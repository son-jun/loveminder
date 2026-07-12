@echo off
title 이음 분석서버 + Cloudflare 터널
cd /d "%~dp0server"

echo ================================================
echo   이음 KoBERT 분석 서버 + Cloudflare 터널
echo ================================================
echo.

rem ── 0) 사전 점검: 모델 가중치 ─────────────────────────────
if not exist "모델_자동판독\kobert_multilabel.pt" (
  echo [오류] 모델 가중치가 없습니다: server\모델_자동판독\kobert_multilabel.pt
  echo        원본 .pt 를 위 경로에 두고 다시 실행하세요.
  echo.
  pause
  exit /b 1
)

rem ── 1) 파이썬 venv 확인 ───────────────────────────────────
if not exist ".venv\Scripts\python.exe" (
  echo [최초 실행] 가상환경 생성 + 의존성 설치... ^(수 분 소요^)
  python -m venv .venv
  .venv\Scripts\python.exe -m pip install --upgrade pip
  .venv\Scripts\python.exe -m pip install -r requirements.txt
)

rem ── 2) cloudflared 확인 (설치 폴더를 PATH 앞에 추가 → 재부팅 없이도 인식) ──
if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "PATH=%ProgramFiles(x86)%\cloudflared;%PATH%"
if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "PATH=%ProgramFiles%\cloudflared;%PATH%"
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [오류] cloudflared 를 찾을 수 없습니다.
  echo        설치: winget install --id Cloudflare.cloudflared
  echo        설치했는데도 이 오류면 PC 재부팅 후 다시 실행하세요.
  echo.
  pause
  exit /b 1
)

rem ── 3) 분석 서버 기동 (새 창) ─────────────────────────────
echo [이음] 분석 서버 시작 (http://127.0.0.1:8000)
start "이음 분석서버" /D "%~dp0server" cmd /k ".venv\Scripts\python.exe app.py"

rem 서버가 /health 에 응답할 때까지 대기 (모델 로드로 첫 기동이 느릴 수 있음)
echo [이음] 서버 기동 대기 중... (모델 로드 20~90초, 최대 3분 대기)
set /a _tries=0
:waithealth
curl -s -o nul -m 3 http://127.0.0.1:8000/health
if not errorlevel 1 goto healthok
set /a _tries+=1
if %_tries% geq 60 (
  echo [경고] 서버 준비 확인 실패. 그래도 터널을 시작합니다. 서버 창의 오류를 확인하세요.
  goto healthok
)
timeout /t 3 >nul
goto waithealth
:healthok
echo [이음] 서버 준비 완료. 터널을 시작합니다.

rem ── 4) Cloudflare Quick Tunnel (새 창) ────────────────────
echo [이음] 터널 시작 - 새 창에 뜨는 https://xxxx.trycloudflare.com 주소를 복사하세요.
echo        (이 주소를 Vercel 의 VITE_ANALYZE_API 에 넣고 Redeploy)
echo.
start "이음 Cloudflare 터널" cmd /k "cloudflared tunnel --url http://localhost:8000"

echo.
echo 두 창(분석서버 / 터널)은 세션 내내 켜 두세요. PC 절전 해제 권장.
echo 이 창은 닫아도 됩니다.
echo.
pause
