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

# ---------------------------------------------------------------------------
# Required local programs and environment
# ---------------------------------------------------------------------------

if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) {
    throw (
        'tailscale.exe is not installed or is not on PATH. ' +
        'Install Tailscale, sign in, and open a new VS Code window.'
    )
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Required BatteryAI environment is missing: $Python"
}

# ---------------------------------------------------------------------------
# Read Tailscale status safely on Windows PowerShell 5.1
#
# Running through cmd.exe prevents normal native stderr output from being
# converted into a terminating NativeCommandError by PowerShell.
# ---------------------------------------------------------------------------

$StatusOutput = & $env:ComSpec /d /s /c `
    'tailscale.exe status --json 2>&1'

$StatusExitCode = $LASTEXITCODE
$StatusText = ($StatusOutput | Out-String).Trim()

if ($StatusExitCode -ne 0) {
    throw (
        "Unable to read Tailscale status. " +
        "Exit code: $StatusExitCode`n$StatusText"
    )
}

try {
    $Status = $StatusText | ConvertFrom-Json
}
catch {
    throw (
        "Tailscale returned invalid status JSON.`n" +
        "$StatusText`n" +
        "Parser error: $($_.Exception.Message)"
    )
}

if ($Status.BackendState -ne 'Running') {
    throw (
        "Tailscale is not running. Backend state: " +
        "$($Status.BackendState)"
    )
}

if (-not $Status.Self.Online) {
    throw 'Tailscale is running but this computer is not online.'
}

$DnsName = ([string] $Status.Self.DNSName).
    Trim().
    TrimEnd('.').
    ToLowerInvariant()

if ([string]::IsNullOrWhiteSpace($DnsName)) {
    throw 'Tailscale did not report a stable MagicDNS hostname.'
}

$ExpectedFunnelUrl = "https://$DnsName"

# ---------------------------------------------------------------------------
# Confirm that the installed Tailscale client supports Funnel background mode
# ---------------------------------------------------------------------------

$FunnelHelpOutput = & $env:ComSpec /d /s /c `
    'tailscale.exe funnel --help 2>&1'

$FunnelHelpExitCode = $LASTEXITCODE
$FunnelHelp = ($FunnelHelpOutput | Out-String).Trim()

if ($FunnelHelpExitCode -ne 0) {
    throw (
        "Unable to inspect the installed Tailscale Funnel command. " +
        "Exit code: $FunnelHelpExitCode`n$FunnelHelp"
    )
}

if ($FunnelHelp -notmatch '(?i)\bfunnel\b') {
    throw 'The installed Tailscale client does not report Funnel support.'
}

if ($FunnelHelp -notmatch '(?m)--bg\b') {
    throw (
        'The installed Tailscale client does not expose the required ' +
        '--bg Funnel option. Update Tailscale manually and retry.'
    )
}

# ---------------------------------------------------------------------------
# Validate required BatteryAI remote deployment configuration
# ---------------------------------------------------------------------------

if ([string]::IsNullOrWhiteSpace($env:BATTERYAI_REMOTE_API_URL)) {
    throw (
        "BATTERYAI_REMOTE_API_URL is not configured.`n" +
        "Set it to:`n" +
        "`$env:BATTERYAI_REMOTE_API_URL = '$ExpectedFunnelUrl'"
    )
}

$ConfiguredRemoteUrl = $env:BATTERYAI_REMOTE_API_URL.
    Trim().
    TrimEnd('/').
    ToLowerInvariant()

if ($ConfiguredRemoteUrl -ne $ExpectedFunnelUrl) {
    throw (
        "BATTERYAI_REMOTE_API_URL must exactly match this computer's " +
        "Tailscale Funnel URL.`n" +
        "Expected: $ExpectedFunnelUrl`n" +
        "Actual:   $ConfiguredRemoteUrl"
    )
}

if (
    [string]::IsNullOrWhiteSpace(
        $env:BATTERYAI_ALLOWED_FRONTEND_ORIGINS
    )
) {
    throw (
        'BATTERYAI_ALLOWED_FRONTEND_ORIGINS is not configured. ' +
        'Set it to the exact GitHub Pages origin, such as ' +
        'https://USERNAME.github.io'
    )
}

