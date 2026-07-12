@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   이음 - KoBERT 분석 서버 + Cloudflare 터널
echo ============================================================
echo.
echo [1/2] 분석 서버를 새 창에서 실행합니다...
start "이음 KoBERT 서버" /d "%~dp0server" cmd /k "set PYTHONIOENCODING=utf-8 & python app.py"

echo [2/2] 서버 로딩 대기 (모델 불러오는 중, 약 40초)...
timeout /t 40 /nobreak >nul

echo.
echo ============================================================
echo   아래에 나오는 https://XXXX.trycloudflare.com 주소를 복사하세요.
echo   (이 창과 '이음 KoBERT 서버' 창을 세션 내내 켜 두세요!)
echo ============================================================
echo.
cloudflared.exe tunnel --url http://127.0.0.1:8000

echo.
echo 터널이 종료되었습니다. 창을 닫으려면 아무 키나 누르세요.
pause >nul
