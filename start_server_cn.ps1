$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
& (Join-Path $PSScriptRoot 'scripts\launchers\start_server_cn.ps1') @args
exit $LASTEXITCODE
