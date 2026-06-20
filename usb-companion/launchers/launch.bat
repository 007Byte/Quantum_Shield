@echo off
:: USBVault Enterprise — Windows Launcher
:: Double-click this file to start USBVault from your USB drive.
:: No installation required. No admin required for daily use.

setlocal enabledelayedexpansion
title USBVault Enterprise Edition

:: ── Configuration ────────────────────────────────────────────────────
set MAX_RESTARTS=5
set RESTART_DELAY=2
set PORT_RANGE_START=3001
set PORT_RANGE_END=3005
set MIN_NODE_VERSION=20

set USB_STANDALONE_MODE=true
set NODE_ENV=production

echo ========================================
echo    USBVault Enterprise Edition
echo    Portable Encrypted File Storage
echo ========================================
echo.

:: Find our location
set "SCRIPT_DIR=%~dp0"
set "USB_ROOT=%SCRIPT_DIR%"

:: ── Find Node.js ─────────────────────────────────────────────────────
if exist "%USB_ROOT%node\node.exe" (
    set "NODE=%USB_ROOT%node\node.exe"
    echo Using portable Node.js: %NODE%
) else (
    where node >nul 2>nul
    if !ERRORLEVEL! equ 0 (
        set "NODE=node"
        echo Using system Node.js
    ) else (
        echo.
        echo ERROR: Node.js not found.
        echo Please install Node.js 20+ or place a portable copy in %USB_ROOT%node\
        echo.
        pause
        exit /b 1
    )
)

:: ── Verify Node.js version ──────────────────────────────────────────
for /f "tokens=1 delims=." %%v in ('"%NODE%" --version 2^>nul') do set "NODE_VER=%%v"
set "NODE_VER=%NODE_VER:v=%"

if "%NODE_VER%"=="" (
    echo ERROR: Could not determine Node.js version.
    pause
    exit /b 1
)

if %NODE_VER% LSS %MIN_NODE_VERSION% (
    echo.
    echo ERROR: Node.js %MIN_NODE_VERSION%+ is required ^(found: v%NODE_VER%^).
    echo Please update Node.js or place a compatible portable copy in %USB_ROOT%node\
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('"%NODE%" --version 2^>nul') do echo Node.js version: %%v

:: ── Find companion directory ─────────────────────────────────────────
set "COMPANION_DIR=%USB_ROOT%companion"
if not exist "%COMPANION_DIR%" set "COMPANION_DIR=%USB_ROOT%"

:: Set up log file
set "LOG_FILE=%COMPANION_DIR%\companion.log"
echo --- USBVault Companion started %date% %time% --- >> "%LOG_FILE%"

:: ── Detect available port ────────────────────────────────────────────
set COMPANION_PORT=
for /l %%p in (%PORT_RANGE_START%,1,%PORT_RANGE_END%) do (
    if not defined COMPANION_PORT (
        netstat -an 2>nul | findstr "LISTENING" | findstr ":%%p " >nul 2>nul
        if !ERRORLEVEL! neq 0 (
            set COMPANION_PORT=%%p
        ) else (
            echo Port %%p is in use, trying next...
        )
    )
)

if not defined COMPANION_PORT (
    echo.
    echo ERROR: No available port in range %PORT_RANGE_START%-%PORT_RANGE_END%.
    echo Please close the application using one of these ports and try again.
    echo.
    pause
    exit /b 1
)

set USB_COMPANION_PORT=%COMPANION_PORT%
echo Using port: %COMPANION_PORT%

:: Write port to file so frontend can discover it
echo %COMPANION_PORT% > "%COMPANION_DIR%\.companion-port"

:: ── Start companion with watchdog ────────────────────────────────────
set RESTART_COUNT=0

:start_companion
cd /d "%COMPANION_DIR%"
echo Starting USBVault companion service...
start /b "" "%NODE%" src/server.js >> "%LOG_FILE%" 2>&1

:: Wait for service to be ready
echo Waiting for service...
set SERVICE_READY=0
for /l %%i in (1,1,30) do (
    if !SERVICE_READY! equ 0 (
        timeout /t 1 /nobreak >nul
        curl -s http://127.0.0.1:%COMPANION_PORT%/health >nul 2>nul
        if !ERRORLEVEL! equ 0 set SERVICE_READY=1
    )
)

if %SERVICE_READY% equ 0 (
    echo.
    echo ERROR: Companion service did not start within 30 seconds.
    echo Check the log file: %LOG_FILE%
    echo.
    pause
    exit /b 1
)

echo Service ready!

:: Only open browser on first start (not restarts)
if %RESTART_COUNT% equ 0 (
    echo Opening USBVault in your browser...
    start http://127.0.0.1:%COMPANION_PORT%
)

echo.
echo USBVault is running on port %COMPANION_PORT%.
echo Close this window to stop.
echo Remember to eject your USB drive safely when done.
echo.

:: ── Monitor companion process ────────────────────────────────────────
:monitor_loop
timeout /t 3 /nobreak >nul
curl -s http://127.0.0.1:%COMPANION_PORT%/health >nul 2>nul
if !ERRORLEVEL! equ 0 goto monitor_loop

:: Companion is not responding — attempt restart
set /a RESTART_COUNT+=1
echo [%date% %time%] Companion stopped unexpectedly (restart %RESTART_COUNT%/%MAX_RESTARTS%) >> "%LOG_FILE%"
echo Companion stopped unexpectedly (restart %RESTART_COUNT%/%MAX_RESTARTS%).

if %RESTART_COUNT% geq %MAX_RESTARTS% (
    echo.
    echo ERROR: Companion has crashed %MAX_RESTARTS% times. Giving up.
    echo Check the log file: %LOG_FILE%
    del /q "%COMPANION_DIR%\.companion-port" 2>nul
    echo.
    pause
    exit /b 1
)

echo Restarting in %RESTART_DELAY% seconds...
timeout /t %RESTART_DELAY% /nobreak >nul
goto start_companion
