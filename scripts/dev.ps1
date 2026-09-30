# ReelForge AI — start dev server on port 3001 (always) and open the app.
# Usage: npm run dev

param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Drive = "Y:"
$Port = 3001
$AppUrl = "http://localhost:$Port"

function Ensure-SubstDrive {
  if (-not (Test-Path "${Drive}\")) {
    subst $Drive $ProjectRoot | Out-Null
    Write-Host "Mapped $Drive -> $ProjectRoot" -ForegroundColor DarkGray
  }
}

function Get-PortListener {
  param([int]$Port)
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Wait-ForServer {
  param([string]$Url, [int]$TimeoutSec = 90)
  for ($i = 0; $i -lt $TimeoutSec; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

Ensure-SubstDrive
Set-Location "${Drive}\"

$listener = Get-PortListener -Port $Port
if ($listener) {
  $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq "node") {
    Write-Host "ReelForge AI is already running at $AppUrl" -ForegroundColor Green
    if (-not $NoBrowser) {
      Start-Process $AppUrl
    }
    exit 0
  }

  Write-Host "Port $Port is in use by $($proc.ProcessName) (PID $($listener.OwningProcess)), not Node." -ForegroundColor Red
  Write-Host "Free port $Port or change the dev port in package.json." -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting ReelForge AI on http://localhost:$Port ..." -ForegroundColor Cyan

if (-not $NoBrowser) {
  Start-Job -ScriptBlock {
    param($Url)
    for ($i = 0; $i -lt 90; $i++) {
      try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
          Start-Process $Url
          break
        }
      } catch {
        Start-Sleep -Seconds 1
      }
    }
  } -ArgumentList $AppUrl | Out-Null
}

npx --yes next dev -p $Port
