# Frontend architecture

The application keeps React, TypeScript, Vite, pnpm and Ant Design. It is a Windows WebView2 client with two local views and a separate C# worker; it does not need SSR, an account system, a web API cache or a monorepo.

| Module | Responsibility |
| --- | --- |
| `frontend/src/app` | Application assembly, native window navigation, theme and rendering-error recovery |
| `frontend/src/features/fans` | Overview, device view, editor drafts, fan rules and control state |
| `frontend/src/features/fans/api` | Typed fan commands, runtime packet validation, request correlation and transport lifecycle |
| `frontend/src/platform` | Small browser preferences, scheduler and bounded WebView2/window adapters |
| `frontend/src/components` | The fan icon shared by the shell and overview |
| `frontend/tests` | Transport, state, preference and domain tests using Node's test runner |

App assembly can depend on features and platform adapters. Features must not import app assembly. Platform adapters and shared UI must not import app or feature modules. Biome enforces those imports and checks runtime import cycles. TypeScript checks application code, tests and Vite configuration, with strict types, safe indexed access and erasable syntax.

## State and lifecycle

The fan controller owns one latest native snapshot, the connection phase, pending operation, selected mode and the last 60 temperature samples. React subscribes with `useSyncExternalStore`; counts and filtered views are derived from the snapshot. There is no second copy of server profiles in a global UI store.

Each editor session owns its draft. Live readings update the view without reinitializing the draft. Successful replies close only the editor session that submitted them. Failed saves leave the draft open. Concurrent fan commands are rejected before the first asynchronous wait, so rapid clicks cannot create duplicate writes.

Native requests have a session-specific identity and bounded wait. Disposal removes the listener, clears timers and rejects pending waits. Reconnection ignores late initialization and replies from previous sessions. This cancels frontend waits; it does not cancel an operation already received by the worker. Hardware restoration remains the native process's responsibility.

Incoming packets are checked before they become usable state. Missing readings, stale connections, malformed packets and failed initialization have explicit states. A valid new snapshot can recover the connection. `PersistenceError` distinguishes an applied control change from a failed disk save; older replies without that optional field remain supported.

The existing `cinna-fancon-theme` and `cinna-fancon-mode` localStorage keys store only validated enum choices. Missing values use defaults. Invalid values are not overwritten on read. Blocked storage or failed writes produce a warning while the current session remains usable. Fan profiles remain in the C# worker's profile store.

Theme colours and shared CSS variables come from `app/theme.ts`. The existing Ant Design override stylesheet retains targeted `!important` and specificity exceptions. Curve nodes use their fixed position as identity so dragging does not replace the node and lose pointer capture; its array-key lint exception is limited to `CurveEditor.tsx`.

## Build targets

`pnpm --dir frontend dev` uses the explicitly labelled browser demo when there is no native bridge. `pnpm --dir frontend build` produces the native desktop target. A missing bridge in that production build is an error, never an automatic fallback to simulated hardware.

`pnpm --dir frontend build:demo` writes the separate `frontend/dist-demo` output. The desktop build rejects browser demo modules in its bundle. `ui/build-info.json` records the version and target; packaging requires the native target at the current app version.

Overview, device tables, editor, setup and help load through separate feature entries. React and Ant Design use their public imports. Node tests use explicit relative TypeScript extensions; there are no editor-only path aliases.

## Checks

```powershell
pnpm --dir frontend install --frozen-lockfile --ignore-scripts
pnpm --dir frontend check
pnpm --dir frontend build
pnpm --dir frontend build:demo
pwsh -File ./scripts/build.ps1
pwsh -File ./scripts/test.ps1 -Desktop
```

`check` runs type checking, lint and dependency-boundary checks, formatting checks and behavior tests. `build.ps1` runs those checks before compiling the desktop application. The GitHub workflow uses pinned official actions and a read-only token for frontend and Windows core checks; it does not publish releases or access real hardware. Native desktop and installer tests remain separate because they require a Windows desktop session and WebView2 Runtime.

## 简体中文

保留 React、TypeScript、Vite、pnpm 和 Ant Design。`app` 负责组装、窗口导航和主题；`features/fans` 负责页面、表单与风扇状态；`api` 处理类型明确的命令、运行时数据校验及请求生命周期；`platform` 只放存储、计时和 WebView2 适配。没有新增 SSR、全局状态库或多包工作区。

控制器保存一份最新原生快照，通过 `useSyncExternalStore` 订阅。统计按需计算，编辑草稿留在独立会话内。读数刷新不会重置输入，旧提交也不会关闭新打开的设置窗口。命令同步加锁防止重复提交；连接失效时暂停操作，重连后忽略旧会话结果。

原生数据先校验再进入界面。请求超时、订阅和定时器都在生命周期结束时清理。取消的是前端等待，已经发送到原生服务的操作仍由服务处理。控制已生效但配置未保存时会显示警告，并保留编辑草稿。

沿用两项显示偏好的存储键，只读写经过校验的主题与模式值。存储不可用不会阻止使用；风扇配置仍由原生服务保存。主题变量集中维护，现有 Ant Design 样式覆盖和曲线节点身份的 lint 例外均限定在对应文件。

桌面生产构建不会在桥接缺失时伪装成演示设备。浏览器演示输出到独立目录，打包检查构建目标及版本。`check` 覆盖实际源码、测试与 Vite 配置；CI 分别验证前端和 Windows 核心，不接触真实硬件，桌面与安装测试另行在本机运行。
