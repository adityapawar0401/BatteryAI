$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $Root 'scripts\preflight.ps1')
& (Join-Path $Root 'scripts\test-python.ps1')
& (Join-Path $Root 'scripts\test-web.ps1')
& (Join-Path $Root 'scripts\build-pages.ps1')
Write-Host 'BATTERYAI_TEST_ALL=PASSED'
