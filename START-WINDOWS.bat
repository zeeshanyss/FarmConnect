@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 18 or newer is required. Install from https://nodejs.org/ & pause & exit /b 1)
if not exist .env (
  copy .env.example .env >nul
  echo Created .env. Edit it and set MONGO_URI and a strong JWT_SECRET before running.
  notepad .env
)
call npm install
if errorlevel 1 (echo npm install failed. Check your internet connection. & pause & exit /b 1)
echo Starting FarmConnect...
call npm run dev
pause
