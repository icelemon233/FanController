; -*- coding: utf-8 -*-
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

Name "FanController"
BrandingText "FanController"
OutFile "${OutputFile}"
InstallDir "$LOCALAPPDATA\Programs\cinna-fanCon"
RequestExecutionLevel user
SetCompressor /SOLID lzma
CRCCheck force
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "${AppVersion}.0"
VIAddVersionKey /LANG=1033 "ProductName" "FanController"
VIAddVersionKey /LANG=1033 "FileDescription" "FanController Windows installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${AppVersion}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Cinna"
VIAddVersionKey /LANG=1033 "CompanyName" "Cinna"

!define UninstallKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\cinna-fanCon"
!define MUI_ICON "${ProjectRoot}\native\assets\app.ico"
!define MUI_UNICON "${ProjectRoot}\native\assets\app.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "FanController ${AppVersion}"
!define MUI_WELCOMEPAGE_TEXT "$(WelcomeText)"
!define MUI_FINISHPAGE_RUN "$INSTDIR\FanController.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

LangString WelcomeText ${LANG_SIMPCHINESE} "安装 FanController，为当前用户创建开始菜单入口和卸载程序。$\r$\n$\r$\n需要 Windows 10/11 x64 和 .NET Framework 4.8。缺少 WebView2 Runtime 时，安装程序会联网安装微软运行库。$\r$\n$\r$\n应用启动后不会自动接管风扇。主板访问权限在应用内设置。"
LangString WelcomeText ${LANG_ENGLISH} "Install FanController for the current user, with a Start menu shortcut and an uninstaller.$\r$\n$\r$\nRequires Windows 10/11 x64 and .NET Framework 4.8. If WebView2 Runtime is missing, setup installs it from Microsoft using an internet connection.$\r$\n$\r$\nThe app does not take control of fans on startup. Motherboard access is configured in the app."
LangString AppSection ${LANG_SIMPCHINESE} "FanController 应用（必选）"
LangString AppSection ${LANG_ENGLISH} "FanController application (required)"
LangString DesktopShortcut ${LANG_SIMPCHINESE} "桌面快捷方式"
LangString DesktopShortcut ${LANG_ENGLISH} "Desktop shortcut"
LangString AppRunning ${LANG_SIMPCHINESE} "请先从托盘退出 FanController，等待风扇恢复后再安装或卸载。安装程序不会强制结束风扇服务。"
LangString AppRunning ${LANG_ENGLISH} "Exit FanController from the tray and wait for the fans to be restored before installing or uninstalling. Setup will not force the fan worker to stop."
LangString CloseAppPrompt ${LANG_SIMPCHINESE} "FanController 正在运行。$\r$\n$\r$\n点击“确定”后，安装程序会请求应用正常退出，等待风扇恢复和服务结束后继续安装。$\r$\n$\r$\n点击“取消”可停止安装，继续使用当前版本。"
LangString CloseAppPrompt ${LANG_ENGLISH} "FanController is running.$\r$\n$\r$\nClick OK to close the app normally. Setup will wait for fan restoration and the worker to exit before continuing.$\r$\n$\r$\nClick Cancel to stop setup and keep using the current version."
LangString ClosingApp ${LANG_SIMPCHINESE} "正在请求应用退出，等待风扇恢复和服务结束…"
LangString ClosingApp ${LANG_ENGLISH} "Closing the app and waiting for fan restoration and the worker to exit..."
LangString CloseAppFailed ${LANG_SIMPCHINESE} "应用或风扇服务未能正常退出，安装已停止。$\r$\n$\r$\n程序文件尚未修改。请查看应用中的风扇恢复提示；如果应用以管理员身份运行，请用相同权限运行安装程序后再试。"
LangString CloseAppFailed ${LANG_ENGLISH} "The app or fan worker could not exit normally. Setup has stopped.$\r$\n$\r$\nNo program files were changed. Check the app for fan-restoration messages. If the app is running as administrator, run setup with the same privileges and try again."
LangString SetupRunning ${LANG_SIMPCHINESE} "另一个安装或卸载程序正在运行，请等待完成。"
LangString SetupRunning ${LANG_ENGLISH} "Another installation or uninstallation is running. Wait for it to finish."
LangString UnsupportedWindows ${LANG_SIMPCHINESE} "此安装包需要 Windows 10/11 x64。"
LangString UnsupportedWindows ${LANG_ENGLISH} "This installer requires Windows 10/11 x64."
LangString NeedFramework ${LANG_SIMPCHINESE} "请先安装 Microsoft .NET Framework 4.8，再运行此安装包。下载地址见仓库使用说明。"
LangString NeedFramework ${LANG_ENGLISH} "Install Microsoft .NET Framework 4.8 before running this installer. The repository guide links to the download."
LangString InvalidLocation ${LANG_SIMPCHINESE} "安装位置与应用记录不符，已停止操作。"
LangString InvalidLocation ${LANG_ENGLISH} "The installation location does not match the app record. The operation has been stopped."
LangString NeedWebView ${LANG_SIMPCHINESE} "未能安装 WebView2 Runtime。请检查网络，或从微软官网安装运行库后重试。"
LangString NeedWebView ${LANG_ENGLISH} "WebView2 Runtime could not be installed. Check the connection, or install the runtime from Microsoft and retry."
LangString UpgradeFailed ${LANG_SIMPCHINESE} "旧版本未能卸载，安装已停止。请先在 Windows 设置中卸载旧版本。"
LangString UpgradeFailed ${LANG_ENGLISH} "The previous version could not be uninstalled. Remove it in Windows Settings before retrying."

