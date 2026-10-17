# Interface design

## Application icon — v0.4.1

The approved Cinna artwork in `docs/brand/cinna-app-icon.png` is the source for the executable, native window, tray, installer, shortcuts, sidebar and favicon. The build exports transparent ICO frames from 16 to 256 pixels and copies the original PNG for the frontend. The native window and tray load the embedded ICO; frontend assets use content-based filenames. Packaging checks the source icon hash to reject stale frontend builds.

## Control plans — v0.4.0

The overview replaces the three immediate presets with an editable quiet-first plan. CPU, case, GPU, pump and unidentified roles have distinct defaults. The plan editor places channel selection beside the selected fan’s source, minimum output, smoothing and curve; names and RPM sensor mapping stay in an optional details panel. A separate review lists every channel and exact applied parameters, including restorations. The live overview shows actual running profiles, output and measured RPM.

Both themes and 900-pixel width were inspected with simulated hardware. The native WebView2 smoke test verifies that editing and reviewing perform no fan writes, then checks exact application, restoration and exclusion. These checks do not measure real noise or physical fan behaviour. See [configuration notes](./fan-configuration.md) for research and parameter choices.

以下记录保留旧版本的设计过程；v0.4.0 已用可编辑、需预览后应用的调节方案替换三档即时模式。

## Tray context menu — v0.3.4

The tray's right-click menu keeps the native Windows menu control and the existing open, restore and exit commands. Its renderer uses 36-DIP rows, 14-DIP text, monochrome line icons, inset rounded selection and a separator before exit. Windows 11 supplies the outer rounded frame and shadow through DWM; Windows 10 uses a simple border. The palette follows the Windows app theme on each opening and uses system colours in high contrast. Pixel-sized fonts and native window DPI keep the menu's text and geometry on the same scale. Both palettes, keyboard selection, Enter, Escape and outside-click dismissal were inspected in an isolated preview using the production menu class; the preview callbacks only wrote test logs.

托盘右键菜单保留系统菜单控件及原有的打开、恢复和退出操作。菜单行高为 36 DIP，文字为 14 DIP，配合线条图标、圆角选中背景和退出项前的分隔线。Windows 11 使用系统圆角和阴影，Windows 10 使用细边框。菜单每次打开时读取 Windows 应用主题，高对比度模式使用系统颜色。已在独立预览中检查两种配色、键盘选择、Enter、Esc 和点击外部关闭；预览操作只写入测试日志。

## Main interface — v0.3.0

The interface follows taste-skill's **The well-kept board** direction, seed **239198202**, with the **Night and cornflower** palette and the existing Segoe UI / Microsoft YaHei UI type system. There were no redraws.

The subject inventory was the existing CPU/GPU readings, temperature history, three fan presets, acquired fan count, shared hardware channels, RPM feedback, per-group exclusions, thermal protection and restoration on exit. The design groups the two temperature streams into one reading surface, keeps control state beside them, and presents hardware groups as compact rows. The live interaction is the existing preset selector and per-fan controls; it uses actual telemetry or explicitly labelled demo data.

This is a desktop control interface. The skill's photography and scroll-animation requirements apply to public-facing pages and were waived here. No photographs, stock artwork, video or fabricated interface data were added. Borders remain where they help explain real tables, form fields and the curve plot. Idle panels have no shadows; drawers and notifications retain overlay shadows.

The interface was inspected in a real browser at 1440, 920 and 390 pixels, and in the native WebView2 host. The 390-pixel preview is a supplementary check; the Windows application has its own minimum window size. Both themes, fan settings, the curve editor, setup instructions and help were checked with simulated hardware. The source lint and final browser inspection reported no remaining findings with the three documented allowances: `few-pictures`, `no-footage`, `still-page`.

### Critique

```text
ROUND 1
Seen in one second: the CPU and GPU temperature figures.
Idea: temperature streams and fan ownership form one control board.
Live thing: temperature updates, preset selection and individual fan controls.
Layout words by section: readings=split / modes=control strip / devices=rows.
Scores: design 7.3 · usability 7.2 · creativity 6.5 · content 8.5 → overall 7.2
Caps applied: creativity at most 7; the composition also suits other fan tools.
Top three problems:
1. Selected mode descriptions lacked contrast; use the full text colour.
2. Primary button text lacked contrast in dark mode; use dark ink on blue.
3. The source linter treated explicit shadow resets as shadows; remove the redundant resets and retain flat component tokens.

ROUND 2
Seen in one second: the temperature figures and the control action.
Idea: temperature streams and fan ownership form one control board.
Live thing: the existing controls remain usable, with visible selection and focus.
Layout words by section: readings=split / modes=control strip / devices=rows.
Scores: design 7.8 · usability 8.0 · creativity 6.5 · content 8.5 → overall 7.7
Caps applied: creativity at most 7; marketing-only imagery and motion caps do not apply to this app.
Remaining limitations: hardware-dependent names can truncate; full names remain in individual fan settings. Smaller Windows windows scroll to show the complete device list.

ROUND 3
Seen in one second: the temperature figures and the control action.
Idea and live thing: unchanged from round 2.
Layout words by section: readings=split / modes=control strip / devices=rows.
Scores: design 7.8 · usability 8.2 · creativity 6.5 · content 8.5 → overall 7.7
Caps applied: the same application-specific allowances as round 2.
Fix: native light-theme screenshots exposed faint secondary text in help and device names. Set both Ant Design secondary and description tokens to the palette's readable muted colour, and check both themes again.
Remaining limitations: long hardware names truncate; smaller windows scroll. No new layout issue was found.
```

These are internal critique scores. All published screenshots use Demo CPU, Demo GPU and Demo Motherboard. They contain no personal hardware report. The fan icon is drawn from the app's existing four-blade glyph; it does not stand in for a product photograph. There is no sample content to replace before release.

### 简体中文

界面采用 taste-skill 的 **The well-kept board** 方向，seed 为 **239198202**，配色为 **Night and cornflower**，保留现有系统字体，未重新抽取方向。

CPU 和 GPU 温度放在同一读数区，接管数量与状态放在旁边，模式选择作为主要操作，硬件分组改为紧凑列表。保留 Ant Design 控件及现有操作方式，调整字体、间距、选中状态和深浅色对比度。

这是桌面控制界面，因此没有加入网页用的照片、视频或滚动入场动画。实际表格、表单和曲线图保留必要边界，静态面板不使用阴影。通过浏览器三种宽度及原生 WebView2 检查了概览、主题、风扇设置、曲线、主板设置和帮助页。最终源码与浏览器检查均无剩余问题，豁免项为照片数量、视频和网页滚动动效。

第一轮发现选中模式和深色主题按钮对比度不足，第二轮修正。第三轮又调整了浅色主题中的辅助文字，并核对两种主题的实际颜色。按 skill 的评审表自评为 **7.7/10**；它仍是适用于风扇工具的功能布局，长设备名会截断，较小窗口需要滚动查看全部设备。截图使用模拟硬件，图标来自原有风扇图形，没有外部图片或待替换的示例内容。
