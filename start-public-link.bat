@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ======================================
echo Design Studio AI - Public Share Launcher
echo ======================================
echo Keep this window open; close it to stop sharing.
echo.

echo.
echo Trying LocalTunnel first...
powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -Command "$base = Join-Path $env:USERPROFILE 'AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node'; $npm = Get-ChildItem -Path $base -Recurse -Filter npm.cmd -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*\\bin\\npm.cmd' } | Select-Object -First 1 -ExpandProperty FullName; if (-not $npm) { Write-Host 'LocalTunnel: npm not found. Fallback to Serveo.'; exit 1 }; $env:Path = [System.IO.Path]::GetDirectoryName($npm) + ';' + $env:Path; & $npm exec --yes localtunnel -- --port 5173"
if %errorlevel%==0 goto :end
echo.
echo LocalTunnel failed, fallback to Serveo.

echo.
echo Trying Serveo...
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=20 -R 80:localhost:5173 serveo.net

:end
