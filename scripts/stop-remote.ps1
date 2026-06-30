$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) {
    throw (
        'tailscale.exe is not installed or is not on PATH. ' +
        'Install Tailscale or open a new terminal after installation.'
    )
}

# Run through cmd.exe so that normal native stderr output does not become a
# terminating NativeCommandError in Windows PowerShell 5.1.
$ResetOutput = & $env:ComSpec /d /s /c `
    'tailscale.exe funnel reset 2>&1'

$ResetExitCode = $LASTEXITCODE
$ResetText = ($ResetOutput | Out-String).Trim()

if (-not [string]::IsNullOrWhiteSpace($ResetText)) {
    Write-Host $ResetText
}

if ($ResetExitCode -ne 0) {
    throw (
        "Tailscale Funnel could not be disabled.`n" +
        "Exit code: $ResetExitCode`n" +
        "$ResetText"
    )
}

Write-Host 'BATTERYAI_REMOTE_STOPPED=TRUE'
Write-Host 'BatteryAI Funnel exposure is off.'