@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  === CollIde ===
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [!] нет Node.js. поставь с https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo  [>] первый запуск, ставлю зависимости...
  call npm install
  if errorlevel 1 (
    echo  [!] npm install упал
    pause
    exit /b 1
  )
  echo.
)

echo  [>] http://localhost:3000
echo  [>] Ctrl+C чтобы стопнуть
echo.

start "" "http://localhost:3000"
call npm start
