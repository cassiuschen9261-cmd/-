param(
    [ValidateSet('1', '2', '3', '4', '5', '6', '7', '8')]
    [string]$Choice,
    
    [int]$Port = 0,
    [string]$DataDir = "",
    [string]$InstanceName = "",
    [string]$RuntimeDir = ""
)

# 允许从环境变量继承
if ($Port -eq 0 -and $env:PORT) { $Port = [int]$env:PORT }
if ([string]::IsNullOrWhiteSpace($DataDir) -and $env:DATA_DIR) { $DataDir = $env:DATA_DIR }
if ([string]::IsNullOrWhiteSpace($InstanceName) -and $env:INSTANCE_NAME) { $InstanceName = $env:INSTANCE_NAME }
if ([string]::IsNullOrWhiteSpace($RuntimeDir) -and $env:RUNTIME_DIR) { $RuntimeDir = $env:RUNTIME_DIR }

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $ProjectRoot

$DefaultRuntimeRoot = Join-Path $ProjectRoot '.cache\runtime'
$DefaultDataDir = Join-Path $ProjectRoot 'data'

# 解析 DataDir 绝对路径
if ([string]::IsNullOrWhiteSpace($DataDir)) {
    $ResolvedDataDir = $DefaultDataDir
} elseif (-not [System.IO.Path]::IsPathRooted($DataDir)) {
    $ResolvedDataDir = Join-Path $ProjectRoot $DataDir
} else {
    $ResolvedDataDir = $DataDir
}

# 解析 RuntimeDir 绝对路径
if ([string]::IsNullOrWhiteSpace($RuntimeDir)) {
    if ([string]::IsNullOrWhiteSpace($InstanceName) -and $ResolvedDataDir -eq $DefaultDataDir) {
        $ResolvedRuntimeDir = $DefaultRuntimeRoot
    } else {
        $safeName = $InstanceName -replace '[<>:"/\\|?*\s]+', '-' -replace '-+', '-' -replace '^-|-$', ''
        if ([string]::IsNullOrWhiteSpace($safeName)) {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($ResolvedDataDir)
            $hash = [System.Security.Cryptography.SHA1]::Create().ComputeHash($bytes)
            $hex = [System.BitConverter]::ToString($hash).Replace("-","").ToLower().Substring(0,8)
            $safeName = "instance-$hex"
        }
        $ResolvedRuntimeDir = Join-Path $DefaultRuntimeRoot $safeName
    }
} elseif (-not [System.IO.Path]::IsPathRooted($RuntimeDir)) {
    $ResolvedRuntimeDir = Join-Path $ProjectRoot $RuntimeDir
} else {
    $ResolvedRuntimeDir = $RuntimeDir
}

# 注入环境变量供 Node 使用
if ($Port -gt 0) { $env:PORT = $Port }
if (-not [string]::IsNullOrWhiteSpace($DataDir)) { $env:DATA_DIR = $ResolvedDataDir }
if (-not [string]::IsNullOrWhiteSpace($InstanceName)) { $env:INSTANCE_NAME = $InstanceName }
$env:RUNTIME_DIR = $ResolvedRuntimeDir

$PortFile = Join-Path $ResolvedRuntimeDir '.server-port'
$PidFile = Join-Path $ResolvedRuntimeDir '.server-pid'
$LogFile = Join-Path $ResolvedRuntimeDir 'server_launcher.log'

# 快捷方式根据实例区分
$ShortcutName = if ([string]::IsNullOrWhiteSpace($InstanceName)) { "PaibanLauncher" } else { "PaibanLauncher_$InstanceName" }
$StartupShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\$ShortcutName.lnk"

function U {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    return [regex]::Replace(
        $Text,
        '\\u([0-9a-fA-F]{4})',
        {
            param($Match)
            return [char][int]::Parse(
                $Match.Groups[1].Value,
                [System.Globalization.NumberStyles]::HexNumber
            )
        }
    )
}

function Write-LauncherLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    New-Item -ItemType Directory -Force -Path $ResolvedRuntimeDir | Out-Null
    Add-Content -LiteralPath $LogFile -Value "[$timestamp] $Message"
}

function Test-CommandExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Assert-NodeReady {
    if (-not (Test-CommandExists -Name 'node')) {
        throw 'Node.js was not found. Please install Node.js first.'
    }
}

