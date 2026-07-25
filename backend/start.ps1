$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
  Write-Host "Creating Python virtual environment..."
  python -m venv .venv
  $python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
}

Write-Host "Installing backend dependencies..."
& $python -m pip install --upgrade pip
& $python -m pip install fastapi uvicorn httpx python-dotenv

Write-Host ""
Write-Host "Starting TradeCoach API on http://127.0.0.1:8000"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

& $python -m uvicorn main:app --reload --port 8000
