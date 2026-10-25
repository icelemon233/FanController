param([string]$CompilerPath = $env:INNOSETUP_ISCC)
$ErrorActionPreference = 'Stop'
$fanRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanVersion = (Get-Content -LiteralPath (Join-Path $fanRoot 'version.json') -Raw | ConvertFrom-Json).version
& (Join-Path $fanRoot 'installer\inno\test.ps1') -PayloadDirectory (Join-Path $fanRoot 'artifacts\app') -Version $fanVersion -CompilerPath $CompilerPath
