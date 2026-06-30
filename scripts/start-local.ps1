param([ValidateSet('auto','cuda','cpu')][string]$Device = 'auto', [ValidateRange(1024,65535)][int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Python)) { throw "Required environment is missing: $Python" }
$env:BATTERYAI_DEVICE = $Device
Set-Location $Root
& $Python -m services.local_inference --host 127.0.0.1 --port $Port
