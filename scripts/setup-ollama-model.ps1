$ErrorActionPreference = 'Stop'
$Model = 'llama3.2:3b'
$command = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $command) { throw 'Ollama is not installed or is not on PATH. Install the native Windows application separately, then rerun this script.' }
Write-Host "Pulling the explicitly requested local model: $Model"
& ollama pull $Model
if ($LASTEXITCODE -ne 0) { throw "ollama pull $Model failed with exit code $LASTEXITCODE." }
& (Join-Path $PSScriptRoot 'check-ollama.ps1')
