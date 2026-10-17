param([switch]$Desktop)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$app=Join-Path $projectRoot 'artifacts\app\FanController.exe'
$reports=Join-Path $projectRoot 'artifacts\tests'
New-Item -ItemType Directory -Force -Path $reports | Out-Null
$core=Join-Path $reports 'core-and-planner.txt'
$process=Start-Process -FilePath $app -ArgumentList @('--self-test',('"'+$core+'"')) -WindowStyle Hidden -PassThru -Wait
if($process.ExitCode -ne 0){if(Test-Path -LiteralPath ($core+'.error.txt')){Get-Content -LiteralPath ($core+'.error.txt')};throw 'Core tests failed.'}
Get-Content -LiteralPath $core
if($Desktop){
  $report=Join-Path $reports 'desktop-ui.txt'
  $image=Join-Path $reports 'desktop-ui.png'
  $process=Start-Process -FilePath $app -ArgumentList @('--smoke',('"'+$report+'"'),('"'+$image+'"')) -WindowStyle Hidden -PassThru -Wait
  if($process.ExitCode -ne 0){if(Test-Path -LiteralPath ($image+'.error.txt')){Get-Content -LiteralPath ($image+'.error.txt')};throw 'Desktop tests failed.'}
  Get-Content -LiteralPath $report
}
