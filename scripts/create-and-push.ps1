Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)

gh repo view utkarsh13200/ReelForge-AI | Out-Null
$viewCode = $LASTEXITCODE

if ($viewCode -ne 0) {
  Write-Host "Creating github.com/utkarsh13200/ReelForge-AI ..."
  gh repo create utkarsh13200/ReelForge-AI --public --description "ReelForge AI - topic to finished YouTube video studio"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Repo create failed with $LASTEXITCODE"
    exit $LASTEXITCODE
  }
} else {
  Write-Host "Repo already exists."
}

Write-Host "Pushing main..."
git push -u origin HEAD
if ($LASTEXITCODE -ne 0) {
  Write-Host "Push failed with $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "---"
gh repo view utkarsh13200/ReelForge-AI --json url,name,isPrivate,pushedAt
git status -sb
Write-Host "DONE"
