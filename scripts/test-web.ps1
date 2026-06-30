$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
& npm.cmd run typecheck --prefix (Join-Path $Root 'apps\web')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm.cmd run test --prefix (Join-Path $Root 'apps\web')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
