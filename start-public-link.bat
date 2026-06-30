@echo off
setlocal
cd /d "%~dp0"
echo Starting public tunnel via serveo...
echo Keep this window open; close it to stop sharing.
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=20 -R 80:localhost:5173 serveo.net