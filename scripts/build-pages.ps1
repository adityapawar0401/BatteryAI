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
    if (-not (Test-Path -LiteralPath (Join-Path $Dist 'index.html'))) { throw 'GitHub Pages artifact has no landing index.html.' }
    if (-not (Test-Path -LiteralPath (Join-Path $Dist 'dashboard\index.html'))) { throw 'GitHub Pages artifact has no dashboard/index.html, so /dashboard/ would 404 on direct refresh.' }
    $Files = Get-ChildItem -LiteralPath $Dist -Recurse -File
    $Forbidden = $Files | Where-Object {
        $_.Name -eq 'model.pt' -or $_.Extension -eq '.mat' -or $_.Name -like '*.onnx*' -or
        $_.Name -in @('landingpage.txt', 'dashboard.txt') -or
        $_.FullName -match '(_inputs|batteryai-gpu-env|local-reports)'
    }
    if ($Forbidden) { throw "Forbidden private, runtime, or design-reference asset found in dist: $($Forbidden.FullName)" }
    $Text = $Files | Where-Object { $_.Extension -in '.html','.js','.css','.json','.map','.txt','.csv' }
    $PrivateText = $Text | Select-String -Pattern 'C:\\Users\\|Pairing token:|Oxford_Battery_Degradation_Dataset_1\.mat'
    if ($PrivateText) { throw "Private path, token text, or raw dataset name found in static build: $($PrivateText[0].Path)" }
    $FakeText = $Text | Select-String -Pattern 'cdn\.tailwindcss\.com|Transformer-V4|LIVE DATA STREAM|SYSTEMS NOMINAL|Adaptive Charging|Kinetic Energy Intelligence|Request deployment|99\.8\s*%?\s*accuracy|Prediction accuracy'
    if ($FakeText) { throw "CDN script or unsupported marketing claim found in static build: $($FakeText[0].Path)" }
    $EmDashText = $Text | Select-String -SimpleMatch ([string][char]0x2014)
    if ($EmDashText) { throw "Customer-facing em dash found in static build: $($EmDashText[0].Path)" }
    # Customer-facing HTML must never carry internal implementation vocabulary.
    # Bundled JS keeps API contract strings, which is required for the app to work.
    $Markup = Get-ChildItem -LiteralPath $Dist -Recurse -File -Filter '*.html'
    $InternalText = $Markup | Select-String -Pattern 'Oxford|PIMoE|Ollama|llama3\.2|ONNX|FastAPI|Tailscale|Funnel|GitHub Pages|CUDA|SHA-256|active experts|masked experts|model profile|RUL |next-observed-checkpoint|loopback|host computer'
    if ($InternalText) { throw "Internal implementation term found in rendered markup: $($InternalText[0].Path) -> $($InternalText[0].Line.Trim())" }
    Write-Host "GitHub Pages artifact verified: $Dist"
    Write-Host '  landing   -> dist/index.html'
    Write-Host '  dashboard -> dist/dashboard/index.html'
}
finally {
    Set-Location $PreviousLocation
    $env:VITE_BATTERYAI_REMOTE_MODE = $PreviousRemoteMode
    $env:VITE_BATTERYAI_REMOTE_API_URL = $PreviousRemoteUrl
}
