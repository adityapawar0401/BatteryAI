$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Python)) { throw "Required environment is missing: $Python" }
Set-Location $Root
& $Python -m pytest tests\python -q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
