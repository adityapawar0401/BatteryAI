param([string] $PairingToken = $env:BATTERYAI_PAIRING_TOKEN)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$LocalEndpoint = 'http://127.0.0.1:8000'
if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) { throw 'tailscale.exe is unavailable.' }
$Status = (& tailscale.exe status --json 2>&1 | Out-String) | ConvertFrom-Json
if ($Status.BackendState -ne 'Running' -or -not $Status.Self.Online) { throw 'Tailscale is not connected.' }
$Hostname = ([string]$Status.Self.DNSName).TrimEnd('.').ToLowerInvariant()
$FunnelUrl = "https://$Hostname"
if ([string]::IsNullOrWhiteSpace($env:BATTERYAI_REMOTE_API_URL)) { throw 'BATTERYAI_REMOTE_API_URL is not configured.' }
if ($env:BATTERYAI_REMOTE_API_URL.TrimEnd('/').ToLowerInvariant() -ne $FunnelUrl) { throw "Configured remote URL does not match $FunnelUrl" }
$Origin = @($env:BATTERYAI_ALLOWED_FRONTEND_ORIGINS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^https://[a-z0-9-]+\.github\.io$' }) | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($Origin)) { throw 'Configure an exact GitHub Pages origin in BATTERYAI_ALLOWED_FRONTEND_ORIGINS.' }

$Health = Invoke-RestMethod -Uri "$LocalEndpoint/health" -TimeoutSec 5
if ($Health.status -ne 'running') { throw 'Local FastAPI health check failed.' }
$PublicHealth = Invoke-RestMethod -Uri "$FunnelUrl/health" -TimeoutSec 15
if ($PublicHealth.status -ne 'running') { throw 'Public HTTPS Funnel health check failed.' }
try { Invoke-WebRequest -UseBasicParsing -Uri "$FunnelUrl/v1/capabilities" -TimeoutSec 15 | Out-Null; throw 'Pairing enforcement failed.' } catch { if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw } }
$Preflight = Invoke-WebRequest -UseBasicParsing -Method Options -Uri "$FunnelUrl/v1/infer" -Headers @{'Origin'=$Origin;'Access-Control-Request-Method'='POST';'Access-Control-Request-Headers'='X-BatteryAI-Token,Content-Type'} -TimeoutSec 15
if ($Preflight.Headers['Access-Control-Allow-Origin'] -ne $Origin) { throw 'Exact-origin CORS verification failed.' }

if ([string]::IsNullOrWhiteSpace($PairingToken) -and (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) '.dist\remote\service.out.log'))) {
    $Match = Select-String -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) '.dist\remote\service.out.log') -Pattern '^Pairing token: (.+)$' | Select-Object -Last 1
    if ($Match) { $PairingToken = $Match.Matches[0].Groups[1].Value }
}
if ([string]::IsNullOrWhiteSpace($PairingToken)) { throw 'Pass -PairingToken or run the check against a service started by start-remote.ps1.' }
$Headers = @{'X-BatteryAI-Token'=$PairingToken}
$Capabilities = Invoke-RestMethod -Uri "$FunnelUrl/v1/capabilities" -Headers $Headers -TimeoutSec 30
$Ollama = Invoke-RestMethod -Uri "$FunnelUrl/v1/llm-capabilities" -Headers $Headers -TimeoutSec 15
Write-Host "BATTERYAI_REMOTE_CHECK=PASSED"
Write-Host "Funnel URL: $FunnelUrl"
Write-Host "GitHub Pages origin: $Origin"
Write-Host "Numerical device: $($Capabilities.device)"
Write-Host "Checkpoint SHA-256: $($Capabilities.model_sha256)"
Write-Host "Ollama ready: $($Ollama.ready)"
