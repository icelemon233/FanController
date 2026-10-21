param()
$ErrorActionPreference='Stop'
$fanRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanApp=Join-Path $fanRoot 'artifacts\app'
$fanFixture=Join-Path $fanRoot ('work\worker-connection-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fanFixture | Out-Null
$fanCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$fanReferences=@('/nologo','/target:winexe','/platform:x64','/codepage:65001','/r:System.Core.dll',('/r:'+(Join-Path $fanApp 'FanController.exe')))
& $fanCompiler @fanReferences ('/out:'+(Join-Path $fanFixture 'ConnectionFixture.exe')) (Join-Path $fanRoot 'native\tests\ConnectionFixture.cs')
if($LASTEXITCODE -ne 0){throw 'Connection fixture compilation failed.'}
& $fanCompiler @fanReferences ('/out:'+(Join-Path $fanFixture 'WorkerConnectionTests.exe')) (Join-Path $fanRoot 'native\tests\WorkerConnectionTests.cs')
if($LASTEXITCODE -ne 0){throw 'Worker connection test compilation failed.'}
$fanReports=Join-Path $fanRoot 'artifacts\tests'
New-Item -ItemType Directory -Force -Path $fanReports | Out-Null
foreach($fanMode in @('Crash','Eof','StartupExit','NoSnapshot','RefuseStop')){
  $fanCase=Join-Path $fanFixture $fanMode
  New-Item -ItemType Directory -Path $fanCase | Out-Null
  Copy-Item -LiteralPath (Join-Path $fanApp 'FanController.exe') -Destination $fanCase
  Get-ChildItem -LiteralPath $fanApp -Filter '*.dll' -File | Copy-Item -Destination $fanCase
  Copy-Item -LiteralPath (Join-Path $fanFixture 'ConnectionFixture.exe') -Destination (Join-Path $fanCase 'FanController.Worker.exe')
  Copy-Item -LiteralPath (Join-Path $fanFixture 'WorkerConnectionTests.exe') -Destination $fanCase
  [IO.File]::WriteAllText((Join-Path $fanCase 'fixture-mode.txt'),$fanMode)
  $fanReport=Join-Path $fanReports ('worker-connection-'+$fanMode+'.txt')
  $fanTest=Start-Process -FilePath (Join-Path $fanCase 'WorkerConnectionTests.exe') -ArgumentList @($fanMode,('"'+$fanReport+'"')) -WorkingDirectory $fanCase -WindowStyle Hidden -PassThru
  if(-not $fanTest.WaitForExit(20000)){
    [IO.File]::WriteAllText((Join-Path $fanCase 'cleanup.txt'),'cleanup')
    throw ('Worker connection test timed out: '+$fanMode)
  }
  Get-Content -LiteralPath $fanReport
  if($fanTest.ExitCode -ne 0){throw ('Worker connection test failed: '+$fanMode)}
}
