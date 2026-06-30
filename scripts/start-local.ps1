param(
    [ValidateSet('auto', 'cuda', 'cpu')]
    [string] $Device = 'auto',

    [ValidateRange(1024, 65535)]
    [int] $Port = 8000
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
$RuntimeRoot = Join-Path $Root 'services\local_inference'

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Required environment is missing: $Python"
}

if (-not (Test-Path -LiteralPath $RuntimeRoot)) {
    throw "Local inference runtime is missing: $RuntimeRoot"
}

$PreviousPythonPath = $env:PYTHONPATH
$PreviousLocation = Get-Location
$PathSeparator = [System.IO.Path]::PathSeparator

if ([string]::IsNullOrWhiteSpace($PreviousPythonPath)) {
    $env:PYTHONPATH = $RuntimeRoot
}
else {
    $env:PYTHONPATH = "$RuntimeRoot$PathSeparator$PreviousPythonPath"
}

$env:BATTERYAI_DEVICE = $Device

try {
    Set-Location $Root

    Write-Host "Starting BatteryAI local inference..."
    Write-Host "Repository: $Root"
    Write-Host "Runtime path: $RuntimeRoot"
    Write-Host "Device policy: $Device"
    Write-Host "Endpoint: http://127.0.0.1:$Port"
    Write-Host ""

    & $Python -m services.local_inference `
        --host 127.0.0.1 `
        --port $Port

    if ($LASTEXITCODE -ne 0) {
        throw "Local inference service exited with code $LASTEXITCODE."
    }
}
finally {
    Set-Location $PreviousLocation

    if ([string]::IsNullOrWhiteSpace($PreviousPythonPath)) {
        Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
    }
    else {
        $env:PYTHONPATH = $PreviousPythonPath
    }
}