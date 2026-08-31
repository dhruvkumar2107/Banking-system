@echo off
title Digital Pigmee - Starting All Tiers
echo ============================================
echo   Digital Pigmee - Corporate Bank Platform
echo   Starting API + Admin + Customer App
echo ============================================
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: Run this from the project root directory
    pause
    exit /b 1
)

echo [1/5] Installing/updating dependencies...
npm install >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: npm install had issues, continuing...
)

echo [2/5] Installing Flutter dependencies...
cd apps\customer
flutter pub get >nul 2>&1
cd ..\..
if %errorlevel% neq 0 (
    echo WARNING: flutter pub get had issues, continuing...
)

echo [3/5] Running database migrations...
npm run migrate >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Migration had issues, continuing...
)

echo [4/5] Seeding database...
npm run seed >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Seed had issues, continuing...
)

echo [5/5] Starting all three tiers in separate windows...
echo.

REM Start API Server (port 4000)
start "Digital Pigmee API" cmd /k "cd /d "%~dp0" && title API Server (port 4000) && echo Starting API Server... && npm run dev:api"

REM Wait for API to be ready
echo Waiting for API to be ready on http://localhost:4000 ...
:wait_api
curl.exe -s http://localhost:4000/health >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak >nul
    goto wait_api
)
echo API is ready!

REM Start Admin Panel (port 3000)
start "Digital Pigmee Admin" cmd /k "cd /d "%~dp0\apps\admin" && title Admin Panel (port 3000) && echo Starting Admin Panel... && npm run dev"

REM Wait for Admin to be ready
echo Waiting for Admin to be ready on http://localhost:3000 ...
:wait_admin
curl.exe -s http://localhost:3000 >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak >nul
    goto wait_admin
)
echo Admin is ready!

REM Start Customer App (Chrome)
start "Digital Pigmee Customer" cmd /k "cd /d "%~dp0\apps\customer" && title Customer App (Chrome) && echo Starting Customer App in Chrome... && flutter run --dart-define=API_BASE_URL=http://localhost:4000/api -d chrome"

echo.
echo ============================================
echo All three tiers are starting!
echo ============================================
echo.
echo API Server:     http://localhost:4000
echo Swagger Docs:   http://localhost:4000/docs
echo Admin Panel:    http://localhost:3000
echo Customer App:   Opens in Chrome automatically
echo.
echo Seeded Admin:   admin@pigmee.bank / Admin@12345
echo Seeded Customer: 9876543210 (OTP echoed in dev)
echo.
echo Close the three command windows to stop all services.
echo ============================================
pause