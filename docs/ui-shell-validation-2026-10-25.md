# FanController 窗口外观 QA

日期：2026-10-25。应用版本保持 0.4.7；这是工作区 QA 构建，没有发布。并发的 Inno 安装器、CI、版本和发布修改保留原状，本轮没有推进安装器迁移。

## 源码

- `frontend/src/design/window-shell.json` 是项目内尺寸契约。React 主题和 CSS 读取它；原生宿主嵌入同一文件，不依赖本机 skill 路径。
- `AppShell` 使用 44 DIP 标题栏、24 px 业务图标、14/400 名称、46×44 窗口按钮和 10 px 单方框／重叠方框。业务状态移到 48 DIP 内容工具栏右侧。
- `AppNavigation` 与 `sidebarState` 处理固定、150 ms 延迟收起、悬停浮层、键盘焦点、菜单和拖动保持。沿用原 `cinna-fancon-navigation` 键，将 expanded/collapsed 解释为固定/取消固定，只保存该偏好。设置和图钉位于底部同一行，移除原顶部折叠行。
- 设置改用“跟随系统／浅色／深色”下拉，保留窗口、风扇恢复和关于说明。正文/标签行高 21 px，控件文字 20 px，选择框实际为 320×36 px；菜单行 36、内距 4、圆角 12。普通图标使用 Lucide，原生托盘使用相同图形路径和菜单尺寸契约，附带许可证。
- `inputModality` 区分键盘定位提示和鼠标持有焦点。同一按钮从键盘转鼠标操作后不残留描边，Tab 恢复提示，修饰键与系统快捷键不改变已有输入方式。
- `BrowserWindow` 保留 WPF/WebView2，采用其 CompositionControl，避免子 HWND 遮蔽非客户区命中。使用标准 caption/resize 样式、非零玻璃框和 DWM 圆角策略；普通窗口请求系统圆角，最大化请求直角。共享契约用于原生标题栏命中，窗口按钮通过标准 NC 跟踪执行系统命令。关闭继续经过草稿确认、风扇恢复和服务退出。
- `UiQaOptions` 只在 `--ui-qa` 下生效。模拟风扇及内存配置、私有 WebView 缓存、外观镜像和互斥锁与日常环境分开，不启用主板权限。

## 检查

| 检查 | 结果 |
| --- | --- |
| 前端 | 类型、lint、格式及 46 项行为/对比度测试通过，生产构建通过 |
| 原生 | C# 编译通过；8 组模拟核心测试及规划测试通过 |
| 桌面回归 | 模拟服务连接、草稿保护、参数核对/应用/恢复、排除、深浅主题、最小化、托盘重开与正常退出通过 |
| 浏览器 | 固定/取消固定、悬停浮层不移动主内容、键盘保持、鼠标同焦点描边清除、修饰键、重开恢复、菜单选中/悬停、窄视口抽屉及 Esc 焦点返回通过 |
| 最小布局 | 原生 920×660、标准 1180×780 DIP 的隔离设置页检查通过；浏览器另检查 920×660 和 614×440 CSS 视口，未将它们计作 Windows DPI |
| 正常退出助手 | 编译和错误 PID 拦截通过；发送应用已有正常退出请求并等待，不强制结束进程 |
| Git | `git diff --check` 通过 |

浏览器实测菜单行高 36 px、文字 14/400、行高 20 px、面板圆角 12 px、内距 4 px。浅色控件边界为 #928B82、选中 #E7F4F9、悬停 #E8E7E2；深色控件边界为 #747D87、面板 #24272B、选中 #263C45。按钮悬停/按下与窗口关闭悬停使用批准的主题值。选择框的前置图标与箭头实测为浅色 #706960、深色 #B8B2AA，图标及容器 opacity 均为 1，尺寸 18×18、stroke-width 1.65 px。

## 原生和 DOM 测量

标准隔离窗口实测：HWND DPI 192，WPF 1180×780 DIP，GetWindowRect 2360×1560 物理像素；WebView devicePixelRatio=2、ZoomFactor=1，DOM 视口 1178×778 CSS 像素。

以下矩形以 WebView 左上角为原点，单位为 CSS px，当前 zoom=1：

| 元素 | x / y | 宽 / 高 |
| --- | --- | --- |
| 标题栏 | 0 / 0 | 1178 / 44 |
| 品牌图标 | 16 / 10 | 24 / 24 |
| 品牌名称 | 48 / 15 | 字号 14、字重 400、行高 14 |
| 窗口按钮 | 1040、1086、1132 / 0 | 各 46 / 44，图形 10 / 10 |
| 工具栏 | 224 / 45 | 954 / 48 |
| 侧栏 | 0 / 45 | 224 / 733 |
| 底部行 | 8 / 730 | 208 / 40 |
| 设置 | 8 / 730 | 164 / 40 |
| 图钉 | 180 / 732 | 36 / 36 |
| 主题选择框 | 248 / 186 | 320 / 36 |
| 关闭行为选择框 | 248 / 340 | 320 / 36 |

