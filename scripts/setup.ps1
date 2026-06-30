$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
$Requirements = Join-Path $Root 'requirements-deployment.txt'
$WebRoot = Join-Path $Root 'apps\web'
$PackageJson = Join-Path $WebRoot 'package.json'
$PackageLock = Join-Path $WebRoot 'package-lock.json'

function Assert-NativeSuccess {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Step
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE."
    }
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Required environment is missing: $Python"
}

if (-not (Test-Path -LiteralPath $Requirements)) {
    throw "Deployment requirements file is missing: $Requirements"
}

if (-not (Test-Path -LiteralPath $PackageJson)) {
    throw "Frontend package.json is missing: $PackageJson"
}

if (-not (Test-Path -LiteralPath $PackageLock)) {
    throw "Frontend package-lock.json is missing: $PackageLock"
}

Write-Host "Checking existing PyTorch installation..."

$Before = & $Python -c "import torch; print(torch.__version__)"
Assert-NativeSuccess -Step "Reading the existing PyTorch version"

Write-Host "Installing Python deployment dependencies..."

& $Python -m pip install -r $Requirements
Assert-NativeSuccess -Step "Python dependency installation"

& $Python -m pip check
Assert-NativeSuccess -Step "Python dependency validation"

$After = & $Python -c "import torch; print(torch.__version__)"
Assert-NativeSuccess -Step "Reading the final PyTorch version"

if ($Before.Trim() -ne $After.Trim()) {
    throw (
        "Setup changed PyTorch from '$Before' to '$After'. " +
        "The CUDA-enabled PyTorch installation must be preserved."
    )
}

Write-Host "Checking CUDA runtime..."

$CudaCheck = "import torch; print('torch=', torch.__version__); print('cuda_available=', torch.cuda.is_available()); print('device=', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU fallback')"

& $Python -c $CudaCheck
Assert-NativeSuccess -Step "CUDA runtime check"

Write-Host "Checking frontend tools..."

& node --version
Assert-NativeSuccess -Step "Node.js version check"

& npm.cmd --version
Assert-NativeSuccess -Step "npm version check"

Write-Host "Installing frontend dependencies in: $WebRoot"

Push-Location $WebRoot

try {
    & npm.cmd ci
    Assert-NativeSuccess -Step "Frontend dependency installation"
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host (
    "BatteryAI setup complete. " +
    "PyTorch preserved at $($After.Trim())."
) -ForegroundColor Green