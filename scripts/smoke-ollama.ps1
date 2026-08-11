param([string] $BaseUrl = 'http://127.0.0.1:11434')
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Python)) { throw "Required environment is missing: $Python" }
& $Python (Join-Path $PSScriptRoot 'smoke_ollama.py') --base-url $BaseUrl
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
