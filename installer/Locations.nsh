!ifndef FANCONTROLLER_INSTALLER_LOCATIONS
!define FANCONTROLLER_INSTALLER_LOCATIONS

; QA locations are fixed at compile time. Production installers cannot redirect
; their files, registry record, shortcuts or mutexes through command-line flags.
!ifdef InstallerQaRoot
  !ifndef InstallerQaId
    !error "Installer QA builds require an isolated ID."
  !endif
  !define FanInstallLocation "${InstallerQaRoot}\app"
  !define UninstallKey "Software\Cinna\FanController\InstallerQA\${InstallerQaId}"
  !define FanStartMenuLocation "${InstallerQaRoot}\shortcuts"
  !define FanDesktopShortcut "${InstallerQaRoot}\desktop\FanController.lnk"
  !define FanInstallingMutex "Local\FanController.InstallerQA.${InstallerQaId}.Installing"
  !define RunningMutex "Local\FanController.InstallerQA.${InstallerQaId}.Running"
  !define CurrentWindowTitle "FanController Installer QA ${InstallerQaId}"
  !define PreviousWindowTitle "FanController Installer QA ${InstallerQaId} previous"
  !define OlderWindowTitle "FanController Installer QA ${InstallerQaId} older"
  !define LegacyWindowTitle "FanController Installer QA ${InstallerQaId} legacy"
!else
  !define FanInstallLocation "$LOCALAPPDATA\Programs\cinna-fanCon"
  !define UninstallKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\cinna-fanCon"
  !define FanStartMenuLocation "$SMPROGRAMS\FanController"
  !define FanDesktopShortcut "$DESKTOP\FanController.lnk"
  !define FanInstallingMutex "Local\cinna-fanCon.Installing"
  !define RunningMutex "Local\cinna-fanCon.Running"
  !define CurrentWindowTitle "FanController"
  !define PreviousWindowTitle "FanController · 风扇控制"
  !define OlderWindowTitle "cinna-fanCon · 风扇控制"
  !define LegacyWindowTitle "cinna-fanCon · 智能散热"
!endif
!endif
