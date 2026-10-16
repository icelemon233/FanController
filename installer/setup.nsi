; -*- coding: utf-8 -*-
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

Name "cinna-fanCon"
BrandingText "cinna-fanCon"
OutFile "${OutputFile}"
InstallDir "$LOCALAPPDATA\Programs\cinna-fanCon"
RequestExecutionLevel user
SetCompressor /SOLID lzma
CRCCheck force
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "${AppVersion}.0"
VIAddVersionKey /LANG=1033 "ProductName" "cinna-fanCon"
VIAddVersionKey /LANG=1033 "FileDescription" "cinna-fanCon Windows installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${AppVersion}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "cinna-fanCon contributors"

!define UninstallKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\cinna-fanCon"
!define MUI_ICON "${ProjectRoot}\native\assets\app.ico"
!define MUI_UNICON "${ProjectRoot}\native\assets\app.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "cinna-fanCon ${AppVersion}"
!define MUI_WELCOMEPAGE_TEXT "$(WelcomeText)"
!define MUI_FINISHPAGE_RUN "$INSTDIR\cinna-fanCon.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

LangString WelcomeText ${LANG_SIMPCHINESE} "安装 cinna-fanCon，为当前用户创建开始菜单入口和卸载程序。$\r$\n$\r$\n需要 Windows 10/11 x64 和 .NET Framework 4.8。缺少 WebView2 Runtime 时，安装程序会联网安装微软运行库。$\r$\n$\r$\n应用启动后不会自动接管风扇。主板访问权限在应用内设置。"
LangString WelcomeText ${LANG_ENGLISH} "Install cinna-fanCon for the current user, with a Start menu shortcut and an uninstaller.$\r$\n$\r$\nRequires Windows 10/11 x64 and .NET Framework 4.8. If WebView2 Runtime is missing, setup installs it from Microsoft using an internet connection.$\r$\n$\r$\nThe app does not take control of fans on startup. Motherboard access is configured in the app."
LangString AppSection ${LANG_SIMPCHINESE} "cinna-fanCon 应用（必选）"
LangString AppSection ${LANG_ENGLISH} "cinna-fanCon application (required)"
LangString DesktopShortcut ${LANG_SIMPCHINESE} "桌面快捷方式"
LangString DesktopShortcut ${LANG_ENGLISH} "Desktop shortcut"
LangString AppRunning ${LANG_SIMPCHINESE} "请先从托盘退出 cinna-fanCon，等待风扇恢复后再安装或卸载。安装程序不会强制结束风扇服务。"
LangString AppRunning ${LANG_ENGLISH} "Exit cinna-fanCon from the tray and wait for the fans to be restored before installing or uninstalling. Setup will not force the fan worker to stop."
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

!macro Guard Prefix
Function ${Prefix}Guard
  SetShellVarContext current
  SetRegView 64
  GetFullPathName $0 "$INSTDIR"
  GetFullPathName $1 "$LOCALAPPDATA\Programs\cinna-fanCon"
  ${If} $0 != $1
    MessageBox MB_OK|MB_ICONSTOP "$(InvalidLocation)" /SD IDOK
    SetErrorLevel 11
    Quit
  ${EndIf}
  System::Call 'kernel32::OpenMutexW(i 0x100000, i 0, w "Local\cinna-fanCon.Running") p .r0'
  ${If} $0 != 0
    System::Call 'kernel32::CloseHandle(p r0)'
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(AppRunning)" /SD IDOK
    SetErrorLevel 10
    Quit
  ${EndIf}
  FindWindow $0 "" "cinna-fanCon · 风扇控制"
  FindWindow $1 "" "cinna-fanCon · 智能散热"
  ${If} $0 != 0
  ${OrIf} $1 != 0
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
  Call Guard
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
  Call Guard
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
    ${OrIf} $2 != "cinna-fanCon"
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
  CreateDirectory "$SMPROGRAMS\cinna-fanCon"
  CreateShortcut "$SMPROGRAMS\cinna-fanCon\cinna-fanCon.lnk" "$INSTDIR\cinna-fanCon.exe"
  CreateShortcut "$SMPROGRAMS\cinna-fanCon\卸载 cinna-fanCon.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UninstallKey}" "DisplayName" "cinna-fanCon"
  WriteRegStr HKCU "${UninstallKey}" "DisplayVersion" "${AppVersion}"
  WriteRegStr HKCU "${UninstallKey}" "Publisher" "icelemon233"
  WriteRegStr HKCU "${UninstallKey}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UninstallKey}" "DisplayIcon" "$INSTDIR\cinna-fanCon.exe,0"
  WriteRegStr HKCU "${UninstallKey}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UninstallKey}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegStr HKCU "${UninstallKey}" "URLInfoAbout" "https://github.com/icelemon233/cinna-fanCon"
  WriteRegDWORD HKCU "${UninstallKey}" "NoModify" 1
  WriteRegDWORD HKCU "${UninstallKey}" "NoRepair" 1
  WriteRegDWORD HKCU "${UninstallKey}" "EstimatedSize" ${InstalledSizeKB}
SectionEnd

Section /o "$(DesktopShortcut)" Desktop
  CreateShortcut "$DESKTOP\cinna-fanCon.lnk" "$INSTDIR\cinna-fanCon.exe"
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
  Delete "$DESKTOP\cinna-fanCon.lnk"
  Delete "$SMPROGRAMS\cinna-fanCon\cinna-fanCon.lnk"
  Delete "$SMPROGRAMS\cinna-fanCon\卸载 cinna-fanCon.lnk"
  RMDir "$SMPROGRAMS\cinna-fanCon"
  DeleteRegKey HKCU "${UninstallKey}"
  RMDir "$INSTDIR"
SectionEnd
