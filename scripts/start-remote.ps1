param(
    [ValidateSet('auto', 'cuda', 'cpu')]
    [string] $Device = 'auto',
    [ValidateRange(1024, 65535)]
    [int] $Port = 8000
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
$RuntimeRoot = Join-Path $Root 'services\local_inference'
$ReportDirectory = Join-Path $Root '.dist\remote'
$StdoutLog = Join-Path $ReportDirectory 'service.out.log'
$StderrLog = Join-Path $ReportDirectory 'service.err.log'
$LocalEndpoint = "http://127.0.0.1:$Port"

if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) { throw 'tailscale.exe is not installed or is not on PATH. Install and sign in to Tailscale manually.' }
if (-not (Test-Path -LiteralPath $Python)) { throw "Required environment is missing: $Python" }

$Status = (& tailscale.exe status --json 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw "Tailscale status failed. Sign in and connect the installed client first.`n$Status" }
$StatusJson = $Status | ConvertFrom-Json
if ($StatusJson.BackendState -ne 'Running' -or -not $StatusJson.Self.Online) { throw 'Tailscale is not logged in and online.' }
$DnsName = ([string]$StatusJson.Self.DNSName).TrimEnd('.').ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($DnsName)) { throw 'Tailscale did not report a stable MagicDNS hostname.' }
$ExpectedFunnelUrl = "https://$DnsName"

$FunnelHelp = (& tailscale.exe funnel --help 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $FunnelHelp -notmatch '(?i)funnel') { throw 'The installed Tailscale client does not report Funnel support.' }
if ($FunnelHelp -notmatch '(?m)--bg\b') { throw 'This Tailscale client does not expose the supported --bg Funnel syntax. Update Tailscale manually, then retry.' }

if ([string]::IsNullOrWhiteSpace($env:BATTERYAI_REMOTE_API_URL)) { throw "Set BATTERYAI_REMOTE_API_URL to $ExpectedFunnelUrl before starting remote mode." }
if ($env:BATTERYAI_REMOTE_API_URL.TrimEnd('/').ToLowerInvariant() -ne $ExpectedFunnelUrl) { throw "BATTERYAI_REMOTE_API_URL must exactly match this machine's Funnel hostname: $ExpectedFunnelUrl" }
if ([string]::IsNullOrWhiteSpace($env:BATTERYAI_ALLOWED_FRONTEND_ORIGINS)) { throw 'Set BATTERYAI_ALLOWED_FRONTEND_ORIGINS to the exact GitHub Pages origin, for example https://USERNAME.github.io.' }

$env:BATTERYAI_REMOTE_MODE = '1'
$env:BATTERYAI_DEVICE = $Device
$PathSeparator = [System.IO.Path]::PathSeparator
if ([string]::IsNullOrWhiteSpace($env:PYTHONPATH)) { $env:PYTHONPATH = $RuntimeRoot } else { $env:PYTHONPATH = "$RuntimeRoot$PathSeparator$env:PYTHONPATH" }
$Validation = (& $Python -c "from services.local_inference.deployment import load_deployment_config; from pathlib import Path; c=load_deployment_config(Path.cwd()); print(c.remote_api_url)" 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $Validation -ne $ExpectedFunnelUrl) { throw "Remote deployment configuration is invalid.`n$Validation" }

New-Item -ItemType Directory -Force -Path $ReportDirectory | Out-Null
Remove-Item -LiteralPath $StdoutLog,$StderrLog -Force -ErrorAction SilentlyContinue
$Service = $null
$FunnelStarted = $false
try {
    Set-Location $Root
    $Service = Start-Process -WindowStyle Hidden -FilePath $Python -ArgumentList @('-m','services.local_inference','--host','127.0.0.1','--port',[string]$Port) -WorkingDirectory $Root -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog -PassThru
    $Deadline = (Get-Date).AddSeconds(180)
    do {
        if ($Service.HasExited) { throw "BatteryAI exited before becoming healthy. See $StderrLog" }
        try { $Health = Invoke-RestMethod -Uri "$LocalEndpoint/health" -TimeoutSec 3; $Ready = $Health.status -eq 'running' } catch { $Ready = $false }
        if (-not $Ready) { Start-Sleep -Milliseconds 500 }
    } until ($Ready -or (Get-Date) -gt $Deadline)
    if (-not $Ready) { throw 'BatteryAI did not become healthy within 180 seconds.' }

    & tailscale.exe funnel --bg $LocalEndpoint
    if ($LASTEXITCODE -ne 0) { throw 'Tailscale Funnel failed to start. Complete any required interactive Tailscale setup manually and retry.' }
    $FunnelStarted = $true

    Start-Sleep -Milliseconds 500
    $Banner = Get-Content -Raw -LiteralPath $StdoutLog
    Write-Host $Banner.Trim()
    Write-Host "Stable Funnel URL: $ExpectedFunnelUrl"
    Write-Host "Local endpoint: $LocalEndpoint"
    Write-Warning 'Never publish the pairing token. Anyone with both the Funnel URL and token can use this computer''s resources.'
    Write-Host 'Remote exposure is active. Press Ctrl+C to stop the service and Funnel.'
    Wait-Process -Id $Service.Id
}
finally {
    if ($Service -and -not $Service.HasExited) { Stop-Process -Id $Service.Id -Force -ErrorAction SilentlyContinue; $Service.WaitForExit(10000) | Out-Null }
    if ($FunnelStarted) { & (Join-Path $PSScriptRoot 'stop-remote.ps1') }
}
