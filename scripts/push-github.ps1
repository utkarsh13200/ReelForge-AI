Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
Write-Host "cwd:" (Get-Location)

# Ignore local noise / secrets
@"
bench-cookies.txt
bench-out-old.txt
bench-visual.ps1
scripts/smoke-latest.txt
scripts/tmp-voice-check.mjs
scripts/tmp-voice-e2e.mjs
scripts/tmp-*.mjs
"@ | Out-File -FilePath .git/info/exclude -Encoding utf8 -Append

git add -A
git status -sb

$msg = @"
Ship local demo studio with working pipeline modules.

Replace Supabase auth with a local demo store, harden Visuals/Voice/Edit/Export, and keep production modules usable without cloud login.
"@

$msg | git commit -F -
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit may have failed or nothing to commit. Exit=$LASTEXITCODE"
}

git push -u origin HEAD
if ($LASTEXITCODE -ne 0) {
  Write-Host "Push failed. Trying gh auth..."
  gh auth status
  exit $LASTEXITCODE
}

git status -sb
gh repo view --json url -q .url
Write-Host "DONE"
