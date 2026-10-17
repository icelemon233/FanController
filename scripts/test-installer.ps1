param([switch]$KeepInstalled)
$ErrorActionPreference='Stop'
$fanRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanMetadata=Get-Content -LiteralPath (Join-Path $fanRoot 'version.json') -Raw | ConvertFrom-Json
$fanInstaller=Join-Path $fanRoot ('dist\FanController-v'+$fanMetadata.version+'-windows-x64-setup.exe')
$fanInstallRoot=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\cinna-fanCon'
$fanRegistry='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\cinna-fanCon'
if((Test-Path -LiteralPath $fanRegistry) -or (Test-Path -LiteralPath $fanInstallRoot)){throw 'Installer tests require FanController to be uninstalled first. Existing installations are left untouched.'}
$fanReports=Join-Path $fanRoot 'artifacts\tests'
New-Item -ItemType Directory -Force -Path $fanReports | Out-Null
$fanResults=[Collections.Generic.List[string]]::new()
function Invoke-FanSetup {
  $fanProcess=Start-Process -FilePath $fanInstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
  return $fanProcess.ExitCode
}
function Test-FanInstalling {
  try {$fanHandle=[Threading.Mutex]::OpenExisting('Local\cinna-fanCon.Installing');$fanHandle.Dispose();return $true}
  catch [Threading.WaitHandleCannotBeOpenedException] {return $false}
}
$fanGuard=[Threading.Mutex]::new($false,'Local\cinna-fanCon.Running')
try {if((Invoke-FanSetup) -ne 10){throw 'Setup did not block while the fan worker guard was active.'}}
finally {$fanGuard.Dispose()}
if(Test-Path -LiteralPath (Join-Path $fanInstallRoot 'FanController.exe')){throw 'Blocked setup still installed files.'}
$fanResults.Add('PASS: setup refuses installation while fan control is running')
$fanGuard=[Threading.Mutex]::new($false,'Local\cinna-fanCon.Installing')
try {
  $fanBlockedImage=Join-Path $fanReports 'blocked-startup.png'
  $fanProcess=Start-Process -FilePath (Join-Path $fanRoot 'artifacts\app\FanController.exe') -ArgumentList @('--capture',('"'+$fanBlockedImage+'"'),'--demo') -WindowStyle Hidden -PassThru -Wait
  if($fanProcess.ExitCode -ne 1 -or -not ([IO.File]::ReadAllText($fanBlockedImage+'.error.txt').Contains('安装或卸载正在进行'))){throw 'App startup did not block during installation.'}
} finally {$fanGuard.Dispose()}
$fanResults.Add('PASS: application startup is blocked during installation or uninstallation')
if((Invoke-FanSetup) -ne 0){throw 'Per-user installation failed.'}
$fanRegistration=Get-ItemProperty -LiteralPath $fanRegistry
if($fanRegistration.DisplayVersion -ne $fanMetadata.version -or $fanRegistration.InstallLocation -ne $fanInstallRoot){throw 'Installation registration is incorrect.'}
$fanShortcut=Join-Path ([Environment]::GetFolderPath('Programs')) 'FanController\FanController.lnk'
if(-not (Test-Path -LiteralPath $fanShortcut)){throw 'Start menu shortcut is missing.'}
$fanResults.Add('PASS: per-user install registers the app and creates its Start menu shortcut')
$fanApp=Join-Path $fanInstallRoot 'FanController.exe'
$fanDesktopReport=Join-Path $fanReports 'installed-desktop.txt'
$fanDesktopImage=Join-Path $fanReports 'installed-desktop.png'
$fanProcess=Start-Process -FilePath $fanApp -ArgumentList @('--smoke',('"'+$fanDesktopReport+'"'),('"'+$fanDesktopImage+'"')) -WindowStyle Hidden -PassThru -Wait
if($fanProcess.ExitCode -ne 0){throw 'The installed app failed its desktop demo test.'}
$fanResults.Add('PASS: installed WebView2 UI and worker complete the desktop demo tests')
$fanSentinel=Join-Path $fanInstallRoot 'installer-test-owned.txt'
[IO.File]::WriteAllText($fanSentinel,'Installer test: keep files outside the package manifest.')
if((Invoke-FanSetup) -ne 0){throw 'In-place upgrade failed.'}
if(-not (Test-Path -LiteralPath $fanSentinel)){throw 'Upgrade removed a file outside its manifest.'}
$fanResults.Add('PASS: reinstallation upgrades in place and preserves files outside the package manifest')
$fanUninstaller=Join-Path $fanInstallRoot 'Uninstall.exe'
$fanGuard=[Threading.Mutex]::new($false,'Local\cinna-fanCon.Running')
try {
  $fanProcess=Start-Process -FilePath $fanUninstaller -ArgumentList @('/S',('_?='+$fanInstallRoot)) -WindowStyle Hidden -PassThru -Wait
  if($fanProcess.ExitCode -ne 10){throw 'Uninstall did not block while the fan worker guard was active.'}
} finally {$fanGuard.Dispose()}
if(-not (Test-Path -LiteralPath $fanApp)){throw 'Blocked uninstall removed application files.'}
$fanResults.Add('PASS: uninstall refuses to remove an app with active fan control')
$fanProcess=Start-Process -FilePath $fanUninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
$fanDeadline=[DateTime]::UtcNow.AddSeconds(20)
while(((Test-Path -LiteralPath $fanRegistry) -or (Test-Path -LiteralPath $fanApp) -or (Test-FanInstalling)) -and [DateTime]::UtcNow -lt $fanDeadline){Start-Sleep -Milliseconds 200}
if((Test-Path -LiteralPath $fanRegistry) -or (Test-Path -LiteralPath $fanApp) -or (Test-Path -LiteralPath $fanShortcut)){throw 'Uninstall did not remove the app, registry entry or shortcut.'}
if(-not (Test-Path -LiteralPath $fanSentinel)){throw 'Uninstall removed a file outside its manifest.'}
$fanResults.Add('PASS: uninstall removes packaged files, app registration and shortcuts; other files remain')
Remove-Item -LiteralPath $fanSentinel
if((Get-ChildItem -LiteralPath $fanInstallRoot -Force | Measure-Object).Count -eq 0){Remove-Item -LiteralPath $fanInstallRoot}
if($KeepInstalled){
  if((Invoke-FanSetup) -ne 0){throw 'Final installation failed.'}
  $fanResults.Add('PASS: final copy installed for the current user')
}
$fanResults.Add('All application checks use demo fans; no physical fan control is exercised.')
$fanResults | Set-Content -LiteralPath (Join-Path $fanReports 'installer.txt') -Encoding utf8
$fanResults
