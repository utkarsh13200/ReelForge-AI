Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)

# Ensure secrets never get staged
git reset HEAD -- .env .env.local scripts/.env.image.inject 2>$null | Out-Null

git add -A
git reset HEAD -- .env .env.local scripts/.env.image.inject 2>$null | Out-Null

# Drop local noise
git reset HEAD -- tsconfig.tsbuildinfo scripts/tmp-*.mjs scripts/smoke-latest.txt 2>$null | Out-Null

$status = git status --porcelain
if ($status) {
  $msg = @"
Add Cloudflare Workers AI and multi-key Gemini image generation.

Wire Puter/Cloudflare providers and try Gemini API key fallbacks for Visuals stills.
"@
  $msg | git commit -F -
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "No code changes to commit."
}

git push origin HEAD
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "GitHub push OK"

# Load secrets for Vercel without printing them
$envMap = @{}
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$') {
    $envMap[$Matches[1]] = $Matches[2]
  }
}

function Set-VercelEnv([string]$name, [string]$value, [string]$envName) {
  if (-not $value) { return }
  # Remove existing then add (non-interactive)
  vercel env rm $name $envName -y 2>$null | Out-Null
  $value | vercel env add $name $envName 2>&1 | Out-Null
  Write-Host "vercel env set $name ($envName)"
}

# Link project if needed
if (-not (Test-Path .vercel/project.json)) {
  Write-Host "Linking/creating Vercel project..."
  vercel link --yes --project ReelForge-AI 2>&1
  if ($LASTEXITCODE -ne 0) {
    vercel link --yes 2>&1
  }
}

$targets = @("production", "preview", "development")
$secretNames = @(
  "GEMINI_API_KEY",
  "GEMINI_API_KEY_2",
  "GEMINI_IMAGE_MODEL",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_IMAGE_MODEL"
)

foreach ($target in $targets) {
  foreach ($name in $secretNames) {
    if ($envMap.ContainsKey($name)) {
      Set-VercelEnv $name $envMap[$name] $target
    }
  }
}

Write-Host "Deploying to Vercel production..."
vercel --prod --yes
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "DONE"
git status -sb
gh repo view utkarsh13200/ReelForge-AI --json url -q .url
