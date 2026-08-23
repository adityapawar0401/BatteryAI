$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Dist = Join-Path $Root 'apps\web\dist'
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
$TempBase = Join-Path $Root '.tmp'
$TempRoot = Join-Path $TempBase ("reli-pages-{0}" -f ([guid]::NewGuid().ToString('N')))
$PagesRoot = Join-Path $TempRoot 'BatteryAI'
$Server = $null

try {
    if (-not (Test-Path -LiteralPath $Python)) { throw "Workspace Python is unavailable: $Python" }
    foreach ($Artifact in @('index.html', 'dashboard\index.html', 'contact\index.html')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Dist $Artifact))) { throw "Static refresh check requires dist/$Artifact." }
    }

    New-Item -ItemType Directory -Path $PagesRoot -Force | Out-Null
    Copy-Item -Path (Join-Path $Dist '*') -Destination $PagesRoot -Recurse -Force

    $PortProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $PortProbe.Start()
    $Port = ([System.Net.IPEndPoint]$PortProbe.LocalEndpoint).Port
    $PortProbe.Stop()

    $ServerOut = Join-Path $TempRoot 'server.out.log'
    $ServerErr = Join-Path $TempRoot 'server.err.log'
    $Server = Start-Process -WindowStyle Hidden -FilePath $Python -ArgumentList @(
        '-m', 'http.server', [string]$Port, '--bind', '127.0.0.1'
    ) -WorkingDirectory $TempRoot -RedirectStandardOutput $ServerOut -RedirectStandardError $ServerErr -PassThru

    $Checks = @(
        @{ Path = '/BatteryAI/'; Title = 'Re-Li | Battery health intelligence' },
        @{ Path = '/BatteryAI/dashboard/'; Title = 'Re-Li | Dashboard' },
        @{ Path = '/BatteryAI/contact/'; Title = 'Re-Li | Contact' }
    )

    foreach ($Check in $Checks) {
        $Uri = "http://127.0.0.1:$Port$($Check.Path)"
        $Response = $null
        for ($Attempt = 0; $Attempt -lt 30 -and -not $Response; $Attempt++) {
            try { $Response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 2 }
            catch {
                if ($Attempt -eq 29) { throw }
                Start-Sleep -Milliseconds 100
            }
        }
        if ($Response.StatusCode -ne 200) { throw "Direct refresh returned $($Response.StatusCode): $Uri" }
        if ($Response.Content -notmatch [regex]::Escape("<title>$($Check.Title)</title>")) { throw "Direct refresh returned the wrong page: $Uri" }
        Write-Host "  $($Check.Path) -> $($Response.StatusCode)"
    }
    Write-Host 'Strict static-server direct-refresh checks passed.'
}
finally {
    if ($Server -and -not $Server.HasExited) { Stop-Process -Id $Server.Id -Force }
    if (Test-Path -LiteralPath $TempRoot) {
        $ResolvedTemp = (Resolve-Path -LiteralPath $TempRoot).Path
        $ResolvedBase = (Resolve-Path -LiteralPath $TempBase).Path.TrimEnd('\')
        $ExpectedPrefix = "$ResolvedBase\reli-pages-"
        if (-not $ResolvedTemp.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove unexpected refresh-check directory: $ResolvedTemp"
        }
        Remove-Item -LiteralPath $ResolvedTemp -Recurse -Force
    }
}
