param(
  [ValidateSet('Ready','Refuse','WrongPath','Silent','Idle')][string]$Scenario='Ready',
  [switch]$Legacy,[switch]$Tray,
  [ValidateSet('Current','Previous','Older','Legacy')][string]$TitleVersion='Current'
)
$ErrorActionPreference='Stop'
$fanRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanId=[Guid]::NewGuid().ToString('N')
$fanFixture=Join-Path $fanRoot ('work\update-test-'+$fanId)
New-Item -ItemType Directory -Path $fanFixture | Out-Null
$fanMutex='Local\FanController.UpdateTest.'+$fanId
$fanTitle='FanController update test '+$fanId
$fanCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$fanMock=Join-Path $fanFixture $(if($Legacy){'cinna-fanCon.exe'}else{'FanController.exe'})
$fanTitleVersion=if($Legacy -and $TitleVersion -eq 'Current'){'Previous'}else{$TitleVersion}
$fanRunningTitle=if($fanTitleVersion -eq 'Current'){$fanTitle}else{$fanTitle+' '+$fanTitleVersion.ToLowerInvariant()}
& $fanCompiler /nologo /target:winexe /platform:x64 /r:System.Windows.Forms.dll /r:System.Drawing.dll ('/out:'+$fanMock) (Join-Path $fanRoot 'installer\tests\UpdateFixture.cs')
if($LASTEXITCODE -ne 0){throw 'Update fixture compilation failed.'}
$fanMessages=Get-Content -LiteralPath (Join-Path $fanRoot 'installer\setup.nsi') | Where-Object {$_ -match '^LangString (CloseAppPrompt|ClosingApp|CloseAppFailed) '}
[IO.File]::WriteAllLines((Join-Path $fanFixture 'messages.nsh'),$fanMessages,[Text.UTF8Encoding]::new($false))
$fanExpected=if($Scenario -eq 'WrongPath'){Join-Path $fanFixture 'other-installation'}else{$fanFixture}
& (Join-Path $fanRoot '.deps\nsis-3.13\makensis.exe') /V2 /INPUTCHARSET UTF8 ('/DProjectRoot='+$fanRoot) ('/DFixtureRoot='+$fanFixture) ('/DExpectedRoot='+$fanExpected) ('/DFixtureMutex='+$fanMutex) ('/DFixtureTitle='+$fanTitle) ('/DFixtureScenario='+$Scenario) (Join-Path $fanRoot 'installer\tests\update-fixture.nsi')
if($LASTEXITCODE -ne 0){throw 'Update test installer compilation failed.'}
$fanApp=$null
try {
  if($Scenario -ne 'Idle'){
    $fanMode=if($Scenario -eq 'Refuse'){'Refuse'}else{'Ready'}
    $fanProtocol=if($Legacy){'LegacyClose'}else{'TrayClose'}
    $fanWindowMode=if($Tray){'Hidden'}else{'Window'}
    $fanApp=Start-Process -FilePath $fanMock -ArgumentList @($fanMode,$fanMutex,('"'+$fanRunningTitle+'"'),$fanProtocol,$fanWindowMode) -WindowStyle Hidden -PassThru
    $fanDeadline=[DateTime]::UtcNow.AddSeconds(10)
    while(-not (Test-Path -LiteralPath (Join-Path $fanFixture 'app-ready.txt')) -or -not (Test-Path -LiteralPath (Join-Path $fanFixture 'worker-ready.txt'))){
      if([DateTime]::UtcNow -gt $fanDeadline){throw 'Fake app or worker did not initialize.'}
      Start-Sleep -Milliseconds 100
    }
  }
  $fanSetupArgs=if($Scenario -eq 'Silent'){@('/S')}else{@()}
  $fanSetup=Start-Process -FilePath (Join-Path $fanFixture 'update-test.exe') -ArgumentList $fanSetupArgs -WindowStyle Hidden -PassThru
  Write-Output ('Scenario: '+$Scenario+'; test setup PID: '+$fanSetup.Id)
  Write-Output ('Fixture: '+$fanFixture)
  if(-not $fanSetup.WaitForExit(15000)){throw 'The test installer did not complete within fifteen seconds.'}
  $fanReady=Test-Path -LiteralPath (Join-Path $fanFixture 'ready.txt')
  $fanExitEvent=if($Legacy){'close-requested'}else{'exit-requested'}
  $fanEvents=if(Test-Path -LiteralPath (Join-Path $fanFixture 'events.txt')){@(Get-Content -LiteralPath (Join-Path $fanFixture 'events.txt'))}else{@()}
  if($Scenario -in @('Ready','Idle')){
    if($fanSetup.ExitCode -ne 0 -or -not $fanReady){throw 'Setup did not continue after safe shutdown.'}
    if($Scenario -eq 'Ready' -and (($fanEvents -join ',') -ne ($fanExitEvent+',worker-restored,host-exit') -or -not $fanApp.HasExited)){throw 'Setup continued before both the fake app and worker exited.'}
  }else{
    if($fanSetup.ExitCode -ne 10 -or $fanReady){throw 'Setup continued after cancellation or an unsafe shutdown.'}
    if($fanApp.HasExited){throw 'The test app was forcefully stopped.'}
    if($Scenario -eq 'Refuse' -and ($fanEvents -join ',') -ne $fanExitEvent){throw 'The refusal scenario did not request normal shutdown.'}
    if($Scenario -ne 'Refuse' -and $fanEvents.Count -ne 0){throw 'Setup closed an app in silent mode or from another installation.'}
  }
  $fanResult='PASS: '+$Scenario+'; '+$(if($Legacy){'legacy close'}else{'explicit tray exit'})+'; '+$(if($Tray){'hidden window'}else{'normal window'})+'; '+$fanTitleVersion+' title; isolated update guard preserved shutdown ordering and program files'
  $fanReports=Join-Path $fanRoot 'artifacts\tests'
  New-Item -ItemType Directory -Force -Path $fanReports | Out-Null
  $fanResult | Set-Content -LiteralPath (Join-Path $fanReports ('installer-update-'+$Scenario+$(if($Legacy){'-legacy'}else{''})+$(if($Tray){'-tray'}else{''})+$(if($TitleVersion -ne 'Current'){'-'+$TitleVersion.ToLowerInvariant()}else{''})+'.txt')) -Encoding utf8
  Write-Output $fanResult
}finally{
  [IO.File]::WriteAllText((Join-Path $fanFixture 'cleanup.txt'),'cleanup')
  if($fanApp -and -not $fanApp.HasExited){if(-not $fanApp.WaitForExit(10000)){throw 'The isolated fake app did not respond to test cleanup.'}}
}
