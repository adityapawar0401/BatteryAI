$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Web = Join-Path $Root 'apps\web'
$PreviousRemoteMode = $env:VITE_BATTERYAI_REMOTE_MODE
$PreviousRemoteUrl = $env:VITE_BATTERYAI_REMOTE_API_URL
$PreviousLocation = Get-Location
try {
    if ($env:BATTERYAI_REMOTE_MODE -in @('1', 'true', 'True')) {
        $env:VITE_BATTERYAI_REMOTE_MODE = '1'
        $env:VITE_BATTERYAI_REMOTE_API_URL = $env:BATTERYAI_REMOTE_API_URL
    }
    Set-Location $Web
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "GitHub Pages build failed with code $LASTEXITCODE." }
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
}
finally {
    Set-Location $PreviousLocation
    $env:VITE_BATTERYAI_REMOTE_MODE = $PreviousRemoteMode
    $env:VITE_BATTERYAI_REMOTE_API_URL = $PreviousRemoteUrl
}
