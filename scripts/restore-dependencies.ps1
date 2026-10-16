param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $OutputDirectory){$OutputDirectory=Join-Path $projectRoot 'artifacts\app'}
$cache=Join-Path $projectRoot '.deps'
New-Item -ItemType Directory -Force -Path $cache,$OutputDirectory | Out-Null
$dependencies=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'dependencies.json') -Raw | ConvertFrom-Json
foreach($name in @('LibreHardwareMonitor','WebView2')){
  $entry=$dependencies.$name
  $archive=Join-Path $cache ($name+'-'+$entry.version+'.zip')
  if(-not (Test-Path -LiteralPath $archive)){Invoke-WebRequest -Uri $entry.url -OutFile $archive -UseBasicParsing}
  $hash=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  if($hash -ne $entry.sha256){throw ('Dependency checksum mismatch: '+$name)}
  $folder=Join-Path $cache ($name+'-'+$entry.version)
  Expand-Archive -LiteralPath $archive -DestinationPath $folder -Force
}
$lhm=Join-Path $cache ('LibreHardwareMonitor-'+$dependencies.LibreHardwareMonitor.version)
$libraries=@('LibreHardwareMonitorLib.dll','System.Memory.dll','System.Runtime.CompilerServices.Unsafe.dll','System.Buffers.dll','System.Numerics.Vectors.dll','HidSharp.dll','RAMSPDToolkit-NDD.dll','DiskInfoToolkit.dll','BlackSharp.Core.dll')
foreach($library in $libraries){Copy-Item -LiteralPath (Join-Path $lhm $library) -Destination $OutputDirectory -Force}
$web=Join-Path $cache ('WebView2-'+$dependencies.WebView2.version)
foreach($library in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.Wpf.dll')){Copy-Item -LiteralPath (Join-Path $web ('lib\net462\'+$library)) -Destination $OutputDirectory -Force}
Copy-Item -LiteralPath (Join-Path $web 'runtimes\win-x64\native\WebView2Loader.dll') -Destination $OutputDirectory -Force
Write-Output 'Verified and restored native dependencies.'
