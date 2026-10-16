# cinna-fanCon

English | [简体中文](./README.zh-CN.md)

A Windows desktop application for controlling supported CPU, case and GPU fans. Choose a Quiet, Balanced or Cooling preset, or configure individual fans with fixed output and temperature curves.

[Download the Windows preview](https://github.com/icelemon233/cinna-fanCon/releases/tag/v0.2.1) · [Build from source](./docs/build.md)

<img src="./docs/images/overview.png" alt="cinna-fanCon running in demo mode with synthetic temperatures and fan readings" width="960" />

*The screenshot uses the application's demo mode. The interface is currently in Simplified Chinese.*

## Use the app

1. Download and extract the complete Windows archive, then open `cinna-fanCon.exe`.
2. Select **静音** (Quiet), **均衡** (Balanced) or **强冷** (Cooling), then click **开启智能散热** to start.
3. Change presets while control is active, or choose **恢复原设置** to release the fans.

CPU fans follow CPU temperature. GPU fans follow GPU core temperature. Case fans use the higher CPU/GPU temperature when both are available, otherwise CPU temperature. Fans without the necessary temperature readings, excluded fans and identified pumps are skipped.

The advanced settings page provides individual curves, fixed output, minimum duty and RPM feedback. Preset changes preserve a previously configured higher minimum duty. Fans can be excluded from automatic control. Light and dark themes, live temperatures, RPM readings and tray operation are included.

## Hardware and requirements

- Windows 10/11 x64 and .NET Framework 4.8.
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
- A supported motherboard or GPU with a driver-exposed control interface.

Motherboard access uses [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) and [PawnIO](https://pawnio.eu/). The **启用主板支持** flow downloads the signed PawnIO installer from its official release when needed, checks its SHA-256 and requests Windows authorization for the separate fan worker. The UI remains open.

AMD GPU access uses the installed driver's [ADLX interface](https://github.com/GPUOpen-LibrariesAndSDKs/ADLX). NVIDIA interfaces are enumerated through LibreHardwareMonitor. Support depends on the hardware and driver; dedicated USB fan controllers and Intel GPU fan control are outside the validated scope.

This is a preview. Automated tests cover mock control and the desktop-to-worker interaction; actual fan-speed writes have not yet been validated on physical hardware. Some physical fans share a single control interface. Confirm PWM/DC configuration and RPM feedback for your hardware.

High temperatures or unavailable required readings request maximum output on acquired fans. Normal exit attempts to restore their prior settings. Killing the worker, driver failures or power loss can prevent restoration. Avoid running competing fan controllers at the same time.

## Development

The UI uses React and Ant Design in WebView2, with a separate C# worker for hardware access. Frontend assets are bundled locally. Existing fan profiles from the previous application name can be read and saved under the new name.

See [build and test instructions](./docs/build.md). Downloaded dependencies, build outputs, runtime profiles and private hardware reports are excluded from Git.

Third-party components retain their original licenses; see [third-party notices](./third-party/THIRD-PARTY-COMPONENTS.txt). A license for the project's own code has not been selected.
