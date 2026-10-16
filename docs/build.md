# Build and test

Build on Windows x64 with .NET Framework 4.8, Node.js 24 and pnpm 11.25.0. Run the following commands from the repository root. The packaged app needs neither Node.js nor a .NET SDK.

```powershell
pwsh -File ./scripts/build.ps1
pwsh -File ./scripts/test.ps1
pwsh -File ./scripts/test.ps1 -Desktop
pwsh -File ./scripts/package.ps1
```

`build.ps1` downloads the pinned LibreHardwareMonitor and WebView2 SDK packages into `.deps` and checks their SHA-256. It builds the frontend, compiles both C# executables with the Windows .NET Framework compiler and writes the app to `artifacts/app`.

`test.ps1` checks control logic using simulated fan ports. With `-Desktop`, it also runs the WebView2 interface in demo mode and checks preset changes, restoration, per-fan exclusion and theme switching through the native worker. Both modes use simulated fans and do not access physical hardware. Desktop tests require WebView2 Runtime. Reports are saved in `artifacts/tests`.

`package.ps1` writes a portable ZIP and its SHA-256 file to `dist`. The app downloads PawnIO's pinned installer from its official release when motherboard setup needs it; the installer is not included in the ZIP.

To work on the frontend:

```powershell
pnpm --dir frontend install --frozen-lockfile --ignore-scripts
pnpm --dir frontend dev
```

The browser preview uses simulated data and does not connect to a hardware worker.

Native source is in `native`, frontend source in `frontend/src`, and third-party notices in `third-party`. Pinned native dependencies are listed in `scripts/dependencies.json`. Build outputs, dependency caches and test reports are excluded from Git.

Profiles are saved in `%LOCALAPPDATA%\cinna-fanCon\profiles.json`. If that file is missing, the loader can read `%LOCALAPPDATA%\FanDesk\profiles.json` from the previous application name. Subsequent saves use the new location. Both versions share a process lock to prevent simultaneous control of the same fans.

# 构建与测试

构建需要 Windows x64、.NET Framework 4.8、Node.js 24 和 pnpm 11.25.0。请在仓库根目录运行上方命令。运行发布包不需要 Node.js 或 .NET SDK。

`build.ps1` 将固定版本的 LibreHardwareMonitor 和 WebView2 SDK 下载到 `.deps` 并校验 SHA-256，再构建前端，用 Windows 自带的 .NET Framework 编译器编译两个 C# 程序。构建结果位于 `artifacts/app`。

`test.ps1` 使用模拟风扇检查控制逻辑。加上 `-Desktop` 后，还会在 WebView2 中运行演示界面，通过原生服务检查模式切换、恢复、单组排除和主题切换。两种测试均不访问真实硬件，报告位于 `artifacts/tests`。桌面测试需要 WebView2 Runtime。

`package.ps1` 将便携 ZIP 和 SHA-256 文件写入 `dist`。PawnIO 安装器不随 ZIP 分发，应用会在主板设置需要时从官方发布地址下载固定版本。

前端开发使用上方 pnpm 命令。浏览器预览使用模拟数据，不连接硬件服务。原生源码位于 `native`，前端源码位于 `frontend/src`，第三方说明位于 `third-party`，原生依赖版本记录在 `scripts/dependencies.json`。

风扇配置保存在 `%LOCALAPPDATA%\cinna-fanCon\profiles.json`。该文件不存在时，可读取旧名称下的 `%LOCALAPPDATA%\FanDesk\profiles.json`，后续保存使用新目录。两个版本共用进程锁，避免同时调节同一组风扇。

本机硬件报告、已保存配置、依赖缓存、测试报告和构建输出均不提交到 Git。
