@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  === CollIde ===
echo.

where node >nul 2>&1
if errorlevel 1 goto :noNode

if exist "node_modules\" goto :hasModules

echo  [^>] pervyi zapusk, stavlyu zavisimosti...
call npm install
if errorlevel 1 goto :installFail
echo.

:hasModules
echo  [^>] http://localhost:3000
echo  [^>] Ctrl+C chtoby stopnut
echo.

start "" "http://localhost:3000"
call npm start
goto :eof

:noNode
echo  [!] net Node.js. postav s https://nodejs.org
echo.
pause
exit /b 1

:installFail
echo  [!] npm install upal
pause
exit /b 1