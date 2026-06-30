$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$PreviousLocation = Get-Location
try {
    Set-Location (Join-Path $Root 'apps\web')
    & npm.cmd run typecheck
    if ($LASTEXITCODE -ne 0) { throw "TypeScript checking failed with code $LASTEXITCODE." }
    & npm.cmd run test
    if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed with code $LASTEXITCODE." }
}
finally {
    Set-Location $PreviousLocation
}
