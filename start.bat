@echo off
setlocal
cd /d "%~dp0"

echo [Memory Reconstruction] Starting game environment...

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found in PATH.
    echo Please install Node.js 20+ from https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not found in PATH.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [Memory Reconstruction] Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [Memory Reconstruction] Launching development server on http://localhost:3000...
call npm run dev
