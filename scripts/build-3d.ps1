$web3dRoot = Join-Path $PSScriptRoot "..\web-3d"
Set-Location $web3dRoot

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..."
  npm install
}

Write-Host "Building 3D app to web/3d ..."
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Build complete. Serve the site from web/ with scripts/serve.ps1"
Write-Host "3D view: http://localhost:8080/3d/index.html"
