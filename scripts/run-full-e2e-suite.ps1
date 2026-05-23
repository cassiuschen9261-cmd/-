$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ReportJson = Join-Path $ProjectRoot 'artifacts\reports\e2e\full_e2e_suite_report.json'
$ReportMd = Join-Path $ProjectRoot 'docs\reports\STABILITY_REPORT.md'
$PortFile = Join-Path $ProjectRoot '.cache\runtime\.server-port'
$StartScript = Join-Path $ProjectRoot 'start_server.bat'

$suite = @(
    @{ name = 'status-check'; category = 'startup'; command = @('node', 'scripts/status-check.js') },
    @{ name = 'health-check'; category = 'api'; command = @('node', 'scripts/health-check.js') },
    @{ name = 'benchmark-local'; category = 'performance'; command = @('node', 'scripts/benchmark-local.js') },
    @{ name = 'verify-start-browser-runtime'; category = 'ui'; command = @('node', 'scripts/verify-start-browser-runtime.js') },
    @{ name = 'verify-role-boundaries'; category = 'auth'; command = @('node', 'scripts/verify-role-boundaries.js') },
    @{ name = 'verify-export-permissions-ui'; category = 'auth-ui'; command = @('node', 'scripts/verify-export-permissions-ui.js') },
    @{ name = 'verify-module-actions-ui'; category = 'module'; command = @('node', 'scripts/verify-module-actions-ui.js') },
    @{ name = 'verify-disabled-module-sidebar'; category = 'module'; command = @('node', 'scripts/verify-disabled-module-sidebar.js') },
    @{ name = 'verify-custom-module-sidebar'; category = 'sidebar'; command = @('node', 'scripts/verify-custom-module-sidebar.js') },
    @{ name = 'verify-module-sidebar-advanced'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-advanced.js') },
    @{ name = 'verify-module-sidebar-advanced-display'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-advanced-display.js') },
    @{ name = 'verify-module-sidebar-badge-hierarchy'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-badge-hierarchy.js') },
    @{ name = 'verify-module-sidebar-count-mode'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-count-mode.js') },
    @{ name = 'verify-module-sidebar-density'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-density.js') },
    @{ name = 'verify-module-sidebar-empty-state'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-empty-state.js') },
    @{ name = 'verify-module-sidebar-mode-whitelist'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-mode.js', 'whitelist') },
    @{ name = 'verify-module-sidebar-mode-keyword'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-mode.js', 'keyword') },
    @{ name = 'verify-module-sidebar-phone-display-mode'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-phone-display-mode.js') },
    @{ name = 'verify-module-sidebar-title-mode'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-title-mode.js') },
    @{ name = 'verify-module-sidebar-visual'; category = 'sidebar'; command = @('node', 'scripts/verify-module-sidebar-visual.js') },
    @{ name = 'verify-sidebar-label-order'; category = 'sidebar'; command = @('node', 'scripts/verify-sidebar-label-order.js') },
    @{ name = 'verify-header-layout'; category = 'ui'; command = @('node', 'scripts/verify-header-layout.js') }
)

function Get-ResultPayloadPath {
    param([string]$StepName)

    $mapping = @{
        'verify-start-browser-runtime' = 'verify_start_browser_runtime.json'
        'verify-export-permissions-ui' = 'verify_export_permissions_ui.json'
        'verify-module-actions-ui' = 'verify_module_actions_ui.json'
        'verify-disabled-module-sidebar' = 'verify_disabled_module_sidebar.json'
        'verify-custom-module-sidebar' = 'verify_custom_module_sidebar.json'
        'verify-module-sidebar-advanced' = 'verify_module_sidebar_advanced.json'
        'verify-module-sidebar-advanced-display' = 'verify_module_sidebar_advanced_display.json'
        'verify-module-sidebar-badge-hierarchy' = 'verify_module_sidebar_badge_hierarchy.json'
        'verify-module-sidebar-count-mode' = 'verify_module_sidebar_count_mode.json'
        'verify-module-sidebar-density' = 'verify_module_sidebar_density.json'
        'verify-module-sidebar-empty-state' = 'verify_module_sidebar_empty_state.json'
        'verify-module-sidebar-mode-whitelist' = 'verify_module_sidebar_mode_whitelist.json'
        'verify-module-sidebar-mode-keyword' = 'verify_module_sidebar_mode_keyword.json'
        'verify-module-sidebar-phone-display-mode' = 'verify_module_sidebar_phone_display_mode.json'
        'verify-module-sidebar-title-mode' = 'verify_module_sidebar_title_mode.json'
        'verify-module-sidebar-visual' = 'verify_module_sidebar_visual.json'
        'verify-sidebar-label-order' = 'verify_sidebar_label_order.json'
        'verify-header-layout' = 'verify_header_layout.json'
    }

    if ($mapping.ContainsKey($StepName)) {
        return Join-Path $ProjectRoot ('artifacts\reports\verify\' + $mapping[$StepName])
    }

    return $null
}

function Read-JsonIfExists {
    param([string]$Path)

    if (-not $Path -or -not (Test-Path $Path)) {
        return $null
    }

    try {
        return Get-Content $Path -Raw | ConvertFrom-Json
    } catch {
        return @{ readError = $_.Exception.Message }
    }
}

function Get-BaseUrl {
    $baseUrl = 'http://localhost:3000'
    if (Test-Path $PortFile) {
        $port = (Get-Content $PortFile -Raw).Trim()
        if ($port) {
            $baseUrl = "http://localhost:$port"
        }
    }
    return $baseUrl
}

function Test-HealthReady {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri ($Url.TrimEnd('/') + '/api/health') -Method Get -TimeoutSec 3
            if ($response.status -eq 'ok' -and $response.criticalRoutesOk -eq $true) {
                return $true
            }
        } catch {
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Ensure-SuiteServerReady {
    if (Test-HealthReady -Url (Get-BaseUrl) -TimeoutSeconds 2) {
        return
    }

    if (-not (Test-Path $StartScript)) {
        throw "Missing launcher: $StartScript"
    }

    Write-Host 'Server not ready. Starting service automatically...'
    & $StartScript 2 | Out-Null
    $baseUrl = Get-BaseUrl
    if (-not (Test-HealthReady -Url $baseUrl -TimeoutSeconds 30)) {
        throw "Server failed to become healthy at $baseUrl"
    }
    Write-Host ("Server ready at {0}" -f $baseUrl)
}

Ensure-SuiteServerReady

$steps = @()

foreach ($item in $suite) {
    $command = $item.command
    $commandText = ($command -join ' ')
    Write-Host ("Running {0} ..." -f $item.name)

    $startedAt = (Get-Date).ToString('o')
    $stdoutFile = Join-Path $env:TEMP ("paiban_{0}_stdout.log" -f $item.name)
    $stderrFile = Join-Path $env:TEMP ("paiban_{0}_stderr.log" -f $item.name)

    if (Test-Path $stdoutFile) { Remove-Item $stdoutFile -Force }
    if (Test-Path $stderrFile) { Remove-Item $stderrFile -Force }

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    if ($command.Length -gt 1) {
        & $command[0] $command[1..($command.Length - 1)] 1> $stdoutFile 2> $stderrFile
    } else {
        & $command[0] 1> $stdoutFile 2> $stderrFile
    }
    $exitCode = $LASTEXITCODE
    $stopwatch.Stop()

    $resultPayloadPath = Get-ResultPayloadPath -StepName $item.name
    $steps += [pscustomobject]@{
        name = $item.name
        category = $item.category
        command = $commandText
        startedAt = $startedAt
        durationMs = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 1)
        exitCode = $exitCode
        stdout = if (Test-Path $stdoutFile) { (Get-Content $stdoutFile -Raw) } else { '' }
        stderr = if (Test-Path $stderrFile) { (Get-Content $stderrFile -Raw) } else { '' }
        resultFile = if ($resultPayloadPath) { Split-Path $resultPayloadPath -Leaf } else { '' }
        resultPayload = Read-JsonIfExists -Path $resultPayloadPath
    }

    Write-Host ("{0}: exit={1}" -f $item.name, $exitCode)
}

$baseUrl = Get-BaseUrl

$passed = @($steps | Where-Object { $_.exitCode -eq 0 }).Count
$failed = @($steps | Where-Object { $_.exitCode -ne 0 }).Count
$totalDuration = ($steps | Measure-Object -Property durationMs -Sum).Sum

$report = [pscustomobject]@{
    generatedAt = (Get-Date).ToString('o')
    baseUrl = $baseUrl
    summary = [pscustomobject]@{
        total = $steps.Count
        passed = $passed
        failed = $failed
        totalDurationMs = [math]::Round($totalDuration, 1)
    }
    steps = $steps
}

$report | ConvertTo-Json -Depth 8 | Set-Content -Path $ReportJson -Encoding UTF8

$md = @(
    '# Full E2E Stability Report',
    '',
    "- GeneratedAt: $($report.generatedAt)",
    "- BaseUrl: $($report.baseUrl)",
    "- TotalSteps: $($report.summary.total)",
    "- Passed: $($report.summary.passed)",
    "- Failed: $($report.summary.failed)",
    "- TotalDurationMs: $($report.summary.totalDurationMs)",
    '',
    '## Coverage',
    '',
    '- Startup and health checks',
    '- Role boundaries and guest/admin UI differences',
    '- Module create, disable, delete and persistence',
    '- Disabled-module filtering in sidebar summary',
    '- Sidebar advanced modes, keyword/whitelist, title/phone/density/visual rendering',
    '- Base page runtime and header layout',
    '',
    '## Summary',
    ''
)

foreach ($step in $steps) {
    $status = if ($step.exitCode -eq 0) { 'PASS' } else { 'FAIL' }
    $md += "- $status $($step.name) | $($step.category) | $($step.durationMs) ms"
}

$md += @(
    '',
    '## Findings And Fixes',
    '',
    '- Fixed sidebar summary still showing doctors from disabled modules.',
    '- Fixed individual auto-schedule still exposing doctors from disabled modules.',
    '- Fixed guest users still seeing or triggering export buttons.',
    '- Consolidated existing verification scripts into a reusable regression suite.',
    '',
    '## Residual Risks',
    '',
    '- Current suite still focuses on browser and API layers, not full OS reboot/autostart validation.',
    '- Export verification currently covers permissions and UI entry points, not byte-level file content comparison.',
    '- Launcher performance deep optimization remains a separate follow-up item.'
)

$md -join "`n" | Set-Content -Path $ReportMd -Encoding UTF8

$report.summary | ConvertTo-Json -Depth 4
if ($failed -gt 0) {
    exit 1
}
