@echo off
chcp 65001 >nul
title 이음 분석서버 + Cloudflare 터널
cd /d "%~dp0server"

echo ================================================
echo   이음 KoBERT 분석 서버 + Cloudflare 터널
echo ================================================
echo.

rem ── 0) 사전 점검: 모델 가중치 ─────────────────────────────
if not exist "모델_자동판독\kobert_multilabel.pt" (
  echo [오류] 모델 가중치가 없습니다:
  echo        server\모델_자동판독\kobert_multilabel.pt ^(368MB^)
  echo   - 원본 .pt 파일을 위 경로에 복사한 뒤 다시 실행하세요.
  echo   - 또는 서버 .env 에 MODEL_URL=다운로드주소 를 넣으면 시작 시 자동으로 받습니다.
  echo.
  pause
  exit /b 1
)

rem ── 1) 파이썬 venv 준비 ───────────────────────────────────
if not exist ".venv" (
  echo [최초 실행] 가상환경 생성 + 의존성 설치... ^(수 분 소요^)
  python -m venv .venv
  call .venv\Scripts\activate.bat
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate.bat
)

rem ── 2) cloudflared 확인 (설치 폴더를 PATH 앞에 추가 → 재부팅 없이도 인식) ──
if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "PATH=%ProgramFiles(x86)%\cloudflared;%PATH%"
if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "PATH=%ProgramFiles%\cloudflared;%PATH%"
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [오류] cloudflared 를 찾을 수 없습니다.
  echo   설치:  winget install --id Cloudflare.cloudflared
  echo   (설치했는데도 이 오류면 PC를 재부팅한 뒤 다시 실행하세요.)
  echo.
  pause
  exit /b 1
)

rem ── 3) 분석 서버 기동 ^(새 창^) ────────────────────────────
echo [이음] 분석 서버 시작 ^(http://127.0.0.1:8000^)
start "이음 분석서버" cmd /k "cd /d "%~dp0server" && call .venv\Scripts\activate.bat && python app.py"

rem 서버가 /health 에 응답할 때까지 대기 ^(모델 로드로 첫 기동이 느릴 수 있음^)
echo [이음] 서버 기동 대기 중... ^(모델 로드 20~90초, 최대 3분까지 기다립니다^)
set /a _tries=0
:waithealth
curl -s -o nul -m 3 http://127.0.0.1:8000/health
if not errorlevel 1 goto healthok
set /a _tries+=1
if %_tries% geq 60 (
  echo [경고] 서버가 아직 준비되지 않았지만 터널을 시작합니다.
  echo        서버 창에 오류가 없는지 확인하세요.
  goto healthok
)
timeout /t 3 >nul
goto waithealth
:healthok
echo [이음] 서버 준비 완료. 터널을 시작합니다.

rem ── 4) Cloudflare Quick Tunnel 기동 ^(새 창^) ──────────────
echo [이음] Cloudflare 터널 시작 — 아래 새 창에 뜨는
echo        https://xxxx.trycloudflare.com 주소를 복사하세요.
echo        ^(이 주소를 프론트 VITE_ANALYZE_API 에 넣고 재배포^)
echo.
start "이음 Cloudflare 터널" cmd /k "cloudflared tunnel --url http://localhost:8000"

echo.
echo 두 창^(서버 / 터널^)은 세션 내내 켜 두세요. PC 절전 해제 권장.
echo 이 창은 닫아도 됩니다.
echo.
pause
