param(
  [ValidateSet('Ready','Refuse','WrongPath','Silent','Idle')][string]$Scenario='Ready',
  [switch]$Legacy,
  [switch]$Tray,
  [ValidateSet('Current','Previous','Older','Legacy')][string]$TitleVersion='Current',
  [string]$CompilerPath=$env:INNOSETUP_ISCC
)
$ErrorActionPreference='Stop'
$fanRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanVersion=(Get-Content -LiteralPath (Join-Path $fanRoot 'version.json') -Raw | ConvertFrom-Json).version
$fanId=[Guid]::NewGuid().ToString('N')
$fanQaRoot=Join-Path $fanRoot ('work\inno-qa-'+$fanId)
$fanSource=Join-Path $fanQaRoot 'payload'
$fanInstall=Join-Path $fanQaRoot 'app'
$fanRunningRoot=if($Scenario -eq 'WrongPath'){Join-Path $fanQaRoot 'other-installation'}else{$fanInstall}
New-Item -ItemType Directory -Path $fanSource,$fanInstall,$fanRunningRoot -Force | Out-Null
$fanMutex='Local\Cinna.InstallerQA.'+$fanId+'.Running'
$fanTitle='FanController Installer QA '+$fanId
$fanTitleVariant=if($Legacy -and $TitleVersion -eq 'Current'){'Previous'}else{$TitleVersion}
$fanRunningTitle=if($fanTitleVariant -eq 'Current'){$fanTitle}else{$fanTitle+' '+$fanTitleVariant.ToLowerInvariant()}
$fanCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$fanVersionSource=Join-Path $fanQaRoot 'Version.cs'
[IO.File]::WriteAllText($fanVersionSource,('[assembly:System.Reflection.AssemblyVersion("'+$fanVersion+'.0")][assembly:System.Reflection.AssemblyFileVersion("'+$fanVersion+'.0")]'))
& $fanCompiler /nologo /target:winexe /platform:x64 /r:System.Windows.Forms.dll /r:System.Drawing.dll ('/out:'+(Join-Path $fanSource 'FanController.exe')) (Join-Path $fanRoot 'installer\tests\UpdateFixture.cs') $fanVersionSource
if($LASTEXITCODE -ne 0){throw 'Update fixture compilation failed.'}
$fanFixtureName=if($Legacy){'cinna-fanCon.exe'}else{'FanController.exe'}
$fanFixture=Join-Path $fanRunningRoot $fanFixtureName
Copy-Item -LiteralPath (Join-Path $fanSource 'FanController.exe') -Destination $fanFixture
$fanLegacyKey='Software\Cinna\InstallerQA\'+$fanId+'\Legacy'
$fanRegistration=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($fanLegacyKey)
try{$fanRegistration.SetValue('InstallLocation',$fanInstall)}finally{$fanRegistration.Dispose()}
$fanSetup=Join-Path $fanQaRoot 'FanController-lifecycle-qa.exe'
& (Join-Path $fanRoot 'installer\inno\build.ps1') -PayloadDirectory $fanSource -Version $fanVersion -OutputFile $fanSetup -CompilerPath $CompilerPath -QaRoot $fanQaRoot | Write-Host
$fanApp=$null
try{
  if($Scenario -ne 'Idle'){
    $fanMode=if($Scenario -eq 'Refuse'){'Refuse'}else{'Ready'}
    $fanProtocol=if($Legacy){'LegacyClose'}else{'TrayClose'}
    $fanWindowMode=if($Tray){'Hidden'}else{'Window'}
    $fanApp=Start-Process -FilePath $fanFixture -ArgumentList @($fanMode,$fanMutex,('"'+$fanRunningTitle+'"'),$fanProtocol,$fanWindowMode) -WindowStyle Hidden -PassThru
    $fanDeadline=[DateTime]::UtcNow.AddSeconds(15)
    while(-not (Test-Path -LiteralPath (Join-Path $fanRunningRoot 'app-ready.txt')) -or -not (Test-Path -LiteralPath (Join-Path $fanRunningRoot 'worker-ready.txt'))){
      if([DateTime]::UtcNow -gt $fanDeadline){throw 'Fake app or worker did not initialize.'}
      Start-Sleep -Milliseconds 100
    }
  }
  $fanArgs=@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/CURRENTUSER',('/DIR="'+$fanInstall+'"'),('/LOG="'+(Join-Path $fanQaRoot 'lifecycle.log')+'"'))
  if($Scenario -ne 'Silent'){$fanArgs+='/CLOSEAPP'}
  $fanProcess=Start-Process -FilePath $fanSetup -ArgumentList $fanArgs -WindowStyle Hidden -PassThru
  if(-not $fanProcess.WaitForExit(90000)){throw 'Lifecycle test setup timed out.'}
  $fanEventsFile=Join-Path $fanRunningRoot 'events.txt'
  $fanEvents=if(Test-Path -LiteralPath $fanEventsFile){[IO.File]::ReadAllText($fanEventsFile).Trim()}else{''}
  if($Scenario -in @('Ready','Idle')){
    if($fanProcess.ExitCode -ne 0){Get-Content -LiteralPath (Join-Path $fanQaRoot 'lifecycle.log') -Tail 65 | Write-Host;throw "Setup failed: $($fanProcess.ExitCode). Inspect $fanQaRoot"}
    if($Scenario -eq 'Ready'){
      $fanExitEvent=if($Legacy){'close-requested'}else{'exit-requested'}
      if(-not $fanApp.HasExited -or ($fanEvents -replace '\r?\n',',') -ne ($fanExitEvent+',worker-restored,host-exit')){throw 'Setup continued before normal fan restoration and host exit.'}
    }
  }else{
    if($fanProcess.ExitCode -eq 0){throw 'Unsafe shutdown did not stop setup.'}
    if($fanApp.HasExited){throw 'The running fixture was terminated.'}
    if(Test-Path -LiteralPath (Join-Path $fanInstall 'unins000.exe')){throw 'The refused operation installed files.'}
  }
  Write-Output ('PASS Inno lifecycle: '+$Scenario+'; legacy='+$Legacy+'; tray='+$Tray+'; title='+$fanTitleVariant+'; '+$fanQaRoot)
}finally{
  if($fanApp -and -not $fanApp.HasExited){
    [IO.File]::WriteAllText((Join-Path $fanRunningRoot 'cleanup.txt'),'test cleanup')
    if(-not $fanApp.WaitForExit(10000)){throw 'QA fixture did not exit after its cleanup signal.'}
  }
  $fanQaUninstaller=Join-Path $fanInstall 'unins000.exe'
  if((Test-Path -LiteralPath $fanQaUninstaller) -and $fanProcess -and $fanProcess.HasExited){
    $fanRemoval=Start-Process -FilePath $fanQaUninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="'+(Join-Path $fanQaRoot 'cleanup-uninstall.log')+'"')) -WindowStyle Hidden -PassThru
    if(-not $fanRemoval.WaitForExit(30000) -or $fanRemoval.ExitCode -ne 0){throw 'The isolated lifecycle test installation could not be removed.'}
  }
  [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree(('Software\Cinna\InstallerQA\'+$fanId),$false)
}
