@echo off
echo 🚀 Starting Test Automation Framework on Windows...

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ Node.js not found. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js found

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ npm not found. Please ensure npm is properly installed.
    pause
    exit /b 1
)
echo ✅ npm found

REM Create required directories
echo 📁 Creating required directories...
if not exist "output" mkdir "output"
if not exist "output\recordings" mkdir "output\recordings"
if not exist "output\page-objects" mkdir "output\page-objects"
if not exist "output\tests" mkdir "output\tests"
if not exist "output\reports" mkdir "output\reports"
if not exist "output\screenshots" mkdir "output\screenshots"
if not exist "output\videos" mkdir "output\videos"
if not exist "test-results" mkdir "test-results"
if not exist "logs" mkdir "logs"
if not exist "temp" mkdir "temp"
echo ✅ Directories created

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
    if %ERRORLEVEL% neq 0 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if electron exists locally
if exist "node_modules\.bin\electron.cmd" (
    echo 🚀 Starting Electron using local installation...
    "node_modules\.bin\electron.cmd" .
) else (
    echo 🚀 Starting Electron using npx...
    npx electron .
)

if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to start Electron
    echo 💡 Try running: npm install electron
    pause
    exit /b 1
)

echo ✅ Application started successfully
pause