function Assert-DependenciesReady {
    if (Test-Path -LiteralPath (Join-Path $ProjectRoot 'node_modules')) {
        return
    }

    Write-Host (U '\u6B63\u5728\u5B89\u88C5\u4F9D\u8D56\uff0C\u8BF7\u7A0D\u5019...')
    Write-LauncherLog '[INFO] node_modules is missing. Running npm install.'
    & npm install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE."
    }
}

function Remove-RuntimeState {
    Remove-Item -LiteralPath $PortFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Get-ServerPort {
    if (-not (Test-Path -LiteralPath $PortFile)) {
        return $null
    }

    $raw = (Get-Content -LiteralPath $PortFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($raw -match '^\d+$') {
        return [int]$raw
    }

    return $null
}

function Get-ServerPid {
    if (-not (Test-Path -LiteralPath $PidFile)) {
        return $null
    }

    $raw = (Get-Content -LiteralPath $PidFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($raw -match '^\d+$') {
        return [int]$raw
    }

    return $null
}

function Assert-NoDanglingRuntime {
    # Check if PID file exists but process is dead, clean it up
    $serverPid = Get-ServerPid
    if ($serverPid -and -not (Get-Process -Id $serverPid -ErrorAction SilentlyContinue)) {
        Write-LauncherLog ("[INFO] Found dangling PID {0}. Cleaning up runtime state." -f $serverPid)
        Remove-RuntimeState
    }
}

function Test-ServerHealth {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    try {
        $response = Invoke-RestMethod -Uri ("http://localhost:{0}/api/health" -f $Port) -Method Get -TimeoutSec 3
        return $response.status -eq 'ok'
    } catch {
        return $false
    }
}

function Wait-ServerReady {
    param(
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $port = Get-ServerPort
        if ($port -and (Test-ServerHealth -Port $port)) {
            return $port
        }
        Start-Sleep -Milliseconds 400
    }

    return $null
}

function Get-PreferredBrowserPath {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
        "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    return $candidates | Select-Object -First 1
}

function Open-SystemBrowser {
    param(
        [int]$Port
    )

    if (-not $Port) {
        $Port = Get-ServerPort
    }

    if (-not $Port) {
        throw 'No valid port was found. Cannot open the web page.'
    }

    $url = "http://localhost:$Port"
    $browser = Get-PreferredBrowserPath
    if ($browser) {
        Start-Process -FilePath $browser -ArgumentList $url | Out-Null
    } else {
        Start-Process $url | Out-Null
    }
}

function Start-BrowserWhenServerReady {
    param(
        [string]$PortFilePath
    )

    Start-Job -ScriptBlock {
        param($portFile)

        $deadline = (Get-Date).AddSeconds(20)
        while ((Get-Date) -lt $deadline) {
            if (Test-Path -LiteralPath $portFile) {
                $raw = (Get-Content -LiteralPath $portFile -Raw -ErrorAction SilentlyContinue).Trim()
                if ($raw -match '^\d+$') {
                    try {
                        $health = Invoke-RestMethod -Uri ("http://localhost:{0}/api/health" -f $raw) -Method Get -TimeoutSec 2
                        if ($health -and $health.status -eq 'ok') {
                            $url = "http://localhost:$raw"
                            $candidates = @(
                                "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                                "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
                                "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
                                "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
                                "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
                                "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"
                            ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

                            $browser = $candidates | Select-Object -First 1
                            if ($browser) {
                                Start-Process -FilePath $browser -ArgumentList $url | Out-Null
                            } else {
                                Start-Process $url | Out-Null
                            }
                            break
                        }
                    } catch {
                    }
                }
            }
            Start-Sleep -Milliseconds 250
        }
    } -ArgumentList $RootPath | Out-Null
}

function Stop-PaibanServer {
    param(
        [switch]$UseFallbackScan
    )

    $stopped = $false
    
    # 1. Try stopping by stored PID
    $serverPid = Get-ServerPid
    if ($serverPid) {
        if (Get-Process -Id $serverPid -ErrorAction SilentlyContinue) {
            Write-LauncherLog ("[INFO] Attempting to stop PID {0}..." -f $serverPid)
            & taskkill.exe /PID $serverPid /T /F *> $null
            if ($LASTEXITCODE -eq 0) {
                $stopped = $true
                Write-LauncherLog ("[INFO] Stopped PID {0} via taskkill." -f $serverPid)
            } else {
                try {
                    Stop-Process -Id $serverPid -Force -ErrorAction Stop
                    $stopped = $true
                    Write-LauncherLog ("[INFO] Stopped PID {0} via Stop-Process." -f $serverPid)
                } catch {
                    Write-LauncherLog ("[WARN] Failed to stop PID {0}: {1}" -f $serverPid, $_.Exception.Message)
                }
            }
        } else {
            Write-LauncherLog ("[INFO] Stored PID {0} is no longer running." -f $serverPid)
        }
    }

    # 2. Try stopping by Port (much faster than scanning all processes)
    $port = Get-ServerPort
    if ($port) {
        try {
            # Use a more efficient way to get port owner
            $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if ($connections) {
                foreach ($connection in $connections) {
                    $pid = $connection.OwningProcess
                    if ($pid -gt 0) {
                        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                        $stopped = $true
                        Write-LauncherLog ("[INFO] Stopped process {1} listening on port {0}." -f $port, $pid)
                    }
                }
            }
        } catch {}
    }

    # 3. Fallback scan - only if requested and still not stopped
    # 为避免误杀其他科室的多实例，仅在默认实例下才执行 Fallback 暴力扫描
    if ($UseFallbackScan -and -not $stopped -and ($ResolvedRuntimeDir -eq $DefaultRuntimeRoot)) {
        Write-LauncherLog "[INFO] Performing fallback process cleanup..."
        # Find all node processes running server.js in this project root
        $projectPathEscaped = [regex]::Escape($ProjectRoot)
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -and
                $_.CommandLine -match 'server\.js' -and
                $_.CommandLine -match $projectPathEscaped
            } |
            ForEach-Object {
                try {
                    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                    $stopped = $true
                    Write-LauncherLog ("[INFO] Cleaned leftover process {0}." -f $_.ProcessId)
                } catch {}
            }
    }

    Remove-RuntimeState
    return $stopped
}

function Start-VisibleServer {
    Assert-NodeReady
    Assert-DependenciesReady
    Assert-NoDanglingRuntime
    Stop-PaibanServer -UseFallbackScan | Out-Null
    Remove-RuntimeState
    Write-LauncherLog '[INFO] Starting server in visible mode.'
    
    $host.UI.RawUI.WindowTitle = 'PAIBAN_SERVER_VISIBLE'
    
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host (U '          \u6B63\u5728\u542F\u52A8\u53EF\u89C1\u670D\u52A1...') -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""

    # Start browser watcher
    Start-BrowserWhenServerReady -PortFilePath $PortFile

    & node "$ProjectRoot\server.js"
    $exitCode = $LASTEXITCODE
    Write-LauncherLog ("[INFO] Visible server exited with code {0}" -f $exitCode)
    return $exitCode
}

function Start-SilentServer {
    Assert-NodeReady
    Assert-DependenciesReady
    Assert-NoDanglingRuntime
    Stop-PaibanServer -UseFallbackScan | Out-Null
    Remove-RuntimeState
    Write-LauncherLog '[INFO] Starting server in silent background mode.'

    $psCommand = @"
Set-Location -LiteralPath '$ProjectRoot'
if ('$Port' -ne '0') { `$env:PORT = '$Port' }
if ('$ResolvedDataDir' -ne '') { `$env:DATA_DIR = '$ResolvedDataDir' }
if ('$InstanceName' -ne '') { `$env:INSTANCE_NAME = '$InstanceName' }
`$env:RUNTIME_DIR = '$ResolvedRuntimeDir'
node server.js
"@

    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($psCommand))

    Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', $encodedCommand
    ) | Out-Null

    $port = Wait-ServerReady -TimeoutSeconds 30
    if (-not $port) {
        throw 'Background server did not become ready in time. Check server_launcher.log.'
    }

    Write-Host ("Server ready at http://localhost:{0}" -f $port)
    Open-SystemBrowser -Port $port
    return 0
}

function Show-ServerStatus {
    Assert-NodeReady
    & node "$ProjectRoot\scripts\status-check.js"
    return $LASTEXITCODE
}

function Enable-AutoStart {
    $ws = New-Object -ComObject WScript.Shell
    $shortcut = $ws.CreateShortcut($StartupShortcut)
    
    $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$(Join-Path $ProjectRoot 'scripts\launchers\start_server_cn.ps1')`"", '-Choice', '2')
    if ($Port -gt 0) { $args += '-Port', $Port }
    if (-not [string]::IsNullOrWhiteSpace($DataDir)) { $args += '-DataDir', "`"$DataDir`"" }
    if (-not [string]::IsNullOrWhiteSpace($InstanceName)) { $args += '-InstanceName', "`"$InstanceName`"" }
    if (-not [string]::IsNullOrWhiteSpace($RuntimeDir)) { $args += '-RuntimeDir', "`"$RuntimeDir`"" }

    $shortcut.TargetPath = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
    $shortcut.Arguments = $args -join ' '
    $shortcut.WorkingDirectory = $ProjectRoot
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
    $shortcut.Save()
    
    Write-LauncherLog "[INFO] Auto-start enabled at $StartupShortcut."
    Write-Host (U '\u5DF2\u5F00\u542F\u5F00\u673A\u81EA\u542F\uff08\u9759\u9ED8\u6A21\u5F0F\uff09\u3002')
    return 0
}

function Disable-AutoStart {
    Remove-Item -LiteralPath $StartupShortcut -Force -ErrorAction SilentlyContinue
    Write-LauncherLog '[INFO] Auto-start disabled.'
    Write-Host (U '\u5DF2\u5173\u95ED\u5F00\u673A\u81EA\u542F\u3002')
    return 0
}

function Invoke-LauncherAction {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Choice
    )

    switch ($Choice) {
        '1' { return (Start-VisibleServer) }
        '2' { return (Start-SilentServer) }
        '3' {
            Stop-PaibanServer -UseFallbackScan | Out-Null
            Write-Host (U '\u670D\u52A1\u5DF2\u505C\u6B62\u3002')
            return 0
        }
        '4' { return (Show-ServerStatus) }
        '5' { return (Enable-AutoStart) }
        '6' { return (Disable-AutoStart) }
        '7' {
            $port = Wait-ServerReady -TimeoutSeconds 2
            if (-not $port) {
                throw 'No running service was detected. Start the server first.'
            }
            Open-SystemBrowser -Port $port
            return 0
        }
        default { throw "Unsupported choice: $Choice" }
    }
}

function Show-LauncherMenu {
    Clear-Host
    Write-Host "========================================="
    Write-Host (U '          \u6392\u73ED\u7CFB\u7EDF\u542F\u52A8\u5668')
    Write-Host "========================================="
    Write-Host ""
    Write-Host (U '1. \u542F\u52A8\u670D\u52A1\uff08\u53EF\u89C1\u7A97\u53E3\uff09')
    Write-Host (U '2. \u542F\u52A8\u670D\u52A1\uff08\u9759\u9ED8\u540E\u53F0\uff09')
    Write-Host (U '3. \u505C\u6B62\u670D\u52A1')
    Write-Host (U '4. \u67E5\u770B\u670D\u52A1\u72B6\u6001')
    Write-Host (U '5. \u5F00\u542F\u5F00\u673A\u81EA\u542F')
    Write-Host (U '6. \u5173\u95ED\u5F00\u673A\u81EA\u542F')
    Write-Host (U '7. \u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u7CFB\u7EDF')
    Write-Host (U '8. \u9000\u51FA')
    Write-Host ""
}

if ($PSBoundParameters.ContainsKey('Choice')) {
    if ($Choice -eq '8') {
        exit 0
    }

    try {
        exit (Invoke-LauncherAction -Choice $Choice)
    } catch {
        Write-Host ""
        Write-Host ("[ERROR] {0}" -f $_.Exception.Message) -ForegroundColor Red
        Write-LauncherLog ("[ERROR] {0}" -f $_.Exception.Message)
        exit 1
    }
}

while ($true) {
    Show-LauncherMenu
    $choice = Read-Host (U '\u8BF7\u9009\u62E9\uff081-8\uff09')

    if ($choice -eq '8') {
        break
    }

    if ($choice -notin @('1', '2', '3', '4', '5', '6', '7')) {
        Write-Host ""
        Write-Host (U '\u65E0\u6548\u9009\u9879\uff0c\u8BF7\u8F93\u5165 1 \u5230 8\u3002') -ForegroundColor Yellow
        Start-Sleep -Seconds 1
        continue
    }

    try {
        Invoke-LauncherAction -Choice $choice | Out-Null
    } catch {
        Write-Host ""
        Write-Host ("[ERROR] {0}" -f $_.Exception.Message) -ForegroundColor Red
        Write-LauncherLog ("[ERROR] {0}" -f $_.Exception.Message)
        Start-Sleep -Seconds 2
    }
}
