# ReelForge AI local setup (Windows)
# Usage: powershell -ExecutionPolicy Bypass -File scripts/setup.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "ReelForge AI setup" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"

# Avoid apostrophe issues in npm paths
$Drive = "Y:"
if (-not (Test-Path "${Drive}\")) {
  subst $Drive $ProjectRoot | Out-Null
  Write-Host "Mapped $Drive -> $ProjectRoot"
}

Set-Location "${Drive}\"

Write-Host "Installing dependencies..."
npm install

Write-Host "Approving postinstall scripts..."
npm approve-scripts ffmpeg-static esbuild 2>$null

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Created .env.local from template." -ForegroundColor Yellow
} else {
  Write-Host ".env.local already exists."
}

Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Green
Write-Host "1. Edit .env.local with your Supabase + LLM keys"
Write-Host "2. Supabase SQL Editor -> paste supabase/apply-all-migrations.sql -> Run"
Write-Host "3. npm run dev   -> http://localhost:3001/login"
Write-Host ""

Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
Write-Host "Starting dev server (port 3001) and opening browser..." -ForegroundColor Green
npm run dev