Var SetupMutex
Var RuntimeInstalled

!define RunningMutex "Local\cinna-fanCon.Running"
!define CurrentWindowTitle "FanController · 风扇控制"
!define PreviousWindowTitle "cinna-fanCon · 风扇控制"
!define LegacyWindowTitle "cinna-fanCon · 智能散热"
!include "${ProjectRoot}\installer\RunningApp.nsh"
!insertmacro RunningCheck "un."

!macro Guard Prefix
Function ${Prefix}ValidateLocation
  SetShellVarContext current
  SetRegView 64
  GetFullPathName $0 "$INSTDIR"
  GetFullPathName $1 "$LOCALAPPDATA\Programs\cinna-fanCon"
  ${If} $0 != $1
    MessageBox MB_OK|MB_ICONSTOP "$(InvalidLocation)" /SD IDOK
    SetErrorLevel 11
    Quit
  ${EndIf}
FunctionEnd
Function ${Prefix}Guard
  Call ${Prefix}ValidateLocation
  Call ${Prefix}CheckRunning
  ${If} $AppIsRunning != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(AppRunning)" /SD IDOK
    SetErrorLevel 10
    Quit
  ${EndIf}
FunctionEnd
!macroend
!insertmacro Guard ""
!insertmacro Guard "un."

Function .onInit
  SetShellVarContext current
  StrCpy $LANGUAGE ${LANG_SIMPCHINESE}
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\cinna-fanCon"
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\cinna-fanCon.Installing") p .r0 ?e'
  Pop $1
  StrCpy $SetupMutex $0
  ${If} $1 = 183
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(SetupRunning)" /SD IDOK
    SetErrorLevel 12
    Quit
  ${EndIf}
  Call ValidateLocation
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "$(UnsupportedWindows)" /SD IDOK
    SetErrorLevel 13
    Quit
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "$(UnsupportedWindows)" /SD IDOK
    SetErrorLevel 13
    Quit
  ${EndIf}
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
  ${If} $0 < 528040
    MessageBox MB_OK|MB_ICONSTOP "$(NeedFramework)" /SD IDOK
    SetErrorLevel 14
    Quit
  ${EndIf}
FunctionEnd

Function DetectRuntime
  StrCpy $RuntimeInstalled 0
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ReadRegStr $1 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 != ""
  ${AndIf} $0 != "0.0.0.0"
    StrCpy $RuntimeInstalled 1
  ${EndIf}
  ${If} $1 != ""
  ${AndIf} $1 != "0.0.0.0"
    StrCpy $RuntimeInstalled 1
  ${EndIf}
  SetRegView 64
FunctionEnd

