@echo off
setlocal
title Digital Pigmee - Launcher
cd /d "%~dp0"

echo.
echo   ============================================
echo    Digital Pigmee - starting all three tiers
echo   ============================================
echo.

REM ---- dependencies -------------------------------------------------------
if not exist "node_modules" (
  echo   node_modules missing - running npm install ^(one time, few minutes^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install FAILED. Fix the error above, then run this file again.
    pause
    exit /b 1
  )
)

if not exist "apps\customer\build\web\index.html" (
  echo   WARNING: no Flutter web build at apps\customer\build\web
  echo            The customer tier will not start. To build it:
  echo              cd apps\customer  ^&^&  flutter build web --release
  echo.
)

REM ---- free our own ports only --------------------------------------------
REM 4000 API, 3001 admin, 5000 customer. Port 3000 is deliberately NOT touched:
REM another project uses it, and admin is pinned to 3001 to stay clear of it.
REM The API must be killed rather than reused - PGlite locks .data\pigmee to a
REM single connection, so a second instance cannot open the database at all.
echo   Releasing ports 4000, 3001, 5000 if anything is holding them...
for %%P in (4000 3001 5000) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /C:":%%P " ^| findstr /C:"LISTENING"') do (
    echo     port %%P was held by PID %%I - stopping it
    taskkill /F /PID %%I >nul 2>&1
  )
)
REM ping, not timeout: `timeout` aborts with "Input redirection is not supported"
REM whenever this file is run non-interactively.
ping -n 3 127.0.0.1 >nul

REM ---- launch each tier in its own window ---------------------------------
REM Separate windows so each tier's log stays readable and one crash is visible.
echo   Opening three service windows...
start "Pigmee API  (port 4000)"      cmd /k "npm run dev:api"
start "Pigmee Admin  (port 3001)"    /D "%CD%\apps\admin" cmd /k "npx next dev -p 3001"
start "Pigmee Customer  (port 5000)" cmd /k "node scripts\serve-customer.mjs"

REM ---- wait for readiness, then open the browser --------------------------
node scripts\wait-and-open.mjs

echo.
echo   This launcher window can be closed. The three service windows must
echo   stay open. To shut everything down, run STOP-ALL.bat.
echo.
pause
