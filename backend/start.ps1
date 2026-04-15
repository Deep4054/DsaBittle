# DSA Dopamine Engine — Backend Startup Script
# This script activates the venv and starts the FastAPI server
# Usage: .\start.ps1

Write-Host "🧠 DSA Dopamine Engine — Starting Backend..." -ForegroundColor Cyan

# Check for .env file
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  No .env file found. Creating from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env — open it and add your NVIDIA_NIM_API_KEY" -ForegroundColor Green
    Write-Host "   Get your key at: https://build.nvidia.com/" -ForegroundColor Gray
    Write-Host ""
}

# Check for venv
if (-not (Test-Path "venv\Scripts\python.exe")) {
    Write-Host "📦 Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    .\venv\Scripts\python.exe -m pip install -r requirements.txt --quiet
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
}

# Activate and run
Write-Host "🚀 Starting FastAPI on http://localhost:8000" -ForegroundColor Green
Write-Host "   API Docs: http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "   Press Ctrl+C to stop`n" -ForegroundColor Gray

.\venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
