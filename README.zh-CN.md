<p align="center"><img src="./docs/brand/cinna-app-icon.png" alt="FanController icon" width="128"></p>

<h1 align="center">FanController</h1>

<p align="center"><a href="./README.md">English</a> · 简体中文</p>

根据温度调节受支持的 CPU、机箱和显卡风扇的 Windows 应用。以日常安静为起点，逐组配置、核对参数后应用，也可以单独设置曲线或固定输出。

[下载 Windows 安装程序](https://github.com/icelemon233/FanController/releases/download/v0.4.3/FanController-v0.4.3-windows-x64-setup.exe) · [便携 ZIP](https://github.com/icelemon233/FanController/releases/tag/v0.4.3) · [从源码构建](./docs/build.md)

<img src="./docs/images/overview.png" alt="FanController 散热概览，使用模拟温度和风扇读数" width="960" />

*演示模式截图，读数均为模拟数据。目前界面为简体中文。*

## 使用

1. 运行 Windows 安装程序，默认创建桌面快捷方式，并在完成页默认勾选“打开 FanController”；两项都可取消。
2. 打开“配置与预览”，按实际接线确认 CPU 和机箱风扇。未确认通道与水泵保留原设置，显卡默认由驱动调节。
3. 逐组修改温度来源、最低输出、曲线和平滑时间。点击“预览应用内容”，核对每组通道与参数，再点击“应用方案”。

编辑和预览不会改变硬件，应用启动时也不会自动接管。应用方案时，未勾选但已接管的风扇会恢复原设置。概览列出实际正在调节的风扇、实测 RPM、当前输出与已应用参数，展开后可查看完整曲线。

安静起点将 CPU 风扇在 50°C 以内保持 40% 输出，机箱风扇在 55°C 以内保持 30%，随后逐步提速，85°C 时全速。已保存的最低输出和自定义参数会保留。CPU 与机箱使用不同平滑时间，减少短暂温度波动引起的变速。显卡保留驱动设置，支持时可以低负载停转。

输出百分比不代表目标 RPM，目前没有自动转速标定。完整曲线、响应时间、保护规则与初调转速建议见[风扇配置说明](./docs/fan-configuration.md)。也可以在“风扇设置”中单独调整某组风扇。

<img src="./docs/images/plan.png" alt="逐组编辑调节方案，使用模拟硬件" width="960" />

最小化后，应用继续在托盘运行。点击主题按钮可切换深浅色界面。首次使用默认为深色，已有主题偏好会保留。

安装程序为当前用户安装应用，并添加 Windows“已安装的应用”记录。更新时确认关闭提示后，安装程序会请求旧版正常退出，等待风扇恢复和服务结束后继续安装。退出失败时会停止，程序文件不会被修改。静默安装和卸载仍需先退出应用。卸载会删除安装的程序文件和快捷方式，保留已保存的风扇配置。安装包目前尚未代码签名。

使用便携版时，完整解压 ZIP 后打开 `FanController.exe`。

## 硬件与运行环境

- Windows 10/11 x64、[.NET Framework 4.8](https://dotnet.microsoft.com/en-us/download/dotnet-framework/net48)。
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。安装程序会检测运行库，缺失时调用微软安装器；这一步需要联网。
- 主板或显卡驱动需提供受支持的风扇控制接口。

读取 CPU 温度和控制主板风扇前，可点击“启用主板访问”。应用通过 [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) 和 [PawnIO](https://pawnio.eu/) 访问主板。未安装 PawnIO 时，设置流程会从官方发布地址下载签名安装器并检查 SHA-256。完成安装和 Windows 授权后，界面会重新连接风扇服务，检测受支持的接口。

AMD 显卡使用已安装驱动的 [ADLX 接口](https://github.com/GPUOpen-LibrariesAndSDKs/ADLX) 调速，NVIDIA 接口由 LibreHardwareMonitor 检测。可用功能取决于硬件和驱动。专用 USB 风扇控制器及 Intel 显卡调速尚未验证。

当前预览版已通过模拟风扇控制和桌面交互测试，尚未验证真实硬件的调速写入。接在同一控制接口上的风扇无法分别调节，使用前请核对硬件的 PWM/DC 模式与转速反馈。

已接管风扇遇到高温或必要温度缺失时，会请求最高输出。退出时会尝试恢复原设置，恢复失败时应用会继续运行。风扇服务与应用断开连接后，也会尝试恢复。强制结束服务、驱动故障或断电可能导致无法恢复。请避免多个程序同时调节同一组风扇。

## 开发

界面使用 React、Ant Design 和 WebView2，独立 C# 服务负责硬件访问。界面资源随应用打包，日常调速无需联网。

源码目录、配置保存位置、旧名称配置迁移及构建测试方法见[开发说明](./docs/build.md)。依赖缓存、构建输出、已保存配置和本机硬件报告均不提交到 Git。

模块边界、原生数据校验、编辑状态及检查命令见[前端架构说明](./docs/frontend-architecture.md)，界面和视觉检查见[设计记录](./docs/design.md)。

第三方组件使用各自的许可证，见[依赖说明](./third-party/THIRD-PARTY-COMPONENTS.txt)。项目自身代码暂未指定许可证。

开发者：Cinna。
