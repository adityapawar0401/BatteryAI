$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Web = Join-Path $Root 'apps\web'
& npm.cmd run build --prefix $Web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$Dist = Join-Path $Web 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $Dist 'index.html'))) { throw 'GitHub Pages artifact has no root index.html.' }
$Forbidden = Get-ChildItem -LiteralPath $Dist -Recurse -File | Where-Object { $_.Name -eq 'model.pt' -or $_.Extension -eq '.mat' }
if ($Forbidden) { throw "Forbidden model or raw dataset asset found in dist: $($Forbidden.FullName)" }
$Absolute = Get-ChildItem -LiteralPath $Dist -Recurse -File | Select-String -SimpleMatch 'C:\Users\'
if ($Absolute) { throw 'Absolute Windows path found in static build.' }
Write-Host "GitHub Pages artifact verified: $Dist"
