Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)

# Keep secrets / temp noise out of git
$exclude = @(
  "bench-cookies.txt",
  "bench-out-old.txt",
  "bench-visual.ps1",
  "scripts/smoke-latest.txt",
  "scripts/tmp-*.mjs",
  "scripts/tmp-*.ps1",
  ".data/"
)
Add-Content -Path .git/info/exclude -Value ($exclude -join "`n")

git status -sb
git diff --stat
git log -3 --oneline

git add -A

# Unstage anything that looks like secrets if accidentally added
git reset HEAD -- .env .env.local 2>$null

$status = git status --porcelain
if (-not $status) {
  Write-Host "No changes to commit. Pushing current main..."
  git push origin HEAD
  gh repo view --json url -q .url
  exit $LASTEXITCODE
}

$msg = @"
Verify all modules after smoke checks and sync to GitHub.

Keep the local demo studio pipeline green across Script through Export.
"@
$msg | git commit -F -
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed: $LASTEXITCODE"
  exit $LASTEXITCODE
}

git push origin HEAD
if ($LASTEXITCODE -ne 0) {
  Write-Host "Push failed: $LASTEXITCODE"
  exit $LASTEXITCODE
}

git status -sb
gh repo view utkarsh13200/ReelForge-AI --json url,pushedAt
Write-Host "DONE"
