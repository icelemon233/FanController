Unicode true
; The fixture tests shutdown directly; unused interactive UI functions are
; intentionally stripped, while the production installer references them.
!pragma warning disable 6010
!include "MUI2.nsh"
!include "LogicLib.nsh"
Name "cinna-fanCon update test"
OutFile "${FixtureRoot}\update-test.exe"
InstallDir "${ExpectedRoot}"
RequestExecutionLevel user
AutoCloseWindow true
ShowInstDetails show
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"
!include "${FixtureRoot}\messages.nsh"
!define RunningMutex "${FixtureMutex}"
!define CurrentWindowTitle "${FixtureTitle}"
!define LegacyWindowTitle "${FixtureTitle} legacy"
!define CloseWaitChecks 10
!include "${ProjectRoot}\installer\RunningApp.nsh"

Function .onInit
  StrCpy $LANGUAGE ${LANG_SIMPCHINESE}
FunctionEnd
Function Guard
  Call CheckRunning
  ${If} $AppIsRunning != 0
    SetErrorLevel 10
    Quit
  ${EndIf}
FunctionEnd
Section
  !if "${FixtureScenario}" == "Silent"
    Call PrepareForInstall
  !else
    ; Exercise the shared shutdown implementation after simulated approval.
    ; The production confirmation dialog remains in PrepareForInstall.
    Call CloseRunningApp
    ${If} $CloseCompleted = 0
      SetErrorLevel 10
      Quit
    ${EndIf}
  !endif
  FileOpen $0 "$EXEDIR\ready.txt" w
  FileWrite $0 "ready"
  FileClose $0
  SetErrorLevel 0
SectionEnd
