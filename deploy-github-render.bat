@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================
echo Design Studio AI 部署助手
echo ==========================
echo.
echo 此脚本支持：
echo 1) init/switch main branch
echo 2) commit current changes
echo 3) push to GitHub repository
echo 4) open Render console link
echo.

if not exist ".git\" (
  echo .git not found, initialize repository...
  git init
)

git branch -M main

echo Ready to commit current snapshot.
git add .
set /p commitMessage=Enter commit message [default chore: update design studio ai]:
if "%commitMessage%"=="" set commitMessage=chore: update design studio ai

git commit -m "%commitMessage%" >nul 2>nul
if %errorlevel% neq 0 (
  echo No new files to commit, keep existing commit history.
)

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "GITHUB_REMOTE=%%R"
if not defined GITHUB_REMOTE (
  echo.
  echo Remote origin is missing.
  set /p GITHUB_REMOTE=Enter GitHub HTTPS url (example: https://github.com/yourname/design-studio-ai.git):
  if "%GITHUB_REMOTE%"=="" (
    echo Empty remote url, stop.
    pause
    exit /b 1
  )
  git remote add origin "%GITHUB_REMOTE%"
)

echo.
set /p pushNow=Push now to origin main? (Y/N, default Y):
if /I "%pushNow%"=="N" (
  echo Push skipped. Please complete push first then deploy Render.
  pause
  exit /b 0
)

git push -u origin main
if %errorlevel% neq 0 (
  echo.
  echo Push failed. Common causes: token/credentials, no permission, or wrong repo name.
  echo Check branch/repo and try again.
  pause
  exit /b 1
)

echo.
echo Push successful.
set /p openRender=Open Render Console now? (Y/N, default Y):
if /I "%openRender%"=="N" (
  echo.
  echo Render setup checklist:
  echo 1) New -> Web Service
  echo 2) Connect repository: %GITHUB_REMOTE%
  echo 3) Build Command: (empty)
  echo 4) Start Command: node server.js
  echo 5) Add env: OPENAI_API_KEY / OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL
  echo.
  pause
  exit /b 0
)

start "" "https://dashboard.render.com/"
pause
exit /b 0
