@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 24 is required. & pause & exit /b 1)
node build.mjs || (pause & exit /b 1)
echo Open http://127.0.0.1:8080 in your browser. Press Ctrl+C to stop.
node standalone.mjs --local
if errorlevel 1 pause
