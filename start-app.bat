@echo off
setlocal
cd /d "%~dp0"

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" server.js
  goto :end
)

where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
  goto :end
)

echo Node.js was not found.
echo Please install Node.js or start this app from Codex.
pause

:end
endlocal
