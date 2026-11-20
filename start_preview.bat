@echo off
echo ====================================================
echo  Starting Student Grading System Preview Server
echo  URL: http://localhost:8080
echo ====================================================
start http://localhost:8080
python -m http.server 8080 --directory frontend
pause
