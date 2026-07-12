@echo off
title 이음 로컬 리허설 (분석서버 + 프론트, 터널 없음)
cd /d "%~dp0"

echo ================================================
echo   이음 로컬 리허설  (같은 PC, 터널 불필요)
echo   분석서버 http://127.0.0.1:8000 + 프론트 http://localhost:5173
echo ================================================
echo.

rem ── 0) 사전 점검 ──────────────────────────────────────────
if not exist "server\모델_자동판독\kobert_multilabel.pt" (
  echo [오류] 모델 가중치 없음: server\모델_자동판독\kobert_multilabel.pt
  pause & exit /b 1
)
if not exist "server\.venv\Scripts\python.exe" (
  echo [오류] 파이썬 가상환경 없음. 먼저 분석서버_터널_실행.bat 를 한 번 실행하세요.
  pause & exit /b 1
)
if not exist ".env.local" (
  echo [오류] .env.local 이 없습니다.
  pause & exit /b 1
)

rem ── node/npm 경로 보강 ────────────────────────────────────
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if not exist "node_modules" (
  echo [최초 실행] 프론트 의존성 설치 중... ^(수 분^)
  call npm install || (echo npm install 실패 & pause & exit /b 1)
)

rem ── 1) 분석 서버 (새 창) ──────────────────────────────────
echo [1/2] 분석 서버 시작 (모델 로드 20~90초)
start "이음 분석서버(로컬)" /D "%~dp0server" cmd /k ".venv\Scripts\python.exe app.py"

set /a _tries=0
:waithealth
curl -s -o nul -m 3 http://127.0.0.1:8000/health
if not errorlevel 1 goto healthok
set /a _tries+=1
if %_tries% geq 60 ( echo [경고] 서버 준비 확인 실패, 그래도 진행합니다. & goto healthok )
timeout /t 3 >nul
goto waithealth
:healthok
echo       서버 준비 완료.

rem ── 2) 프론트 dev 서버 (새 창) + 브라우저 ─────────────────
echo [2/2] 프론트 개발 서버 시작
start "이음 프론트(로컬)" /D "%~dp0" cmd /k "npm run dev"
start "" /b cmd /c "timeout /t 6 >nul && start http://localhost:5173"

echo.
echo 두 창(분석서버 / 프론트)이 뜹니다. 브라우저에서 http://localhost:5173 로 리허설하세요.
echo 종료하려면 두 창을 닫으면 됩니다.
echo.
pause
