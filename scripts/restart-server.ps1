Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)

$lines = netstat -ano | Select-String ":3001" | Select-String "LISTENING"
$seen = @{}
foreach ($line in $lines) {
  if ($line -match "\s+(\d+)\s*$") {
    $procId = [int]$Matches[1]
    if (-not $seen.ContainsKey($procId)) {
      $seen[$procId] = $true
      Write-Host "killing $procId"
      taskkill /PID $procId /F 2>$null | Out-Null
    }
  }
}
Start-Sleep -Seconds 2

Write-Host "building..."
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "DONE_BUILD"
