@echo off
title Start Meal Connect App

REM Change to the directory where this script is located
cd /d "%~dp0"

echo.
echo Navigating to %cd%...
echo.

if not exist package.json (
    echo Error: The directory does not seem to contain an npm project.
    pause
    exit /b 1
)

echo Running npm start...
echo.

npm start

echo.
echo The application has been started.
pause