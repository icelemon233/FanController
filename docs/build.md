# Build and test

Build on Windows x64 with .NET Framework 4.8, Node.js 24 and pnpm 11.25.0. Run the following commands from the repository root. The packaged app needs neither Node.js nor a .NET SDK.

```powershell
pwsh -File ./scripts/build.ps1
pwsh -File ./scripts/test.ps1
pwsh -File ./scripts/test.ps1 -Desktop
pwsh -File ./scripts/package.ps1
pwsh -File ./scripts/build-installer.ps1
```

`build.ps1` downloads the pinned LibreHardwareMonitor and WebView2 SDK packages into `.deps` and checks their SHA-256. It builds the frontend, compiles both C# executables with the Windows .NET Framework compiler and writes the app to `artifacts/app`.

`test.ps1` checks control logic using simulated fan ports. With `-Desktop`, it also runs the WebView2 interface in demo mode and checks staged editing, exact parameter review, application, restoration, exclusions, draft protection on exit and theme switching through the native worker. Both modes use simulated fans and do not access physical hardware. Desktop tests require WebView2 Runtime. Reports and loading, empty, error and long-name screenshots are saved in `artifacts/tests`. Popup interaction is verified in a foreground browser or native window; the offscreen harness does not prove physical keyboard or pointer behavior.

For visible window checks alongside an existing installation, run `artifacts/app/FanController.exe --ui-qa`. This mode uses simulated fans, in-memory fan profiles and a separate WebView cache under `work/webview-v2-qa-<pid>`. Its window and tray identify the QA session. It does not acquire the real-app singleton or write production appearance preferences. Exit normally from Settings after checking the window.

`package.ps1` writes a portable ZIP and its SHA-256 file to `dist`. The app downloads PawnIO's pinned installer from its official release when motherboard setup needs it; the installer is not included in the ZIP.

`build-installer.ps1` uses pinned Inno Setup 7.1.0, downloaded from the official release and checked by SHA-256 and publisher. The compiler is extracted in its official portable mode without system registration. Set `INNOSETUP_ISCC` or pass `-CompilerPath` to reuse the exact compiler. Source and shared behavior are documented in [installer/inno](../installer/inno/README.md).

The Chinese native interface follows Windows light/dark appearance and always offers installation scope, an editable destination and separate desktop/Start menu shortcuts. Current-user defaults to `%LOCALAPPDATA%\Programs\cinna-fanCon`; all-users defaults to `%ProgramFiles%\FanController` and requests Windows elevation after Install. Upgrades retain the registered location. Uninstall first to relocate an existing installation; profiles and unrelated files remain.

The embedded Microsoft WebView2 bootstrapper is pinned and checked by hash and Microsoft signature. It runs only when the runtime is missing. A changed download fails verification; check Microsoft's current signature before updating `scripts/dependencies.json`.

`scripts/test-installer.ps1` builds an isolated QA installer and checks fresh installation, Chinese/space paths, shortcut choices, upgrade, legacy registration migration, maintenance locks, uninstall and user-file preservation. It does not control physical fans or use the daily installation. `scripts/test-installer-update.ps1` uses a fake host/worker to verify restoration-before-exit, refusal, wrong-path protection, silent maintenance, tray state and legacy window messages. The existing `Ready`, `Refuse`, `WrongPath`, `Silent`, `Idle`, `-Tray` and `-Legacy` scenarios remain available.

For a visible QA installer:

```powershell
$fanQaRoot = Join-Path (Get-Location) ('work/inno-qa-' + [Guid]::NewGuid().ToString('N'))
./scripts/build-installer.ps1 -QaRoot $fanQaRoot
```

QA files, registration, shortcuts and mutexes are isolated at compile time. App launch uses `--ui-qa`, and QA refuses to install shared runtimes. All-users UAC, a genuinely missing runtime and physical DPI changes need separate interactive checks. Production setup accepts no QA redirection parameter.

Before updating or uninstalling, setup requests normal app exit, waits for fan restoration and the worker, and aborts if shutdown fails. Silent maintenance refuses a running app unless `/CLOSEAPP` requests normal exit. `/CLOSEAPPLICATIONS` and `/FORCECLOSEAPPLICATIONS` are rejected. The maintenance lock is released before the finish-page launch. Inno's uninstall log removes installed files; `%LOCALAPPDATA%\cinna-fanCon` and user-added files remain.

