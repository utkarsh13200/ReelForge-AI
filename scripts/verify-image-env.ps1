Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$needed = @(
  "GEMINI_API_KEY",
  "GEMINI_API_KEY_2",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN"
)
$map = @{}
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$') {
    $map[$Matches[1]] = $Matches[2]
  }
}
foreach ($k in $needed) {
  $v = $map[$k]
  if (-not $v) { Write-Host "MISSING $k"; continue }
  Write-Host "OK $k len=$($v.Length) prefix=$($v.Substring(0, [Math]::Min(4, $v.Length)))***"
}
