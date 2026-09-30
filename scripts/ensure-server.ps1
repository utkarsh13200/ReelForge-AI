$listening = netstat -ano | Select-String ":3001" | Select-String "LISTENING"
if (-not $listening) {
  Write-Host "starting_server"
  Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
  Start-Process -FilePath "npm" -ArgumentList "run","start" -WorkingDirectory (Get-Location) -WindowStyle Hidden
  Start-Sleep -Seconds 5
} else {
  Write-Host "server_already_up"
}

for ($i = 0; $i -lt 20; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3001" -UseBasicParsing -TimeoutSec 5
    Write-Host "ready" $r.StatusCode
    exit 0
  } catch {
    Start-Sleep -Seconds 2
  }
}
Write-Host "server_not_ready"
exit 1