Inno source is `installer/inno/setup.iss`; `product.json` preserves product identity and maps the old NSIS registration. The old uninstaller and record are retired only after success, without invoking the old uninstaller against newly installed files. The confirmed artwork remains `docs/brand/cinna-app-icon.png`. The header uses that icon; installer/inno/assets contains separate approved day/night business scenes. The native UI is built with pinned Zig 0.15.2 and needs no additional runtime. Signing is not configured; local comparison packages use a `custom` suffix, retaining the old NSIS packages. A public release requires a new version.
The full-window scene, settings drawer, red cancellation button, completion actions and upgrade recovery share one implementation. Run `installer/inno/test-custom.ps1` alongside the existing installer tests. Current evidence and manual verification limits are in [custom-installer-validation.md](custom-installer-validation.md).

To work on the frontend:

```powershell
pnpm --dir frontend install --frozen-lockfile --ignore-scripts
pnpm --dir frontend check
pnpm --dir frontend dev
```

The development server uses an explicitly labelled browser demo when the native bridge is unavailable. To preview a built browser demo, run `pnpm --dir frontend build:demo` and `pnpm --dir frontend preview:demo`. That output is separate from the desktop production build. A production desktop bundle without its native bridge shows a connection error and never silently creates simulated devices.

Version tags matching `version.json` run `.github/workflows/release.yml`. After frontend, native and isolated installer checks, the workflow publishes the Windows installer, portable ZIP, SHA-256 files and a source-commit manifest using `docs/releases/<tag>.md`. Preview versions remain prereleases; existing releases are not overwritten. The ordinary check workflow keeps read-only permissions, while the tag-release job has the contents permission needed to upload its own release.

`check` runs strict type checking of application code, tests and Vite configuration, Biome lint with import boundaries and cycle checks, formatting checks and Node behavior tests. The [frontend architecture](./frontend-architecture.md) records state ownership, lifecycle and the native contract. The read-only GitHub workflow runs frontend checks and Windows core checks; desktop and installer checks still run on a Windows desktop session.

Native source is in `native`, frontend source in `frontend/src`, and third-party notices in `third-party`. Pinned native dependencies are listed in `scripts/dependencies.json`. Build outputs, dependency caches and test reports are excluded from Git.

Profiles are saved in `%LOCALAPPDATA%\cinna-fanCon\profiles.json`. If that file is missing, the loader can read `%LOCALAPPDATA%\FanDesk\profiles.json` from the previous application name. Subsequent saves use the new location. Both versions share a process lock to prevent simultaneous control of the same fans.

# 构建与测试

构建需要 Windows x64、.NET Framework 4.8、Node.js 24 和 pnpm 11.25.0。请在仓库根目录运行上方命令。运行发布包不需要 Node.js 或 .NET SDK。

`build.ps1` 将固定版本的 LibreHardwareMonitor 和 WebView2 SDK 下载到 `.deps` 并校验 SHA-256，再构建前端，用 Windows 自带的 .NET Framework 编译器编译两个 C# 程序。构建结果位于 `artifacts/app`。

`test.ps1` 使用模拟风扇检查控制逻辑。加上 `-Desktop` 后，还会在 WebView2 中运行演示界面，通过原生服务检查模式切换、恢复、单组排除和主题切换。两种测试均不访问真实硬件，报告位于 `artifacts/tests`。桌面测试需要 WebView2 Runtime。

`test-worker-connection.ps1` 在临时目录使用模拟服务检查异常退出、管道结束、启动失败、没有新读数及拒绝退出。正常关闭不会误报崩溃；断连会清除原生缓存，握手或旧快照不能冒充新读数。模拟服务拒绝退出时，测试确认它仍在运行，不会被强制结束。

`package.ps1` 将便携 ZIP 和 SHA-256 文件写入 `dist`。PawnIO 安装器不随 ZIP 分发，应用会在主板设置需要时从官方发布地址下载固定版本。

`build-installer.ps1` 使用固定的 Inno Setup 7.1.0，校验官方下载的 SHA-256 和发布者后以便携模式使用，不注册编译器、文件关联或快捷方式。已有编译器可通过 `INNOSETUP_ISCC` 或 `-CompilerPath` 指定。安装器源码及共用约定见 [installer/inno](../installer/inno/README.md)。

