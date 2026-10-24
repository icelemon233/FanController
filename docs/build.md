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

`build-installer.ps1` verifies and extracts the pinned NSIS compiler without installing it. It compiles a per-user Setup EXE, with optional desktop shortcuts, Start menu entries and an uninstaller. The output and its SHA-256 file are saved in `dist`. The embedded Microsoft WebView2 bootstrapper is checked against its pinned SHA-256 and Microsoft Authenticode signature. Setup uses it only when the runtime is missing.

The bootstrapper's Microsoft download address can change its contents. A changed download fails the checksum check; verify Microsoft's signature before updating the recorded hash in `scripts/dependencies.json`.

To test installation on a Windows account where FanController is not already installed:

```powershell
pwsh -File ./scripts/test-installer.ps1
```

This temporarily installs the app, runs its desktop demo, reinstalls it to check upgrading, and uninstalls it. The test also checks that active control blocks setup and uninstall, and that files outside the package manifest remain. Existing installations are left untouched. No physical fan control is exercised. The branch that downloads a missing WebView2 Runtime needs a separate clean-machine check.

Setup uses `%LOCALAPPDATA%\Programs\cinna-fanCon`. Application and worker mutexes prevent installing or uninstalling while either is running. The installer also blocks launching the application during installation. The uninstaller deletes only files listed in the package manifest, then removes empty directories. Saved profiles under `%LOCALAPPDATA%\cinna-fanCon` remain.

Installer source is in `installer/setup.nsi`. The approved icon is `docs/brand/cinna-app-icon.png`; `scripts/create-icon.ps1` creates the Windows ICO frames and synchronizes the frontend PNG. Code signing requires a signing certificate and is not configured in this repository.

The same resource script exports the installer sidebar and header as RGB BMPs in `installer/assets`, with the source and output hashes recorded in `brand.json`. Installer builds regenerate them and check their source identity, pixel bounds and background. Welcome, finish and uninstall pages share these resources.

To inspect the complete wizard without modifying an existing installation, build a separate QA installer:

```powershell
$fanQaRoot = Join-Path (Get-Location) ('work/installer-ui-qa-' + [Guid]::NewGuid().ToString('N'))
./scripts/build-installer.ps1 -InstallerQaRoot $fanQaRoot
# Optional English wizard, using the same isolated installation:
./scripts/build-installer.ps1 -InstallerQaRoot $fanQaRoot -InstallerQaLanguage English
```

Open the generated QA installer in that directory. Its application files, registry record, shortcuts and mutexes are isolated at compile time; its launch options use `--ui-qa`, and it refuses to install a missing shared runtime. The production installer accepts no QA redirection flag. Keep personal files out of the QA directory and close any QA app normally before testing uninstall.

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

`build-installer.ps1` 校验并解压固定版本的 NSIS 编译器，无需在系统中安装编译器。生成的安装 EXE 支持当前用户安装、开始菜单入口及卸载，默认勾选桌面快捷方式和安装后打开，用户可取消。启动应用前会释放安装互斥锁。文件和 SHA-256 位于 `dist`。随安装包附带的 WebView2 引导安装器会校验 SHA-256 和微软数字签名，仅在缺少运行库时使用。

微软下载地址上的安装器可能更新。文件变化后，校验会拒绝构建；确认微软签名后，再更新 `scripts/dependencies.json` 中的哈希。

在尚未安装 FanController 的 Windows 账户下，可运行 `pwsh -File ./scripts/test-installer.ps1`。测试会临时安装应用、运行桌面演示、重复安装以验证升级，再卸载；同时检查运行中拦截和安装清单外文件的保留。已有安装不会被修改，测试不控制真实风扇。缺少 WebView2 时的联网安装分支，需另用干净系统验证。

