$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) { throw 'tailscale.exe is not installed or is not on PATH.' }
$Help = (& tailscale.exe funnel --help 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the installed Tailscale Funnel commands.' }
if ($Help -match '(?m)^\s*reset\s') {
    & tailscale.exe funnel reset
}
elseif ($Help -match '(?i)\boff\b') {
    & tailscale.exe funnel off
}
else {
    throw 'The installed Tailscale CLI exposes neither Funnel reset nor off. Run tailscale funnel --help and disable Funnel using the documented command.'
}
if ($LASTEXITCODE -ne 0) { throw 'Tailscale Funnel could not be disabled.' }
Write-Host 'BatteryAI Funnel exposure is off.'
