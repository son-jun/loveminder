@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv" (
  echo [이음] 최초 실행: 가상환경 생성 및 의존성 설치...
  rem --system-site-packages: 이미 설치된 torch 등을 재사용해 대용량 재다운로드 방지
  if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
    "%LocalAppData%\Programs\Python\Python311\python.exe" -m venv --system-site-packages .venv
  ) else (
    py -3.11 -m venv --system-site-packages .venv
  )
  call .venv\Scripts\activate.bat
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate.bat
)
echo [이음] KoBERT 분석 서버 시작 (http://127.0.0.1:8000)
python app.py
pause
