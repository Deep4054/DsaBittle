@echo off
title DSA Dopamine Engine — Backend
color 0A
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   DSA Dopamine Engine — Backend     ║
echo  ║   NVIDIA NIM + FastAPI on :8000     ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "E:\GENAI\DsaBittle\backend"

REM Check if venv exists
if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found.
    echo Run: python -m venv venv  then  venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

echo [INFO] Starting FastAPI backend on http://localhost:8000
echo [INFO] Press Ctrl+C to stop
echo.
venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
