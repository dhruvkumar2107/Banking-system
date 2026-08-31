@echo off
title Digital Pigmee - Stopping All Tiers
echo ============================================
echo   Digital Pigmee - Stopping All Services
echo ============================================
echo.

REM Stop Node.js processes (API + Admin)
echo Stopping API Server and Admin Panel...
taskkill /F /FI "WINDOWTITLE eq API Server*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Admin Panel*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Digital Pigmee API*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Digital Pigmee Admin*" >nul 2>&1

REM Stop Flutter/Chrome processes
echo Stopping Customer App...
taskkill /F /FI "WINDOWTITLE eq Customer App*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Digital Pigmee Customer*" >nul 2>&1
taskkill /F /IM flutter.exe >nul 2>&1
taskkill /F /IM dart.exe >nul 2>&1

REM Also kill any node processes on ports 3000 and 4000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo.
echo All services stopped.
echo ============================================
pause