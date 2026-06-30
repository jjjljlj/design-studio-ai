@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================
echo Design Studio AI 部署助手
echo ==========================
echo.
echo 此脚本支持：
echo 1) 初始化/切换 main 分支
echo 2) 提交当前修改
echo 3) 推送到 GitHub 仓库
echo 4) 给你打开 Render 控制台链接
echo.

if not exist ".git\" (
  echo 未检测到 .git，先初始化仓库...
  git init
)

git branch -M main

echo 请先确认代码无误，建议先在 .gitignore 检查不要提交敏感文件。
git add .
set /p commitMessage=请输入本次提交说明（回车默认使用「chore: update design studio ai」）:
if "%commitMessage%"=="" set commitMessage=chore: update design studio ai

git commit -m "%commitMessage%" >nul 2>nul
if %errorlevel% neq 0 (
  echo 当前无可提交文件，继续使用既有提交记录...
)

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "GITHUB_REMOTE=%%R"
if not defined GITHUB_REMOTE (
  echo.
  echo 请先配置 GitHub 远程仓库地址。
  set /p GITHUB_REMOTE=请输入仓库 HTTPS 地址（例如 https://github.com/你的用户名/design-studio-ai.git）:
  if "%GITHUB_REMOTE%"=="" (
    echo 未填写仓库地址，脚本停止。
    pause
    exit /b 1
  )
  git remote add origin "%GITHUB_REMOTE%"
)

echo.
set /p pushNow=是否推送到 origin main？(Y/N, 默认 Y):
if /I "%pushNow%"=="N" (
  echo 已跳过推送。请先完成仓库推送后再部署 Render。
  pause
  exit /b 0
)

git push -u origin main
if %errorlevel% neq 0 (
  echo.
  echo 推送失败。常见原因：SSH/Token 未配置、仓库无权限或仓库名错误。
  echo 建议使用同名仓库重新运行，或先检查身份授权后重试。
  pause
  exit /b 1
)

echo.
echo 推送成功！请前往 Render 新建服务。
set /p openRender=现在打开 Render 控制台？(Y/N, 默认 Y):
if /I "%openRender%"=="N" (
  echo.
  echo 完成以下渲染配置：
  echo 1) New -> Web Service
  echo 2) 选择 GitHub 仓库：%GITHUB_REMOTE%
  echo 3) Build Command 保持空
  echo 4) Start Command 填写：node server.js
  echo 5) 环境变量添加 OPENAI_API_KEY / OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL
  echo.
  pause
  exit /b 0
)

start "" "https://dashboard.render.com/"
pause
exit /b 0