$env:BATTERYAI_REMOTE_MODE = '1'
$env:BATTERYAI_DEVICE = $Device

$PathSeparator = [System.IO.Path]::PathSeparator

if ([string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
    $env:PYTHONPATH = $RuntimeRoot
}
else {
    $env:PYTHONPATH = (
        "$RuntimeRoot$PathSeparator$env:PYTHONPATH"
    )
}

# ---------------------------------------------------------------------------
# Validate the deployment configuration through BatteryAI itself
# ---------------------------------------------------------------------------

$ValidationCode = (
    'from services.local_inference.deployment import ' +
    'load_deployment_config; ' +
    'from pathlib import Path; ' +
    'config = load_deployment_config(Path.cwd()); ' +
    'print(config.remote_api_url)'
)

$ValidationOutput = @()
$ValidationExitCode = -1
$PreviousErrorActionPreference = $ErrorActionPreference

Push-Location $Root

try {
    # Native stderr is allowed temporarily so warnings do not become
    # terminating PowerShell errors.
    $ErrorActionPreference = 'Continue'

    $ValidationOutput = & $Python -c $ValidationCode 2>&1
    $ValidationExitCode = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
    Pop-Location
}

$ValidationText = (
    $ValidationOutput |
        ForEach-Object { $_.ToString() } |
        Out-String
).Trim()

$ValidationLines = @(
    $ValidationText -split '\r?\n' |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
)

$ValidatedRemoteUrl = ''

if ($ValidationLines.Count -gt 0) {
    $ValidatedRemoteUrl = (
        $ValidationLines |
            Select-Object -Last 1
    ).TrimEnd('/').ToLowerInvariant()
}

if ($ValidationExitCode -ne 0) {
    throw (
        "BatteryAI remote deployment configuration validation failed.`n" +
        "$ValidationText"
    )
}

if ($ValidatedRemoteUrl -ne $ExpectedFunnelUrl) {
    throw (
        "BatteryAI resolved an unexpected remote URL.`n" +
        "Expected: $ExpectedFunnelUrl`n" +
        "Resolved: $ValidatedRemoteUrl`n" +
        "$ValidationText"
    )
}

# ---------------------------------------------------------------------------
# Prepare runtime logs
# ---------------------------------------------------------------------------

New-Item `
    -ItemType Directory `
    -Force `
    -Path $ReportDirectory |
    Out-Null

Remove-Item `
    -LiteralPath $StdoutLog, $StderrLog `
    -Force `
    -ErrorAction SilentlyContinue

$Service = $null
$FunnelStarted = $false

try {
    # -----------------------------------------------------------------------
    # Start FastAPI on loopback only
    # -----------------------------------------------------------------------

    $Service = Start-Process `
        -WindowStyle Hidden `
        -FilePath $Python `
        -ArgumentList @(
            '-u',
            '-m',
            'services.local_inference',
            '--host',
            '127.0.0.1',
            '--port',
            [string] $Port
        ) `
        -WorkingDirectory $Root `
        -RedirectStandardOutput $StdoutLog `
        -RedirectStandardError $StderrLog `
        -PassThru

    $Deadline = (Get-Date).AddSeconds(180)
    $Ready = $false

    do {
        if ($Service.HasExited) {
            $ServiceError = ''

            if (Test-Path -LiteralPath $StderrLog) {
                $ServiceError = Get-Content `
                    -Raw `
                    -LiteralPath $StderrLog `
                    -ErrorAction SilentlyContinue
            }

            throw (
                "BatteryAI exited before becoming healthy.`n" +
                "See: $StderrLog`n" +
                "$ServiceError"
            )
        }

        try {
            $Health = Invoke-RestMethod `
                -Uri "$LocalEndpoint/health" `
                -TimeoutSec 3

            $Ready = $Health.status -eq 'running'
        }
        catch {
            $Ready = $false
        }

        if (-not $Ready) {
            Start-Sleep -Milliseconds 500
        }
    }
    until ($Ready -or (Get-Date) -gt $Deadline)

    if (-not $Ready) {
        throw (
            'BatteryAI did not become healthy within 180 seconds. ' +
            "See $StderrLog"
        )
    }

    # -----------------------------------------------------------------------
    # Start Tailscale Funnel safely
    # -----------------------------------------------------------------------

    $FunnelStartCommand = (
        "tailscale.exe funnel --bg $LocalEndpoint 2>&1"
    )

    $FunnelStartOutput = & $env:ComSpec /d /s /c `
        $FunnelStartCommand

    $FunnelStartExitCode = $LASTEXITCODE
    $FunnelStartText = (
        $FunnelStartOutput |
            Out-String
    ).Trim()

    if (-not [string]::IsNullOrWhiteSpace($FunnelStartText)) {
        Write-Host $FunnelStartText
    }

    if ($FunnelStartExitCode -ne 0) {
        throw (
            "Tailscale Funnel failed to start.`n" +
            "Exit code: $FunnelStartExitCode`n" +
            "$FunnelStartText`n`n" +
            'Complete any Tailscale authorization or Funnel enablement ' +
            'shown above, then run BatteryAI: Start Remote again.'
        )
    }

    $FunnelStarted = $true

    # Allow the background Funnel configuration to settle.
    Start-Sleep -Seconds 2

    # -----------------------------------------------------------------------
    # Print BatteryAI startup information, including the pairing token
    # -----------------------------------------------------------------------

    $Banner = ''
    $BannerDeadline = (Get-Date).AddSeconds(15)

    do {
        if (Test-Path -LiteralPath $StdoutLog) {
            $Banner = Get-Content `
                -Raw `
                -LiteralPath $StdoutLog `
                -ErrorAction SilentlyContinue
        }

        if ($Banner -notmatch '(?m)^Pairing token:\s+.+$') {
            Start-Sleep -Milliseconds 250
        }
    }
    until (
        $Banner -match '(?m)^Pairing token:\s+.+$' -or
        (Get-Date) -gt $BannerDeadline
    )

    if (-not [string]::IsNullOrWhiteSpace($Banner)) {
        Write-Host $Banner.Trim()
    }
    else {
        Write-Warning (
            "BatteryAI started, but no startup banner was found in " +
            "$StdoutLog"
        )
    }

    Write-Host ''
    Write-Host 'BATTERYAI_REMOTE_STARTED=TRUE'
    Write-Host "Stable Funnel URL: $ExpectedFunnelUrl"
    Write-Host "Local endpoint: $LocalEndpoint"
    Write-Host "GitHub Pages origins: $env:BATTERYAI_ALLOWED_FRONTEND_ORIGINS"

    Write-Warning (
        'Never publish the pairing token. Anyone with both the Funnel URL ' +
        'and token can use this computer''s CPU, GPU, and Ollama resources.'
    )

    Write-Host ''
    Write-Host (
        'Remote exposure is active. Keep this terminal open. ' +
        'Press Ctrl+C to stop BatteryAI and disable Funnel.'
    )

    # Keep this launcher alive for as long as the FastAPI service is alive.
    Wait-Process -Id $Service.Id
}
finally {
    # -----------------------------------------------------------------------
    # Stop FastAPI
    # -----------------------------------------------------------------------

    if ($Service) {
        try {
            $Service.Refresh()

            if (-not $Service.HasExited) {
                Stop-Process `
                    -Id $Service.Id `
                    -Force `
                    -ErrorAction SilentlyContinue

                $Service.WaitForExit(10000) | Out-Null
            }
        }
        catch {
            Write-Warning (
                "Unable to stop the BatteryAI child process cleanly: " +
                "$($_.Exception.Message)"
            )
        }
    }

    # -----------------------------------------------------------------------
    # Disable public Funnel exposure
    # -----------------------------------------------------------------------

    if ($FunnelStarted) {
        try {
            & (Join-Path $PSScriptRoot 'stop-remote.ps1')
        }
        catch {
            Write-Warning (
                'BatteryAI stopped, but automatic Funnel shutdown failed. ' +
                "Run BatteryAI: Stop Remote manually.`n" +
                "$($_.Exception.Message)"
            )
        }
    }
}