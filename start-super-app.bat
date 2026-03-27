@echo off
echo Starting Super App...
cd "c:\Users\My-PC\Desktop\bin app\bin-group-super-app"
echo Installing dependencies (this may take a minute if it's the first time)...
call npm install
echo.
echo =======================================================
echo SERVER IS STARTING...
echo Open your phone's browser and go to the "Network" URL listed below!
echo =======================================================
call npm run dev -- --host
pause
