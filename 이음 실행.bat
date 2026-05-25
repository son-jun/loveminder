@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ================================
echo   이음 (Ieum) 개발 서버 시작
echo ================================
echo.
if not exist node_modules (
  echo [최초 실행] 의존성을 설치합니다. 몇 분 걸려요...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install 실패. Node.js 가 설치되어 있는지 확인하세요.
    pause
    exit /b 1
  )
)
if not exist .env.local (
  echo.
  echo [주의] .env.local 파일이 없습니다.
  echo  - 로그인/저장 기능을 쓰려면 Supabase 키 설정이 필요합니다.
  echo  - 자세한 내용은 README.md 를 확인하세요.
  echo.
  echo 그래도 화면 미리보기는 가능합니다. 5초 후 시작합니다...
  timeout /t 5 >nul
)
rem 서버 뜨는 데 시간이 필요하므로, 5초 후 브라우저 열기
start "" /b cmd /c "timeout /t 5 >nul && start http://localhost:5173"
call npm run dev
pause
