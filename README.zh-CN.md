# cinna-fanCon

[English](./README.md) | 简体中文

根据温度调节受支持的 CPU、机箱和显卡风扇的 Windows 应用。可以选择预设模式，也可以单独设置某组风扇的曲线或固定输出。

[下载 Windows 预览版](https://github.com/icelemon233/cinna-fanCon/releases/tag/v0.2.2) · [从源码构建](./docs/build.md)

<img src="./docs/images/overview.png" alt="cinna-fanCon 散热概览，使用模拟温度和风扇读数" width="960" />

*演示模式截图，读数均为模拟数据。目前界面为简体中文。*

## 使用

1. 完整解压 Windows 压缩包，打开 `cinna-fanCon.exe`。
2. 选择“静音”“均衡”或“强冷”，点击“开启自动调节”。
3. 开启后，点击模式即可切换。点击“恢复原设置”可停止调节风扇。

应用启动时不会自动接管风扇。开启预设模式后，各组风扇按以下温度调节：

| 风扇分组 | 温度来源 |
| --- | --- |
| CPU 风扇 | CPU 的最高有效温度 |
| 显卡风扇 | GPU 核心温度；核心读数缺失时，使用其他有效 GPU 温度 |
| 机箱风扇 | CPU、GPU 都有有效读数时取较高值，否则使用 CPU 温度 |

应用模式时，会跳过缺少必要温度、控制异常、已排除的风扇和已识别的水泵。

在“风扇设置”中，可以修改单组曲线、固定输出、最低输出和转速传感器。输出百分比是控制值，不代表实际转速。主页模式的最低输出为 30%，已保存的更高值会保留。关闭“跟随主页模式”并应用后，该组会恢复原设置，后续切换模式时也会跳过。

最小化后，应用继续在托盘运行。点击主题按钮可切换深浅色界面。

## 硬件与运行环境

- Windows 10/11 x64、.NET Framework 4.8。
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。
- 主板或显卡驱动需提供受支持的风扇控制接口。

读取 CPU 温度和控制主板风扇前，可点击“启用主板访问”。应用通过 [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) 和 [PawnIO](https://pawnio.eu/) 访问主板。未安装 PawnIO 时，设置流程会从官方发布地址下载签名安装器并检查 SHA-256。完成安装和 Windows 授权后，界面会重新连接风扇服务，检测受支持的接口。

AMD 显卡使用已安装驱动的 [ADLX 接口](https://github.com/GPUOpen-LibrariesAndSDKs/ADLX) 调速，NVIDIA 接口由 LibreHardwareMonitor 检测。可用功能取决于硬件和驱动。专用 USB 风扇控制器及 Intel 显卡调速尚未验证。

当前预览版已通过模拟风扇控制和桌面交互测试，尚未验证真实硬件的调速写入。接在同一控制接口上的风扇无法分别调节，使用前请核对硬件的 PWM/DC 模式与转速反馈。

已接管风扇遇到高温或必要温度缺失时，会请求最高输出。退出时会尝试恢复原设置，恢复失败时应用会继续运行。风扇服务与应用断开连接后，也会尝试恢复。强制结束服务、驱动故障或断电可能导致无法恢复。请避免多个程序同时调节同一组风扇。

## 开发

界面使用 React、Ant Design 和 WebView2，独立 C# 服务负责硬件访问。界面资源随应用打包，日常调速无需联网。

源码目录、配置保存位置、旧名称配置迁移及构建测试方法见[开发说明](./docs/build.md)。依赖缓存、构建输出、已保存配置和本机硬件报告均不提交到 Git。

第三方组件使用各自的许可证，见[依赖说明](./third-party/THIRD-PARTY-COMPONENTS.txt)。项目自身代码暂未指定许可证。
