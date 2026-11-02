@echo off
chcp 65001 >nul
title Taqam
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required: https://nodejs.org
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -v') do set NV=%%v
set NV=%NV:v=%
if %NV% LSS 22 (
  echo Node.js 22 or newer is required. You have %NV%.
  pause
  exit /b 1
)
if "%PORT%"=="" set PORT=8080
start "" http://localhost:%PORT%/
node --no-warnings server.js
pause
