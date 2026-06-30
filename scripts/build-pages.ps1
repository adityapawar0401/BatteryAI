$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Web = Join-Path $Root 'apps\web'
& npm.cmd run build --prefix $Web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$Dist = Join-Path $Web 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $Dist 'index.html'))) { throw 'GitHub Pages artifact has no root index.html.' }
$Files = Get-ChildItem -LiteralPath $Dist -Recurse -File
$Forbidden = $Files | Where-Object {
    $_.Name -eq 'model.pt' -or $_.Extension -eq '.mat' -or $_.Name -like '*.onnx*' -or
    $_.FullName -match '(_inputs|batteryai-gpu-env|local-reports)'
}
if ($Forbidden) { throw "Forbidden private or runtime asset found in dist: $($Forbidden.FullName)" }
$PrivateText = $Files | Where-Object { $_.Extension -in '.html','.js','.css','.json','.map','.txt','.csv' } |
    Select-String -Pattern 'C:\\Users\\|Pairing token:|Oxford_Battery_Degradation_Dataset_1\.mat'
if ($PrivateText) { throw 'Private path, token text, or raw dataset name found in static build.' }
Write-Host "GitHub Pages artifact verified: $Dist"
