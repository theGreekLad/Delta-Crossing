$webRoot = Join-Path $PSScriptRoot "..\web"
Set-Location $webRoot
Write-Host "Serving Delta Crossings plat map at http://localhost:8080"
Write-Host "Press Ctrl+C to stop."
python -m http.server 8080
