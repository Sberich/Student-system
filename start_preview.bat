@echo off
echo ====================================================
echo  Starting Student Grading System Preview Server
echo  URL: http://localhost:8090
echo ====================================================
cd /d "%~dp0frontend"
start http://localhost:8090
python -m http.server 8090
pause
