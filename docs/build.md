# Build and test

Run these commands on Windows x64 with .NET Framework 4.8, Node.js 24 and pnpm 11.25.0. Running the packaged app does not require Node.js or a .NET SDK.

```powershell
pwsh -File ./scripts/build.ps1
pwsh -File ./scripts/test.ps1
pwsh -File ./scripts/test.ps1 -Desktop
pwsh -File ./scripts/package.ps1
```

`build.ps1` downloads pinned LibreHardwareMonitor and WebView2 SDK packages into `.deps`, verifies their SHA-256, builds the frontend and compiles both C# executables with the Windows .NET Framework compiler. Runtime files are written to `artifacts/app`.

The default test command uses fake ports. `-Desktop` also starts the real WebView2 UI in demo mode and verifies preset changes, restoration, per-fan exclusion and theme switching through the private worker bridge. Neither test mode opens real hardware. WebView2 Runtime is required for desktop tests.

`package.ps1` writes the portable archive and a checksum into `dist`. PawnIO's installer is not bundled; the application downloads the pinned installer from its official vendor release only when the user starts motherboard setup.

For frontend changes:

```powershell
pnpm --dir frontend install --frozen-lockfile --ignore-scripts
pnpm --dir frontend dev
```

Browser previews use synthetic demo data. They do not access a native hardware worker.

Native source is in `native`, frontend source is in `frontend/src`, and notices are in `third-party`. The dependency manifest is `scripts/dependencies.json`. Build outputs, cached packages and test reports stay out of Git.

Normal profiles are saved under `%LOCALAPPDATA%\cinna-fanCon`. If no new profile exists, the loader can read a legacy `%LOCALAPPDATA%\FanDesk\profiles.json`. The established singleton name is retained so the old and renamed applications cannot control the same hardware at the same time.

# 构建与测试

需要 Windows x64、.NET Framework 4.8、Node.js 24 和 pnpm 11.25.0。运行发布包不需要 Node.js 或 .NET SDK。

上方命令依次构建、运行核心测试、运行桌面演示测试并打包。依赖缓存位于 `.deps`，程序位于 `artifacts/app`，测试报告位于 `artifacts/tests`，发布包位于 `dist`。

核心测试使用模拟控制器；桌面测试在真实 WebView2 中使用演示风扇，检查模式切换、恢复、单组排除和主题。两者均不打开真实硬件。桌面测试需要 WebView2 Runtime。

浏览器开发预览使用合成数据，不连接原生硬件服务。项目不提交本机硬件报告、运行配置、依赖缓存或二进制构建输出。
