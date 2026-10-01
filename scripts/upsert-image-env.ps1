# Upserts image-provider secrets into .env.local WITHOUT printing values.
# Reads from scripts/.env.image.inject (gitignored) if present.
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$path = Join-Path (Get-Location) ".env.local"
$inject = Join-Path $PSScriptRoot ".env.image.inject"
if (-not (Test-Path $path)) { New-Item -ItemType File -Path $path | Out-Null }

$pairs = @{}
if (Test-Path $inject) {
  Get-Content -LiteralPath $inject | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim()
    if ($k) { $pairs[$k] = $v }
  }
}

if ($pairs.Count -eq 0) {
  Write-Host "No keys found in scripts/.env.image.inject"
  exit 1
}

$lines = @(Get-Content -LiteralPath $path -ErrorAction SilentlyContinue)
$kept = @()
foreach ($line in $lines) {
  $drop = $false
  foreach ($k in $pairs.Keys) {
    if ($line -match ("^\s*" + [regex]::Escape($k) + "\s*=")) { $drop = $true; break }
  }
  if (-not $drop) { $kept += $line }
}

$kept += ""
$kept += "# Image providers (updated by scripts/upsert-image-env.ps1)"
foreach ($k in ($pairs.Keys | Sort-Object)) {
  $kept += "$k=$($pairs[$k])"
}

Set-Content -LiteralPath $path -Value $kept -Encoding utf8
Remove-Item -LiteralPath $inject -Force -ErrorAction SilentlyContinue
Write-Host "Updated .env.local with" $pairs.Count "keys. Inject file removed. Secrets not printed."