Section "$(AppSection)" Application
  SectionIn RO
  Call ValidateLocation
  Call PrepareForInstall
  Call DetectRuntime
  ${If} $RuntimeInstalled = 0
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    File /oname=MicrosoftEdgeWebview2Setup.exe "${Bootstrapper}"
    ExecWait '"$PLUGINSDIR\MicrosoftEdgeWebview2Setup.exe" /silent /install' $0
    Call DetectRuntime
    ${If} $RuntimeInstalled = 0
      MessageBox MB_OK|MB_ICONSTOP "$(NeedWebView)" /SD IDOK
      SetErrorLevel 15
      Quit
    ${EndIf}
  ${EndIf}
  ReadRegStr $0 HKCU "${UninstallKey}" "InstallLocation"
  ReadRegStr $2 HKCU "${UninstallKey}" "DisplayName"
  ${If} $0 != ""
  ${AndIf} $0 != $INSTDIR
    MessageBox MB_OK|MB_ICONSTOP "$(InvalidLocation)" /SD IDOK
    SetErrorLevel 11
    Quit
  ${EndIf}
  IfFileExists "$INSTDIR\Uninstall.exe" 0 no_upgrade
    ${If} $0 != $INSTDIR
      MessageBox MB_OK|MB_ICONSTOP "$(InvalidLocation)" /SD IDOK
      SetErrorLevel 11
      Quit
    ${EndIf}
    ${If} $2 != "FanController"
    ${AndIf} $2 != "cinna-fanCon"
      MessageBox MB_OK|MB_ICONSTOP "$(InvalidLocation)" /SD IDOK
      SetErrorLevel 11
      Quit
    ${EndIf}
    ExecWait '"$INSTDIR\Uninstall.exe" /S /UPGRADE _?=$INSTDIR' $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONSTOP "$(UpgradeFailed)" /SD IDOK
      SetErrorLevel 16
      Quit
    ${EndIf}
    Delete "$INSTDIR\Uninstall.exe"
  no_upgrade:
  SetOutPath "$INSTDIR"
  File /r "${Payload}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\FanController"
  CreateShortcut "$SMPROGRAMS\FanController\FanController.lnk" "$INSTDIR\FanController.exe" "" "$INSTDIR\FanController.exe" 0
  CreateShortcut "$SMPROGRAMS\FanController\卸载 FanController.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
  WriteRegStr HKCU "${UninstallKey}" "DisplayName" "FanController"
  WriteRegStr HKCU "${UninstallKey}" "DisplayVersion" "${AppVersion}"
  WriteRegStr HKCU "${UninstallKey}" "Publisher" "Cinna"
  WriteRegStr HKCU "${UninstallKey}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UninstallKey}" "DisplayIcon" "$INSTDIR\FanController.exe,0"
  WriteRegStr HKCU "${UninstallKey}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UninstallKey}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegStr HKCU "${UninstallKey}" "URLInfoAbout" "https://github.com/icelemon233/FanController"
  WriteRegDWORD HKCU "${UninstallKey}" "NoModify" 1
  WriteRegDWORD HKCU "${UninstallKey}" "NoRepair" 1
  WriteRegDWORD HKCU "${UninstallKey}" "EstimatedSize" ${InstalledSizeKB}
  System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$INSTDIR\FanController.exe", p 0)'
  System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$SMPROGRAMS\FanController\FanController.lnk", p 0)'
SectionEnd

Section /o "$(DesktopShortcut)" Desktop
  CreateShortcut "$DESKTOP\FanController.lnk" "$INSTDIR\FanController.exe" "" "$INSTDIR\FanController.exe" 0
  System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$DESKTOP\FanController.lnk", p 0)'
SectionEnd

Function un.onInit
  Call un.Guard
  ; Only an explicit upgrade may share the parent installer's mutex.
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\cinna-fanCon.Installing") p .r0 ?e'
  Pop $1
  StrCpy $SetupMutex $0
  ${If} $1 = 183
    ${GetParameters} $0
    ClearErrors
    ${GetOptions} $0 "/UPGRADE" $1
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(SetupRunning)" /SD IDOK
      SetErrorLevel 12
      Quit
    ${EndIf}
  ${EndIf}
FunctionEnd

Section "Uninstall"
  Call un.Guard
  SetOutPath "$TEMP"
  !include "${RemovalList}"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$DESKTOP\FanController.lnk"
  Delete "$SMPROGRAMS\FanController\FanController.lnk"
  Delete "$SMPROGRAMS\FanController\卸载 FanController.lnk"
  RMDir "$SMPROGRAMS\FanController"
  DeleteRegKey HKCU "${UninstallKey}"
  RMDir "$INSTDIR"
SectionEnd
