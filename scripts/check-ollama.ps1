$ErrorActionPreference = 'Stop'
$Model = 'llama3.2:3b'
$BaseUrl = 'http://127.0.0.1:11434'
$command = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $command) { throw 'Ollama is not installed or is not on PATH. Install the native Windows application separately.' }
Write-Host "ollama_command=$($command.Source)"
& ollama --version
$version = Invoke-RestMethod -Uri "$BaseUrl/api/version" -TimeoutSec 5
Write-Host "ollama_api_version=$($version.version)"
$tags = Invoke-RestMethod -Uri "$BaseUrl/api/tags" -TimeoutSec 5
$installed = @($tags.models | ForEach-Object { if ($_.name) { $_.name } else { $_.model } })
if ($Model -notin $installed) { throw "Required model is missing. Run: ollama pull $Model" }
Write-Host "model_installed=$Model"
& (Join-Path $PSScriptRoot 'smoke-ollama.ps1') -BaseUrl $BaseUrl
$placement = 'unknown (Ollama did not report a loaded processor placement)'
$processRows = @(& ollama ps 2>$null)
$modelRow = $processRows | Where-Object { $_ -match [regex]::Escape($Model) } | Select-Object -First 1
if ($modelRow -match '100%\s+GPU') { $placement = 'GPU' }
elseif ($modelRow -match '100%\s+CPU') { $placement = 'CPU' }
elseif ($modelRow -match '\d+%\s+GPU') { $placement = 'mixed CPU/GPU' }
Write-Host "processor_placement=$placement"
Write-Host 'BATTERYAI_OLLAMA_CHECK=PASSED'
