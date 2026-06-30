param([ValidateRange(1024,65535)][int]$Port = 5173)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Write-Host "BatteryAI web: http://127.0.0.1:$Port"
& npm.cmd run dev --prefix (Join-Path $Root 'apps\web') -- --host 127.0.0.1 --port $Port
