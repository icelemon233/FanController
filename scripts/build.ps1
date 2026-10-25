param([switch]$SkipFrontend,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source=Join-Path $projectRoot 'native'
$output=if($OutputDirectory){[IO.Path]::GetFullPath($OutputDirectory)}else{Join-Path $projectRoot 'artifacts\app'}
$frontend=Join-Path $projectRoot 'frontend'
& (Join-Path $PSScriptRoot 'create-icon.ps1')
& (Join-Path $PSScriptRoot 'restore-dependencies.ps1') -OutputDirectory $output
if(-not $SkipFrontend){
  & pnpm --dir $frontend install --frozen-lockfile --ignore-scripts
  if($LASTEXITCODE -ne 0){throw 'Frontend dependency installation failed.'}
  & pnpm --dir $frontend check
  if($LASTEXITCODE -ne 0){throw 'Frontend checks failed.'}
  & pnpm --dir $frontend run build
  if($LASTEXITCODE -ne 0){throw 'Frontend build failed.'}
}
$ui=Join-Path $output 'ui'
New-Item -ItemType Directory -Force -Path $ui | Out-Null
Get-ChildItem -LiteralPath (Join-Path $frontend 'dist') | Copy-Item -Destination $ui -Recurse -Force
$framework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$wpf=Join-Path $framework 'WPF'
$compiler=Join-Path $framework 'csc.exe'
if(-not (Test-Path -LiteralPath $compiler)){throw '.NET Framework 4.8 and its C# compiler are required.'}
$common=@('Core.cs','Adlx.cs','Hardware.cs','CoolingPlanner.cs','CoreTests.cs','PlannerTests.cs','Wire.cs') | ForEach-Object {Join-Path $source $_}
$arguments=@('/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001','/r:System.Core.dll','/r:System.Management.dll','/r:System.Runtime.Serialization.dll',('/r:'+(Join-Path $output 'LibreHardwareMonitorLib.dll')),('/win32manifest:'+(Join-Path $source 'app.manifest')),('/win32icon:'+(Join-Path $source 'assets\app.ico')))
$workerArguments=$arguments+@('/main:CinnaFanCon.WorkerProgram',('/out:'+(Join-Path $output 'FanController.Worker.exe')))
& $compiler @workerArguments @common (Join-Path $source 'WorkerProgram.cs')
if($LASTEXITCODE -ne 0){throw 'Worker compilation failed.'}
$hostArguments=$arguments+@('/main:CinnaFanCon.AppProgram',('/out:'+(Join-Path $output 'FanController.exe')),('/resource:'+(Join-Path $source 'assets\app.ico')+',CinnaFanCon.AppIcon'),('/resource:'+(Join-Path $frontend 'src\design\window-shell.json')+',CinnaFanCon.WindowShell'),'/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Xaml.dll',('/r:'+(Join-Path $wpf 'PresentationCore.dll')),('/r:'+(Join-Path $wpf 'PresentationFramework.dll')),('/r:'+(Join-Path $wpf 'WindowsBase.dll')),('/r:'+(Join-Path $output 'Microsoft.Web.WebView2.Core.dll')),('/r:'+(Join-Path $output 'Microsoft.Web.WebView2.Wpf.dll')))
$hostSources=@('WorkerClient.cs','TrayContextMenu.cs','WindowFrameContract.cs','UiQaOptions.cs','BrowserWindow.cs','AppProgram.cs') | ForEach-Object {Join-Path $source $_}
& $compiler @hostArguments @common @hostSources
if($LASTEXITCODE -ne 0){throw 'Desktop compilation failed.'}
foreach($name in @('FanController.exe.config','FanController.Worker.exe.config')){Copy-Item -LiteralPath (Join-Path $source 'cinna-fanCon.exe.config') -Destination (Join-Path $output $name) -Force}
$licenses=Join-Path $output 'licenses'
New-Item -ItemType Directory -Force -Path $licenses | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'third-party') -File | Copy-Item -Destination $licenses -Force
Write-Output ('Built '+(Join-Path $output 'FanController.exe'))