HWND 样式为 `0x16CF0000`，保留 WS_CAPTION/WS_THICKFRAME；不是 layered window，GetWindowRgn=0，DWM corner preference=2。三个窗口按钮的 WM_NCHITTEST 返回 8/9/20。左、右、上、下、左上、右上、左下、右下分别返回 10/11/12/15/13/14/16/17。这些命中测试是辅助诊断，不代替实际鼠标拖动或 Snap 弹层验收。

离屏测量中，GetWindowRect 和 DWMWA_EXTENDED_FRAME_BOUNDS(9) 同为 x=-32768、y=-32768、2360×1560；ClientToScreen(0,0) 为 (-32768,-32768)，WebView 左上角为 (-32766,-32766)。宿主四边 padding 均为 1 DIP，WebView 在宿主内偏移 1/1 DIP。实际可见 QA 窗口启动后，报告每秒重新读取它自己的 HWND 和 DOM。

## 隔离 QA 交接

构建目录为 `artifacts/ui-shell-app`，压缩包为 `artifacts/ui-shell/FanController-ui-shell-qa-2026-10-25.zip`。从仓库根目录运行：

```powershell
$root = (Get-Location).Path
$qa = Start-Process -FilePath (Join-Path $root 'artifacts/ui-shell-app/FanController.exe') -WorkingDirectory $root -WindowStyle Normal -ArgumentList @('--ui-qa','--qa-width=1180','--qa-height=780','--qa-theme=dark','--qa-page=settings','--qa-pinned=true','--qa-profile=baseline') -PassThru
```

窗口标题为 **FanController · UI 验证（演示）**。初始化到正常窗口、深色、设置页、固定侧栏。QA 资料和实时报告位于 `work/ui-qa/baseline`，报告文件名为 `window-shell-metrics.json`。

正常停止：

```powershell
& (Join-Path $root 'artifacts/ui-shell-app/StopUiQa.exe') $qa.Id
```

助手核对 PID、同目录程序路径和 QA 窗口标题，包括隐藏到托盘的窗口，然后发送 `CinnaFanCon.RequestExit`。退出码 0 表示已退出，2 表示身份或参数不符，3 表示请求未确认，4 表示 30 秒后仍运行。存在草稿确认时在 QA 窗口处理；设置和托盘中的“恢复原设置并退出”也可正常停止。

人工改过主题或固定偏好后，重开时省略初始化覆盖值：

```powershell
$qa = Start-Process -FilePath (Join-Path $root 'artifacts/ui-shell-app/FanController.exe') -WorkingDirectory $root -WindowStyle Normal -ArgumentList @('--ui-qa','--qa-width=1180','--qa-height=780','--qa-page=settings','--qa-profile=baseline') -PassThru
```

## 证据与构建对应

- `artifacts/ui-shell/build-manifest.json` 记录基准提交、工作区源码哈希、共享契约和各运行文件哈希；压缩包内附同一清单。基准提交为 24d63cd，源码包含未提交的本轮修改。
- 最终 FanController.exe SHA-256：`4c77b372b4b707f3faa701414f31dc770c668eff04af3563d950d19faf6bcefc`。
- 最终 ZIP SHA-256：`f1ad0ee21051d789bcabfeef20a33f12ac06ddbe0994df169d4945d4df2b773e`，另附 .sha256。
- `settings-dark.png`、`settings-light.png`、`settings-minimum.png`、`settings-unpinned.png`、`settings-reopened.png` 与对应 metrics JSON 位于 `artifacts/ui-shell`；图片是隔离 WebView 渲染截图。
- `browser-checks.json`、`browser-theme-menu-light.png`、`browser-theme-menu-dark.png`、`browser-sidebar-keyboard.png`、`browser-navigation-drawer.png` 记录浏览器行为。
- `desktop-ui.txt` 和 `core-and-planner.txt` 记录模拟桌面与核心回归。

真实前台窗口的圆角观感、最大化直角、Snap Layouts 悬停弹层、系统菜单、拖动、四边四角物理鼠标缩放和其它 DPI 尚未完成本轮统一验收。Windows 安全提示由用户处理，父任务随后统一验收；本任务没有操作该提示、其它应用窗口或真实风扇。
