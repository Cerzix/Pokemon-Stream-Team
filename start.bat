@echo off
cd /d "%~dp0"
title Pokemon Stream Team
start "" http://localhost:8642/control
node server\index.js
pause
