$web3dRoot = Join-Path $PSScriptRoot "..\web-3d"
Set-Location $web3dRoot

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..."
  npm install
}

Write-Host "Starting 3D dev server at http://localhost:5173"
Write-Host "Plat data is served from ../web via /plat-web"
Write-Host "Press Ctrl+C to stop."
npm run dev
