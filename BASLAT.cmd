@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:4399"
node scripts\serve.mjs --dist
pause
