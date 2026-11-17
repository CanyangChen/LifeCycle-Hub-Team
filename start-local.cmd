@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js 24 LTS, then reopen this window. & pause & exit /b 1)
node start-team.mjs
if errorlevel 1 (pause & exit /b 1)
