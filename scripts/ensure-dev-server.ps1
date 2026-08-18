# Ensures the Next.js dev server is running on port 3001 (background, no browser).
# Used by Cursor sessionStart hook and npm run dev:ensure

$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Drive = "Y:"
$Port = 3001
$LogDir = Join-Path $ProjectRoot ".cursor"
$LogFile = Join-Path $LogDir "dev-server.log"
$PidFile = Join-Path $LogDir "dev-server.pid"

if (-not (Test-Path $Drive)) {
  subst $Drive $ProjectRoot | Out-Null
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1

if ($listener) {
  $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq "node") {
    exit 0
  }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startScript = @"
Set-Location '$Drive\'
`$env:FORCE_COLOR = '0'
npx --yes next dev -p $Port 2>&1 | Tee-Object -FilePath '$LogFile'
"@

Start-Process powershell `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $startScript) `
  -WindowStyle Hidden `
  -WorkingDirectory "${Drive}\"

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($listener) {
    $listener.OwningProcess | Out-File -FilePath $PidFile -Encoding ascii -Force
    exit 0
  }
}

exit 1
