$webRoot = Join-Path $PSScriptRoot "..\web"
Set-Location $webRoot
Write-Host "Serving Delta Crossings plat map at http://localhost:8080"
Write-Host "2D map:  http://localhost:8080/index.html"
Write-Host "3D view: http://localhost:8080/3d/index.html  (run scripts/build-3d.ps1 first)"
Write-Host "Press Ctrl+C to stop."
python -m http.server 8080
