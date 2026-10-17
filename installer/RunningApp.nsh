!include "LogicLib.nsh"

!ifndef PreviousWindowTitle
  !define PreviousWindowTitle ""
!endif

Var AppIsRunning
Var AppWindow
Var ClosingProcess
Var CloseChecks
Var CloseCompleted

!ifndef CloseWaitChecks
  !define CloseWaitChecks 150
!endif

!macro RunningCheck Prefix
Function ${Prefix}CheckRunning
  StrCpy $AppIsRunning 0
  StrCpy $AppWindow 0
  System::Call 'kernel32::OpenMutexW(i 0x100000, i 0, w "${RunningMutex}") p .r0 ?e'
  Pop $1
  ${If} $0 != 0
    System::Call 'kernel32::CloseHandle(p r0)'
    StrCpy $AppIsRunning 1
  ${Else}
    ${If} $1 = 5
      StrCpy $AppIsRunning 1
    ${EndIf}
  ${EndIf}
  FindWindow $AppWindow "" "${CurrentWindowTitle}"
  ${If} $AppWindow = 0
    ${If} "${PreviousWindowTitle}" != ""
      FindWindow $AppWindow "" "${PreviousWindowTitle}"
    ${EndIf}
  ${EndIf}
  ${If} $AppWindow = 0
    FindWindow $AppWindow "" "${LegacyWindowTitle}"
  ${EndIf}
  ${If} $AppWindow != 0
    StrCpy $AppIsRunning 1
  ${EndIf}
FunctionEnd
!macroend

!insertmacro RunningCheck ""

; Only interactive installation may request a normal close. Silent setup and
; uninstall keep their existing running-app guard.
Function PrepareForInstall
  Call CheckRunning
  ${If} $AppIsRunning = 0
    Return
  ${EndIf}
  IfSilent 0 confirm_close
    Call Guard
    Return
  confirm_close:
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$(CloseAppPrompt)" /SD IDCANCEL IDOK close_app
    SetErrorLevel 10
    Quit
  close_app:
    Call CloseRunningApp
    ${If} $CloseCompleted = 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(CloseAppFailed)" /SD IDOK
      SetErrorLevel 10
      Quit
    ${EndIf}
FunctionEnd

Function CloseRunningApp
    StrCpy $CloseCompleted 0
    Call CheckRunning
    ${If} $AppIsRunning = 0
      StrCpy $CloseCompleted 1
      Return
    ${EndIf}
    StrCpy $ClosingProcess 0
    ${If} $AppWindow = 0
      Goto close_failed
    ${EndIf}
    ; A matching title alone is insufficient: only close this installation's
    ; executable, and retain its process handle until shutdown completes.
    System::Call 'user32::GetWindowThreadProcessId(p $AppWindow, *i .r0) i .r1'
    System::Call 'kernel32::OpenProcess(i 0x101000, i 0, i r0) p .r1'
    StrCpy $ClosingProcess $1
    ${If} $ClosingProcess = 0
      Goto close_failed
    ${EndIf}
    StrCpy $0 ${NSIS_MAX_STRLEN}
    System::Call 'kernel32::QueryFullProcessImageNameW(p $ClosingProcess, i 0, w .r1, *i r0) i .r2'
    ${If} $2 = 0
      Goto close_failed
    ${EndIf}
    GetFullPathName $2 "$INSTDIR\FanController.exe"
    ${If} $1 != $2
      GetFullPathName $2 "$INSTDIR\cinna-fanCon.exe"
      ${If} $1 != $2
        Goto close_failed
      ${EndIf}
    ${EndIf}
    DetailPrint "$(ClosingApp)"
    ; WM_CLOSE goes through the app's existing fan-restoration path. Never
    ; terminate either process or replace files while its worker still runs.
    System::Call 'user32::SendMessageTimeoutW(p $AppWindow, i 0x0010, p 0, p 0, i 0x0003, i 3000, *p .r0) p .r1'
    ${If} $1 = 0
      Goto close_failed
    ${EndIf}
    StrCpy $CloseChecks ${CloseWaitChecks}
  wait_for_exit:
    Call CheckRunning
    System::Call 'kernel32::WaitForSingleObject(p $ClosingProcess, i 0) i .r0'
    ${If} $AppIsRunning = 0
    ${AndIf} $0 = 0
      System::Call 'kernel32::CloseHandle(p $ClosingProcess)'
      StrCpy $ClosingProcess 0
      StrCpy $CloseCompleted 1
      Return
    ${EndIf}
    IntOp $CloseChecks $CloseChecks - 1
    ${If} $CloseChecks <= 0
      Goto close_failed
    ${EndIf}
    Sleep 200
    Goto wait_for_exit
  close_failed:
    ${If} $ClosingProcess != 0
      System::Call 'kernel32::CloseHandle(p $ClosingProcess)'
      StrCpy $ClosingProcess 0
    ${EndIf}
FunctionEnd