原生场景界面跟随 Windows 深浅主题，始终提供安装范围、可编辑路径、桌面和开始菜单快捷方式选项。当前用户默认安装到 `%LOCALAPPDATA%\Programs\cinna-fanCon`；所有用户默认安装到 `%ProgramFiles%\FanController`，由 Windows 请求提权。升级沿用登记位置，更换位置前需先卸载；配置和用户文件会保留。

WebView2 引导安装器仍校验固定哈希和微软签名，仅在缺少运行库时运行。下载文件变化后构建会停止，核对微软签名后再更新 `scripts/dependencies.json`。

`test-installer.ps1` 自动构建隔离 QA 安装包，验证中文及空格路径、快捷方式选项、升级、旧版登记迁移、维护互斥、卸载和资料保留。`test-installer-update.ps1` 使用模拟程序和服务验证恢复风扇后退出、拒绝退出、错误路径、静默维护、托盘和旧窗口消息。测试不访问真实风扇，也不修改日常安装。可见安装界面使用上方 `work/inno-qa-<GUID>` 命令构建；QA 打开应用时使用 `--ui-qa`，缺少共享运行库时停止。所有用户的实际提权、缺少运行库的干净系统和物理 DPI 切换仍需另行验证。

交互维护会提示并请求正常退出，等待风扇恢复和服务结束，退出失败时停止。静默维护默认拒绝运行中的应用；明确加 `/CLOSEAPP` 才请求正常退出，不接受强制关闭参数。安装完成后先释放维护锁，再按用户选择打开应用。Inno 卸载日志只移除已安装文件，保留 `%LOCALAPPDATA%\cinna-fanCon` 和用户另放入安装目录的资料。

`installer/inno/setup.iss` 负责安装事务，`product.json` 记录产品身份和旧 NSIS 登记。安装成功后才移除旧卸载器和登记，不对新文件调用旧卸载器。图标继续使用已确认的母版，整窗日间与夜间场景位于 installer/inno/assets；原生界面使用固定版本 Zig 0.15.2 编译，不额外依赖界面运行库。当前未配置代码签名；本地对比包带 `custom` 后缀，保留旧包。正式发布需升级版本号。
前端开发使用上方 pnpm 命令。`check` 检查实际源码、测试与 Vite 配置，并运行模块边界、循环依赖、格式和行为测试。开发服务器可使用明确标注的演示设备；构建后的浏览器演示使用 `build:demo` 与 `preview:demo`，输出到独立目录。桌面生产包缺少原生桥接时显示错误，不自动回退为模拟设备。

与 `version.json` 对应的版本标签会触发独立发布工作流。前端、原生和隔离的安装器检查通过后，按 `docs/releases/<tag>.md` 发布 Windows 安装程序、便携 ZIP、SHA-256 文件及源码提交清单。预览版本标为 prerelease，已有发布不会被覆盖。普通检查工作流保持只读，只有标签发布任务获得上传 Release 所需的内容写入权限。

状态归属、生命周期和桥接契约见[前端架构说明](./frontend-architecture.md)。GitHub 工作流以只读权限检查前端和 Windows 核心，构建安装包并验证隔离的退出流程。完整桌面和安装生命周期测试仍在本机 Windows 桌面会话运行。原生源码位于 `native`，前端源码位于 `frontend/src`，第三方说明位于 `third-party`，原生依赖版本记录在 `scripts/dependencies.json`。

风扇配置保存在 `%LOCALAPPDATA%\cinna-fanCon\profiles.json`。该文件不存在时，可读取旧名称下的 `%LOCALAPPDATA%\FanDesk\profiles.json`，后续保存使用新目录。两个版本共用进程锁，避免同时调节同一组风扇。

本机硬件报告、已保存配置、依赖缓存、测试报告和构建输出均不提交到 Git。



整窗场景、设置抽屉、红色取消、完成动作和升级恢复共用一套实现。另运行 `installer/inno/test-custom.ps1` 验证真实原生界面和取消恢复；当前结果及待实机确认项见 [原生安装器验证](custom-installer-validation.md)。