构建安装包后，可运行 `pwsh -File ./scripts/test-installer-update.ps1 -Scenario Ready` 检查自动关闭旧版的顺序。此测试在临时目录创建模拟应用和服务，复用安装器的退出逻辑，确认两者均结束后才允许更新。`Refuse` 验证退出失败时停止，`WrongPath` 验证不会关闭其他目录的同名应用，`Silent` 验证静默安装仍会拦截运行中的应用，`Idle` 验证应用未运行时可继续。测试直接调用确认后的退出流程，不自动点击安装界面，也不改动现有安装。

默认测试模拟关闭到托盘的版本，通过独立窗口消息 `CinnaFanCon.RequestExit` 请求退出。加上 `-Tray` 验证隐藏到托盘后的升级；加上 `-Legacy` 验证旧名称、仅支持 `WM_CLOSE` 的版本。当前应用最小化时留在任务栏，关闭默认进入托盘，可在设置改为退出。托盘退出、设置中的退出和安装器请求均先恢复风扇，再结束服务。

应用安装到 `%LOCALAPPDATA%\Programs\cinna-fanCon`。交互式安装会提示关闭运行中的旧版；确认后通过正常退出流程恢复风扇，并等待主程序和服务结束，最长等待约 30 秒。退出失败时停止安装，程序文件不会被修改。静默安装和卸载仍会拒绝操作运行中的应用，安装期间也会阻止启动应用。卸载仅删除安装清单中的文件，再移除空目录；`%LOCALAPPDATA%\cinna-fanCon` 中的配置会保留。

安装源码位于 `installer/setup.nsi`。应用图标统一源自 `docs/brand/cinna-app-icon.png`。构建时会运行 `scripts/create-icon.ps1`，生成包含 16–256 像素图层的 Windows ICO，并同步前端 PNG。窗口、托盘、安装程序和快捷方式使用同一图标；前端构建和打包会核对图片哈希。仓库尚未配置代码签名，签名需要相应证书。

同一资源脚本还会导出 `installer/assets` 中的 RGB BMP 侧图和页头，并在 `brand.json` 记录母版与文件哈希。安装包构建会重新生成资源，校验来源、图像边界和背景色。欢迎、完成和卸载页面使用同一套品牌资源。

上方 QA 安装包命令可验证完整向导，不修改日常安装。QA 的程序目录、注册项、快捷方式和互斥锁在编译时隔离，打开应用时使用 `--ui-qa`，缺少共享运行库时停止测试。正式安装包不接受 QA 重定向参数。QA 目录只放测试资料，卸载前正常退出其中的演示应用。

前端开发使用上方 pnpm 命令。`check` 检查实际源码、测试与 Vite 配置，并运行模块边界、循环依赖、格式和行为测试。开发服务器可使用明确标注的演示设备；构建后的浏览器演示使用 `build:demo` 与 `preview:demo`，输出到独立目录。桌面生产包缺少原生桥接时显示错误，不自动回退为模拟设备。

与 `version.json` 对应的版本标签会触发独立发布工作流。前端、原生和隔离的安装器检查通过后，按 `docs/releases/<tag>.md` 发布 Windows 安装程序、便携 ZIP、SHA-256 文件及源码提交清单。预览版本标为 prerelease，已有发布不会被覆盖。普通检查工作流保持只读，只有标签发布任务获得上传 Release 所需的内容写入权限。

状态归属、生命周期和桥接契约见[前端架构说明](./frontend-architecture.md)。GitHub 工作流以只读权限检查前端和 Windows 核心，构建安装包并验证隔离的退出流程。完整桌面和安装生命周期测试仍在本机 Windows 桌面会话运行。原生源码位于 `native`，前端源码位于 `frontend/src`，第三方说明位于 `third-party`，原生依赖版本记录在 `scripts/dependencies.json`。

风扇配置保存在 `%LOCALAPPDATA%\cinna-fanCon\profiles.json`。该文件不存在时，可读取旧名称下的 `%LOCALAPPDATA%\FanDesk\profiles.json`，后续保存使用新目录。两个版本共用进程锁，避免同时调节同一组风扇。

本机硬件报告、已保存配置、依赖缓存、测试报告和构建输出均不提交到 Git。
