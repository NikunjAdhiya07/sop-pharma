@echo off
echo ========================================
echo   SOP MCQ Bank Generator - Quick Start
echo ========================================
echo.

REM Check if .env.local exists
if not exist .env.local (
    echo [ERROR] .env.local file not found!
    echo.
    echo Please create .env.local file with your credentials:
    echo 1. Copy ENV_TEMPLATE.txt to .env.local
    echo 2. Add your MongoDB URI
    echo 3. Add your Google AI API Key
    echo.
    echo See SETUP_GUIDE.md for detailed instructions.
    echo.
    pause
    exit /b 1
)

echo [OK] .env.local file found
echo.

REM Check if node_modules exists
if not exist node_modules (
    echo [INFO] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
    echo.
)

echo [INFO] Starting development server...
echo.
echo Application will be available at:
echo   http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

call npm run dev
