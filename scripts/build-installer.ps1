param(
  [string]$CompilerPath = $env:INNOSETUP_ISCC,
  [Alias('InstallerQaRoot')][string]$QaRoot,
  [string]$OutputFile,
  [string]$PortableOutputFile
)
$ErrorActionPreference = 'Stop'
$fanRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanVersion = (Get-Content -LiteralPath (Join-Path $fanRoot 'version.json') -Raw | ConvertFrom-Json).version
$fanArchive = & (Join-Path $PSScriptRoot 'package.ps1') -OutputFile $PortableOutputFile
$fanStage = Join-Path $fanRoot ('work\inno-payload-'+[Guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $fanArchive -DestinationPath $fanStage
if(-not $OutputFile){
  $OutputFile = if($QaRoot){Join-Path $QaRoot 'FanController-inno-qa.exe'}else{Join-Path $fanRoot ('dist\FanController-v'+$fanVersion+'-windows-x64-setup.exe')}
}
& (Join-Path $fanRoot 'installer\inno\build.ps1') -PayloadDirectory $fanStage -Version $fanVersion -OutputFile $OutputFile -CompilerPath $CompilerPath -QaRoot $QaRoot
