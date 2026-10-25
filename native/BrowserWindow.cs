using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shell;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;
using Forms=System.Windows.Forms;

namespace CinnaFanCon
{
    public sealed class BrowserWindow : Window
    {
        [DllImport("user32.dll")]private static extern bool ReleaseCapture();
        [DllImport("user32.dll")]private static extern IntPtr SendMessage(IntPtr handle,int message,IntPtr wParam,IntPtr lParam);
        [DllImport("user32.dll",CharSet=CharSet.Unicode)]private static extern IntPtr DefWindowProc(IntPtr handle,int message,IntPtr wParam,IntPtr lParam);
        [DllImport("user32.dll")]private static extern bool TrackMouseEvent(ref MouseTracking value);
        [DllImport("user32.dll")]private static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")]private static extern bool GetCursorPos(out ScreenPoint point);
        [DllImport("user32.dll")]private static extern bool GetWindowRect(IntPtr handle,out ScreenRect bounds);
        [DllImport("user32.dll")]private static extern uint GetDpiForWindow(IntPtr handle);
        [DllImport("user32.dll",CharSet=CharSet.Unicode)]private static extern int RegisterWindowMessage(string name);
        [DllImport("dwmapi.dll")]private static extern int DwmSetWindowAttribute(IntPtr window,int attribute,ref int value,int size);
        [DllImport("dwmapi.dll")]private static extern int DwmGetWindowAttribute(IntPtr window,int attribute,out int value,int size);
        [DllImport("dwmapi.dll",EntryPoint="DwmGetWindowAttribute")]private static extern int DwmGetWindowAttributeRect(IntPtr window,int attribute,out ScreenRect value,int size);
        [DllImport("user32.dll")]private static extern bool ClientToScreen(IntPtr window,ref ScreenPoint point);
        [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]private static extern IntPtr GetWindowLongPtr(IntPtr window,int index);
        [DllImport("user32.dll")]private static extern int GetWindowRgn(IntPtr window,IntPtr region);
        [DllImport("gdi32.dll")]private static extern IntPtr CreateRectRgn(int left,int top,int right,int bottom);
        [DllImport("gdi32.dll")]private static extern bool DeleteObject(IntPtr value);
        [StructLayout(LayoutKind.Sequential)]private struct ScreenPoint {public int X,Y;}
        [StructLayout(LayoutKind.Sequential)]private struct ScreenRect {public int Left,Top,Right,Bottom;}
        [StructLayout(LayoutKind.Sequential)]private struct MouseTracking {public int Size;public uint Flags;public IntPtr Window;public uint HoverTime;}
        private const string Origin="https://cinna-fancon.example";
        private static readonly int RequestExitMessage=RegisterWindowMessage("CinnaFanCon.RequestExit");
        private static readonly int RestoreMessage=RegisterWindowMessage("CinnaFanCon.Restore");
        // Composition hosting keeps child HWNDs from masking the host's
        // non-client hit tests for custom caption buttons and resize borders.
        private readonly WebView2CompositionControl browser=new WebView2CompositionControl();
        private readonly WindowFrameContract frameContract=WindowFrameContract.Load();
        private string captionHover="none";
        private readonly bool demo;
        private readonly bool isolatedQa;
        private readonly UiQaOptions qaLaunch;
        private DispatcherTimer qaMetricsTimer;
        private bool qaReporting;
        private readonly string capturePath,smokeReport;
        private WorkerClient worker;
        private Forms.NotifyIcon tray;
        private System.Drawing.Icon trayIcon;
        private HwndSource windowSource;
        private WindowState restoredState=WindowState.Normal;
        private bool ready,closing,exitRequested,stopPending,captureStarted,setupPending,reconnectPending,verifyTrayExit;
        private bool rememberMotherboard;
        private string closeBehavior="tray";
        private bool darkTheme,trayNoticeShown;
        private bool suppressUiSnapshots;
        private int lastCaptionDown;
        private ScreenPoint lastCaptionPoint;
        private static string MotherboardPreference {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","motherboard-access.enabled");}}
        private static string ThemePreferenceFile {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","theme.preference");}}
        private static string ClosePreferenceFile {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","close.preference");}}
        public int TestExitCode;

        public BrowserWindow(bool demonstration,string capture,string smoke,bool qa=false,UiQaOptions qaOptions=null)
        {
            demo=demonstration;capturePath=capture;smokeReport=smoke;isolatedQa=qa;
            qaLaunch=qa?qaOptions??UiQaOptions.Parse(new[]{"--ui-qa"}):null;
            if(!demo&&capturePath==null)try{if(File.Exists(ClosePreferenceFile)&&File.ReadAllText(ClosePreferenceFile)=="exit")closeBehavior="exit";}catch{ }
            using(var iconStream=OpenAppIcon())
            {
                Icon=BitmapFrame.Create(iconStream,BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.OnLoad);
                Icon.Freeze();
            }
            Title=qa?"FanController · UI 验证（演示）":"FanController";Width=1280;Height=860;MinWidth=920;MinHeight=660;
            if(capture==null){var area=SystemParameters.WorkArea;Width=Math.Min(1280,area.Width-32);Height=Math.Min(860,area.Height-32);MinWidth=Math.Min(920,area.Width-16);MinHeight=Math.Min(660,area.Height-16);}
            if(qaLaunch!=null){Width=qaLaunch.Width??Width;Height=qaLaunch.Height??Height;}
            WindowStyle=WindowStyle.SingleBorderWindow;ResizeMode=ResizeMode.CanResize;WindowStartupLocation=WindowStartupLocation.CenterScreen;
            darkTheme=qaLaunch!=null?qaLaunch.InitialDark(SystemDark()):demo?SystemDark():InitialDarkTheme();
            var initial=darkTheme?Color.FromRgb(27,29,32):Color.FromRgb(255,252,246);
            Background=new SolidColorBrush(initial);
            // A non-empty glass frame makes WindowChrome clear its custom HRGN.
            // Keeping WS_CAPTION/WS_THICKFRAME and no region lets DWM own the
            // real outer corners while WebView2 draws the approved titlebar.
            WindowChrome.SetWindowChrome(this,new WindowChrome {CaptionHeight=0,ResizeBorderThickness=new Thickness(6),GlassFrameThickness=new Thickness(1),UseAeroCaptionButtons=false});
            var border=new System.Windows.Controls.Border {Padding=new Thickness(1),Background=new SolidColorBrush(initial),Child=browser};Content=border;
            browser.DefaultBackgroundColor=System.Drawing.Color.FromArgb(initial.R,initial.G,initial.B);
            Loaded+=async delegate{await Initialize();};
            SourceInitialized+=delegate
            {
                windowSource=HwndSource.FromHwnd(new WindowInteropHelper(this).Handle);
                windowSource.AddHook(OnWindowMessage);
                ApplyTheme(darkTheme?"dark":"light");
            };
            Closing+=OnClosing;
            Closed+=delegate{if(qaMetricsTimer!=null)qaMetricsTimer.Stop();if(verifyTrayExit)File.AppendAllText(smokeReport,"PASS: tray exit closes the host after the simulated worker stops\r\n");};
            if(capturePath==null||smokeReport!=null)
            {
                try
                {
                using(var iconStream=OpenAppIcon())trayIcon=new System.Drawing.Icon(iconStream,Forms.SystemInformation.SmallIconSize);
                tray=new Forms.NotifyIcon {Icon=trayIcon,Text=qa?"FanController · UI 验证（演示）":"FanController",Visible=true};
                var menu=new TrayContextMenu(
                    ()=>Dispatcher.BeginInvoke(new Action(Restore)),
                    ()=>{if(worker!=null)worker.Send(new WireMessage {Type="command",Id="tray-release",Action="release"});},
                    ()=>Dispatcher.BeginInvoke(new Action(RequestExit)));
                menu.SetTheme(darkTheme);tray.ContextMenuStrip=menu;tray.DoubleClick+=delegate{Dispatcher.BeginInvoke(new Action(Restore));};
                }
                catch{if(tray!=null)tray.Dispose();tray=null;if(trayIcon!=null)trayIcon.Dispose();trayIcon=null;}
            }
            StateChanged+=delegate
            {
                if(WindowState!=WindowState.Minimized)restoredState=WindowState;
                Dispatcher.BeginInvoke(new Action(UpdateWindowFramePadding));
                ApplyNativeCorners();
                PostCaptionHover(0);
                PostWindowState();
            };
            if(capturePath!=null){ShowActivated=false;ShowInTaskbar=false;WindowStartupLocation=WindowStartupLocation.Manual;Left=-30000;Top=-30000;}
        }
        private static Stream OpenAppIcon()
        {
            var stream=typeof(BrowserWindow).Assembly.GetManifestResourceStream("CinnaFanCon.AppIcon");
            if(stream==null)throw new InvalidOperationException("应用图标缺失，请重新安装。");
            return stream;
        }
        private void Restore(){if(closing)return;Show();WindowState=restoredState;if(capturePath==null)Activate();}
        private void MinimizeToTray()
        {
            if(tray==null||!tray.Visible)
            {
                Restore();Post(new WireMessage {Type="notice",Message="托盘不可用，窗口已保留。可在设置中选择退出应用。",Success=false});return;
            }
            if(WindowState!=WindowState.Minimized)restoredState=WindowState;
            WindowState=WindowState.Minimized;Hide();
            if(!trayNoticeShown&&capturePath==null&&!demo)
            {
                string marker=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","tray-notice.shown");
                trayNoticeShown=true;
                if(!File.Exists(marker))
                {
                    tray.ShowBalloonTip(5000,"FanController","窗口已进入托盘，风扇继续调节。双击图标可打开，在设置中可更改关闭行为。",Forms.ToolTipIcon.Info);
                    try{Directory.CreateDirectory(Path.GetDirectoryName(marker));File.WriteAllText(marker,"shown");}catch{ }
                }
            }
        }
        private static bool SystemDark()
        {
            try{using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))return key!=null&&Convert.ToInt32(key.GetValue("AppsUseLightTheme",1))==0;}catch{return false;}
        }
        private static bool InitialDarkTheme()
        {
            try
            {
                string preference=File.Exists(ThemePreferenceFile)?File.ReadAllText(ThemePreferenceFile):"system";
                if(preference=="light"||preference=="dark")return preference=="dark";
            }
            catch{ }
            return SystemDark();
        }
        private void ApplyTheme(string mode,string preference=null)
        {
            if(mode!="light"&&mode!="dark")return;
            darkTheme=mode=="dark";
            // Mirror the WebView preference for the native surface before the next WebView starts.
            // The existing localStorage choice stays authoritative after the frontend mounts.
            if(!demo&&capturePath==null&&(preference=="light"||preference=="dark"||preference=="system"))
            {
                try{Directory.CreateDirectory(Path.GetDirectoryName(ThemePreferenceFile));File.WriteAllText(ThemePreferenceFile,preference);}catch{ }
            }
            if(qaLaunch!=null&&(preference=="light"||preference=="dark"||preference=="system"))
            {
                try{Directory.CreateDirectory(qaLaunch.Root);File.WriteAllText(qaLaunch.ThemePath,preference);}catch{ }
            }
            var color=darkTheme?Color.FromRgb(27,29,32):Color.FromRgb(255,252,246);
            Background=new SolidColorBrush(color);
            var border=Content as System.Windows.Controls.Border;
            if(border!=null)border.Background=new SolidColorBrush(darkTheme?Color.FromRgb(59,65,71):Color.FromRgb(228,226,221));
            browser.DefaultBackgroundColor=System.Drawing.Color.FromArgb(color.R,color.G,color.B);
            var menu=tray==null?null:tray.ContextMenuStrip as TrayContextMenu;
            if(menu!=null)menu.SetTheme(darkTheme);
            var handle=new WindowInteropHelper(this).Handle;
            if(handle!=IntPtr.Zero)try{int value=darkTheme?1:0;DwmSetWindowAttribute(handle,20,ref value,sizeof(int));}catch(EntryPointNotFoundException){ }catch(DllNotFoundException){ }
            ApplyNativeCorners();
        }
        private void ApplyNativeCorners()
        {
            var handle=new WindowInteropHelper(this).Handle;
            if(handle==IntPtr.Zero)return;
            try
            {
                int preference=WindowState==WindowState.Maximized?1:2;
                DwmSetWindowAttribute(handle,33,ref preference,sizeof(int));
            }
            catch(EntryPointNotFoundException){ }catch(DllNotFoundException){ }
        }
        private void PostWindowState(){Post(new WireMessage {Type="window-state",Message=WindowState==WindowState.Maximized?"maximized":"normal"});}
        private void UpdateWindowFramePadding()
        {
            var border=Content as System.Windows.Controls.Border;
            if(border==null)return;
            if(WindowState!=WindowState.Maximized){border.Padding=new Thickness(1);return;}
            var handle=new WindowInteropHelper(this).Handle;ScreenRect bounds;
            var source=PresentationSource.FromVisual(this);
            if(handle==IntPtr.Zero||source==null||source.CompositionTarget==null||!GetWindowRect(handle,out bounds))return;
            var area=Forms.Screen.FromHandle(handle).WorkingArea;
            var scale=source.CompositionTarget.TransformFromDevice;
            border.Padding=new Thickness(Math.Max(1,(area.Left-bounds.Left)*scale.M11),Math.Max(1,(area.Top-bounds.Top)*scale.M22),Math.Max(1,(bounds.Right-area.Right)*scale.M11),Math.Max(1,(bounds.Bottom-area.Bottom)*scale.M22));
        }
        private void RequestExit(){exitRequested=true;Close();}
        private IntPtr OnWindowMessage(IntPtr handle,int message,IntPtr wParam,IntPtr lParam,ref bool handled)
        {
            if(message==0x0084)
            {
                int hit=HitTestHeader(lParam);
                if(hit!=0){handled=true;return new IntPtr(hit);}
            }
            if(message==0x00A0)
            {
                PostCaptionHover(wParam.ToInt32());
                var tracking=new MouseTracking {Size=Marshal.SizeOf(typeof(MouseTracking)),Flags=0x12,Window=handle};
                TrackMouseEvent(ref tracking);
            }
            if(message==0x02A2||message==0x0200||message==0x001F)PostCaptionHover(0);
            if(message==0x00A1&&(wParam.ToInt32()==8||wParam.ToInt32()==9||wParam.ToInt32()==20))
            {
                // Let the standard NC button tracker issue minimize/maximize/
                // close system commands. Closing still goes through OnClosing.
                handled=true;return DefWindowProc(handle,message,wParam,lParam);
            }
            if(message==0x02E0&&WindowState==WindowState.Maximized)Dispatcher.BeginInvoke(new Action(UpdateWindowFramePadding));
            if(message==0x031E)Dispatcher.BeginInvoke(new Action(ApplyNativeCorners));
            if(RestoreMessage!=0&&message==RestoreMessage&&capturePath==null&&!isolatedQa)
            {
                handled=true;Dispatcher.BeginInvoke(new Action(Restore));return new IntPtr(1);
            }
            if(RequestExitMessage!=0&&message==RequestExitMessage)
            {
                handled=true;Dispatcher.BeginInvoke(new Action(RequestExit));return new IntPtr(1);
            }
            return IntPtr.Zero;
        }
        private int HitTestHeader(IntPtr coordinates)
        {
            if(WindowState==WindowState.Minimized||browser.ActualWidth<=0)return 0;
            int x=unchecked((short)(coordinates.ToInt64()&0xffff));
            int y=unchecked((short)((coordinates.ToInt64()>>16)&0xffff));
            if(WindowState!=WindowState.Maximized)
            {
                ScreenRect bounds;
                var handle=new WindowInteropHelper(this).Handle;
                if(GetWindowRect(handle,out bounds))
                {
                    double border=6.0*GetDpiForWindow(handle)/96;
                    if(x<bounds.Left+border||x>=bounds.Right-border||y<bounds.Top+border||y>=bounds.Bottom-border)return 0;
                }
            }
            var point=browser.PointFromScreen(new Point(x,y));
            double zoom=browser.ZoomFactor,width=browser.ActualWidth,button=frameContract.Titlebar.CaptionWidth*zoom;
            if(point.Y<0||point.Y>=frameContract.Titlebar.Height*zoom||point.X<0||point.X>=width)return 0;
            if(point.X>=width-button)return 20;
            if(point.X>=width-2*button)return 9;
            if(point.X>=width-3*button)return 8;
            return 2;
        }
        private void PostCaptionHover(int hit)
        {
            string value=hit==8?"minimize":hit==9?"maximize":hit==20?"close":"none";
            if(value==captionHover)return;
            captionHover=value;Post(new WireMessage {Type="caption-hover",Message=value});
        }
        private void BeginWindowDrag()
        {
            int primaryButton=Forms.SystemInformation.MouseButtonsSwapped?0x02:0x01;
            if(closing||WindowState==WindowState.Minimized||(GetAsyncKeyState(primaryButton)&0x8000)==0)return;
            ScreenPoint point;if(!GetCursorPos(out point))return;
            int tick=Environment.TickCount;
            var size=Forms.SystemInformation.DoubleClickSize;
            if(lastCaptionDown!=0&&unchecked(tick-lastCaptionDown)<=Forms.SystemInformation.DoubleClickTime&&Math.Abs(point.X-lastCaptionPoint.X)<size.Width&&Math.Abs(point.Y-lastCaptionPoint.Y)<size.Height)
            {
                lastCaptionDown=0;WindowState=WindowState==WindowState.Maximized?WindowState.Normal:WindowState.Maximized;return;
            }
            lastCaptionDown=tick;lastCaptionPoint=point;
            int coordinates=(point.X&0xffff)|((point.Y&0xffff)<<16);
            ReleaseCapture();SendMessage(new WindowInteropHelper(this).Handle,0xA1,new IntPtr(2),new IntPtr(coordinates));
        }
        private async Task Initialize()
        {
            try
            {
                string ui=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ui");
                if(!File.Exists(Path.Combine(ui,"index.html")))throw new FileNotFoundException("界面文件缺失，请完整解压 FanController 压缩包。");
                string cache=qaLaunch!=null?qaLaunch.Cache:capturePath==null?Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","webview-v2"):Path.Combine(Environment.CurrentDirectory,"work","webview-v2-capture");
                var environment=await CoreWebView2Environment.CreateAsync(null,cache);
                await browser.EnsureCoreWebView2Async(environment);
                var core=browser.CoreWebView2;
                core.Settings.AreHostObjectsAllowed=false;core.Settings.AreDevToolsEnabled=false;
                core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreDefaultScriptDialogsEnabled=false;core.Settings.IsStatusBarEnabled=false;core.Settings.IsZoomControlEnabled=false;
                try{core.Settings.IsNonClientRegionSupportEnabled=true;}catch(NotImplementedException){ }
                core.SetVirtualHostNameToFolderMapping("cinna-fancon.example",ui,CoreWebView2HostResourceAccessKind.DenyCors);
                core.NavigationStarting+=delegate(object s,CoreWebView2NavigationStartingEventArgs e){if(!Trusted(e.Uri))e.Cancel=true;};
                core.FrameNavigationStarting+=delegate(object s,CoreWebView2NavigationStartingEventArgs e){e.Cancel=true;};
                core.NewWindowRequested+=delegate(object s,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;};
                core.PermissionRequested+=delegate(object s,CoreWebView2PermissionRequestedEventArgs e){e.State=CoreWebView2PermissionState.Deny;};
                core.WebMessageReceived+=OnMessage;
                if(qaLaunch!=null)
                {
                    await core.AddScriptToExecuteOnDocumentCreatedAsync(qaLaunch.BootstrapScript());
                    qaMetricsTimer=new DispatcherTimer {Interval=TimeSpan.FromSeconds(1)};
                    qaMetricsTimer.Tick+=async delegate{await WriteQaMetrics();};qaMetricsTimer.Start();
                }
                else if(smokeReport!=null)
                    await core.AddScriptToExecuteOnDocumentCreatedAsync("localStorage.setItem('cinna-fancon-navigation','expanded');");
                core.Navigate(Origin+"/index.html");
                bool preferred=!demo&&capturePath==null&&File.Exists(MotherboardPreference);
                if(smokeReport!=null){ /* The ready handshake captures the initial loading UI before starting its demo worker. */ }
                else if(preferred)
                {
                    try{StartWorker(true);}catch{if(worker!=null)worker.Dispose();StartWorker(false);}
                }
                else StartWorker(false);
                if(capturePath!=null)
                {
                    await Task.Delay(25000);
                    if(!captureStarted && !closing)FailCapture(new TimeoutException("桌面界面在 25 秒内未就绪。"));
                }
            }
            catch(Exception e)
            {
                if(capturePath!=null){FailCapture(e);return;}
                MessageBox.Show(this,"界面启动失败："+e.Message+"\n\n请确认已安装 Microsoft Edge WebView2 Runtime，并完整解压了应用文件。","FanController",MessageBoxButton.OK,MessageBoxImage.Error);RequestExit();
            }
        }
        private async Task WriteQaMetrics()
        {
            if(qaLaunch==null||qaReporting||!ready||closing||browser.CoreWebView2==null)return;
            qaReporting=true;
            try
            {
                string layout=await browser.CoreWebView2.ExecuteScriptAsync(@"(()=>{
                    const bounds=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
                    const rect=selector=>bounds(document.querySelector(selector));
                    const font=selector=>{const node=document.querySelector(selector);if(!node)return null;const s=getComputedStyle(node);return {size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight};};
                    const icon=selector=>{const node=document.querySelector(selector);if(!node)return null;const s=getComputedStyle(node),p=getComputedStyle(node.parentElement);return {bounds:bounds(node),color:s.color,stroke:s.stroke,strokeWidth:s.strokeWidth,opacity:s.opacity,containerColor:p.color,containerOpacity:p.opacity};};
                    return {
                        devicePixelRatio:window.devicePixelRatio,
                        theme:document.documentElement.dataset.theme,
                        viewport:{width:innerWidth,height:innerHeight},
                        header:rect('.app-header'),brandIcon:rect('.brand-image'),brandName:rect('.brand-name'),brandFont:font('.brand-name'),
                        captions:[...document.querySelectorAll('.window-actions button')].map(node=>({label:node.getAttribute('aria-label'),bounds:bounds(node),glyph:bounds(node.querySelector('.window-glyph'))})),
                        toolbar:rect('.content-toolbar'),pageTitle:rect('.toolbar-leading h2'),pageTitleFont:font('.toolbar-leading h2'),status:rect('.connection-status'),statusDot:rect('.status-dot'),
                        sidebar:rect('.app-sidebar'),rail:rect('.sidebar-rail'),sidebarExpanded:document.querySelector('.app-sidebar')?.dataset.expanded,sidebarPinned:document.querySelector('.app-sidebar')?.dataset.pinned,
                        navigation:[...document.querySelectorAll('.app-sidebar .navigation-item')].map(node=>({label:node.getAttribute('aria-label'),bounds:bounds(node),icon:bounds(node.querySelector('.navigation-icon svg')),font:{size:getComputedStyle(node).fontSize,weight:getComputedStyle(node).fontWeight}})),
                        footer:rect('.app-sidebar .sidebar-footer'),settings:rect('.app-sidebar .sidebar-footer .navigation-item'),pin:rect('.app-sidebar .sidebar-pin'),
                        content:rect('.main-content'),settingsPage:rect('.settings-page'),sectionTitleFont:font('.settings-section h4'),
                        themeField:rect('[data-testid=theme-select]'),closeField:rect('[data-testid=close-select]'),
                        selectIcons:{themePrefix:icon('[data-testid=theme-select] .ant-select-prefix svg'),themeSuffix:icon('[data-testid=theme-select] .ant-select-suffix svg'),closeSuffix:icon('[data-testid=close-select] .ant-select-suffix svg')},
                        menu:[...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')].map(node=>({text:node.textContent,bounds:bounds(node),font:{size:getComputedStyle(node).fontSize,weight:getComputedStyle(node).fontWeight}}))
                    };
                })()");
                var handle=new WindowInteropHelper(this).Handle;
                ScreenRect area;GetWindowRect(handle,out area);
                ScreenRect visibleArea;int visibleResult=DwmGetWindowAttributeRect(handle,9,out visibleArea,Marshal.SizeOf(typeof(ScreenRect)));
                var clientOrigin=new ScreenPoint();bool clientOriginValid=ClientToScreen(handle,ref clientOrigin);
                var browserOrigin=browser.PointToScreen(new Point(0,0));
                var browserOffset=browser.TranslatePoint(new Point(0,0),this);
                var hostBorder=Content as System.Windows.Controls.Border;
                var hostPadding=hostBorder==null?new Thickness():hostBorder.Padding;
                uint dpi=GetDpiForWindow(handle);
                int corner;int cornerResult=DwmGetWindowAttribute(handle,33,out corner,sizeof(int));
                uint style=unchecked((uint)GetWindowLongPtr(handle,-16).ToInt64());
                uint extended=unchecked((uint)GetWindowLongPtr(handle,-20).ToInt64());
                var headerHits=new int[3];
                for(int index=0;index<3;index++)
                {
                    var point=browser.PointToScreen(new Point(browser.ActualWidth-(2.5-index)*frameContract.Titlebar.CaptionWidth*browser.ZoomFactor,frameContract.Titlebar.Height*browser.ZoomFactor/2));
                    int packed=(unchecked((int)point.X)&0xffff)|((unchecked((int)point.Y)&0xffff)<<16);
                    headerHits[index]=SendMessage(handle,0x0084,IntPtr.Zero,new IntPtr(packed)).ToInt32();
                }
                var edgePoints=new[]{
                    new ScreenPoint {X=area.Left+1,Y=(area.Top+area.Bottom)/2},
                    new ScreenPoint {X=area.Right-2,Y=(area.Top+area.Bottom)/2},
                    new ScreenPoint {X=(area.Left+area.Right)/2,Y=area.Top+1},
                    new ScreenPoint {X=(area.Left+area.Right)/2,Y=area.Bottom-2},
                    new ScreenPoint {X=area.Left+1,Y=area.Top+1},
                    new ScreenPoint {X=area.Right-2,Y=area.Top+1},
                    new ScreenPoint {X=area.Left+1,Y=area.Bottom-2},
                    new ScreenPoint {X=area.Right-2,Y=area.Bottom-2}
                };
                var edgeHits=new int[edgePoints.Length];
                for(int index=0;index<edgePoints.Length;index++)
                {
                    var point=edgePoints[index];
                    int packed=(point.X&0xffff)|((point.Y&0xffff)<<16);
                    edgeHits[index]=SendMessage(handle,0x0084,IntPtr.Zero,new IntPtr(packed)).ToInt32();
                }
                var region=CreateRectRgn(0,0,0,0);
                int regionType;
                try{regionType=GetWindowRgn(handle,region);}finally{DeleteObject(region);}
                string report=@"{""processId"":"+Process.GetCurrentProcess().Id+
                    @",""windowHandle"":"+handle.ToInt64()+@",""nativeDpi"":"+dpi+
                    @",""windowState"":"""+WindowState+@""",""style"":""0x"+style.ToString("X8")+
                    @""",""extendedStyle"":""0x"+extended.ToString("X8")+
                    @""",""hasCaption"":"+((style&0x00C00000)==0x00C00000?"true":"false")+
                    @",""hasResizeFrame"":"+((style&0x00040000)!=0?"true":"false")+
                    @",""layered"":"+((extended&0x00080000)!=0?"true":"false")+
                    @",""windowRegionType"":"+regionType+@",""dwmCornerResult"":"+cornerResult+
                    @",""dwmCornerPreference"":"+corner+@",""webViewZoomFactor"":"+browser.ZoomFactor.ToString(CultureInfo.InvariantCulture)+
                    @",""captionHitTests"":["+string.Join(",",headerHits)+@"],""edgeHitTests"":["+string.Join(",",edgeHits)+@"],""captionHover"":"""+captionHover+@""""+
                    @",""extendedFrameBoundsResult"":"+visibleResult+
                    @",""visibleFrameBoundsPx"":{""x"":"+visibleArea.Left+@",""y"":"+visibleArea.Top+@",""width"":"+(visibleArea.Right-visibleArea.Left)+@",""height"":"+(visibleArea.Bottom-visibleArea.Top)+
                    @"},""clientOriginValid"":"+(clientOriginValid?"true":"false")+@",""clientOriginPx"":{""x"":"+clientOrigin.X+@",""y"":"+clientOrigin.Y+
                    @"},""webViewOriginPx"":{""x"":"+browserOrigin.X.ToString(CultureInfo.InvariantCulture)+@",""y"":"+browserOrigin.Y.ToString(CultureInfo.InvariantCulture)+
                    @"},""webViewOffsetDip"":{""x"":"+browserOffset.X.ToString(CultureInfo.InvariantCulture)+@",""y"":"+browserOffset.Y.ToString(CultureInfo.InvariantCulture)+
                    @"},""hostPaddingDip"":{""left"":"+hostPadding.Left.ToString(CultureInfo.InvariantCulture)+@",""top"":"+hostPadding.Top.ToString(CultureInfo.InvariantCulture)+@",""right"":"+hostPadding.Right.ToString(CultureInfo.InvariantCulture)+@",""bottom"":"+hostPadding.Bottom.ToString(CultureInfo.InvariantCulture)+
                    "}"+
                    @",""windowBoundsPx"":{""x"":"+area.Left+@",""y"":"+area.Top+@",""width"":"+(area.Right-area.Left)+@",""height"":"+(area.Bottom-area.Top)+
                    @"},""wpfWidthDip"":"+ActualWidth.ToString(CultureInfo.InvariantCulture)+@",""wpfHeightDip"":"+ActualHeight.ToString(CultureInfo.InvariantCulture)+
                    @",""layout"":"+layout+"}";
                Directory.CreateDirectory(qaLaunch.Root);
                File.WriteAllText(qaLaunch.MetricsPath,report,new UTF8Encoding(false));
            }
            catch(Exception error)
            {
                try{Directory.CreateDirectory(qaLaunch.Root);File.WriteAllText(qaLaunch.MetricsPath+".error.txt",error.ToString());}catch{ }
            }
            finally{qaReporting=false;}
        }
        private static bool Trusted(string address)
        {
            Uri uri;return Uri.TryCreate(address,UriKind.Absolute,out uri)&&uri.GetLeftPart(UriPartial.Authority)==Origin&&uri.AbsolutePath=="/index.html";
        }
        private void Post(WireMessage message)
        {
            if(!ready||browser.CoreWebView2==null||!Trusted(browser.Source==null?null:browser.Source.ToString()))return;
            browser.CoreWebView2.PostWebMessageAsJson(Wire.Encode(message));
        }
        private void Reply(string id,string text,bool success){Post(new WireMessage {Type="reply",Id=id,Message=text,Success=success});}
        private void StartWorker(bool elevated)
        {
            var client=new WorkerClient();worker=client;
            client.Received+=message=>Dispatcher.BeginInvoke(new Action(async delegate
            {
                if(closing||worker!=client)return;
                if(suppressUiSnapshots&&message.Type=="snapshot")return;
                if(message.Type=="service-error"&&reconnectPending)return;
                Post(message);
                if(rememberMotherboard&&message.Type=="snapshot"&&message.Snapshot.Administrator&&message.Snapshot.PawnIoInstalled)
                {
                    try{Directory.CreateDirectory(Path.GetDirectoryName(MotherboardPreference));File.WriteAllText(MotherboardPreference,"enabled");}catch{ }
                    rememberMotherboard=false;
                }
                if(message.Type=="snapshot"&&ready&&capturePath!=null&&!captureStarted){captureStarted=true;await CaptureAndTest();}
            }));
            client.Start(elevated,demo);
        }
        private async Task ConnectWorker(string id,bool reconnect)
        {
            if(reconnectPending||setupPending||stopPending){Reply(id,"正在处理风扇服务，请等待当前操作完成。",false);return;}
            reconnectPending=true;
            try
            {
                bool restarted=false;
                var current=worker;
                WireMessage frame=null;
                if(current!=null)
                {
                    try{frame=await current.WaitForSnapshotAsync(reconnect?3500:12000,reconnect);}
                    catch{if(!reconnect)throw;}
                }
                if(frame==null)
                {
                    bool elevated=!demo&&((current!=null&&current.Elevated)||File.Exists(MotherboardPreference));
                    if(current!=null)
                    {
                        if(!await current.StopAsync())throw new InvalidOperationException("旧风扇服务尚未完成恢复和退出，已停止重连以避免两个服务同时调节。请稍后重试；不会强制结束服务。");
                        current.Dispose();if(worker==current)worker=null;
                    }
                    StartWorker(elevated);restarted=current!=null||reconnect;
                    frame=await worker.WaitForSnapshotAsync(15000,false);
                }
                Post(frame);
                Reply(id,restarted?"风扇服务已重新启动，已收到新读数。配置已保留，请核对风扇状态后重新应用设置。":"已连接风扇服务，已收到新读数。",true);
                if(restarted)Post(new WireMessage {Type="notice",Message="风扇服务已重新启动。请核对温度和转速后重新应用设置；异常退出前的恢复结果无法确认。",Success=true});
            }
            catch(Exception error){Reply(id,error.Message,false);}
            finally{reconnectPending=false;}
        }
        private async void OnMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e)
        {
            if(!Trusted(e.Source))return;
            WireMessage command;
            try{command=Wire.Decode(e.WebMessageAsJson);if(command==null||command.Type!="command")return;}
            catch{return;}
            try
            {
                if(command.Action=="ready")
                {
                    ready=true;
                    if(smokeReport!=null)
                    {
                        await WaitForUi("!!document.querySelector('.page-loading')","The initial loading layout was not shown.");
                        await CaptureUiImage("desktop-loading.png");
                    }
                    await ConnectWorker(command.Id,false);
                    PostWindowState();
                    if(capturePath!=null&&!captureStarted&&worker!=null&&worker.Connected&&worker.Latest!=null)
                    {captureStarted=true;await CaptureAndTest();}
                }
                else if(command.Action=="reconnect")await ConnectWorker(command.Id,true);
                else if(command.Action=="minimize")WindowState=WindowState.Minimized;
                else if(command.Action=="maximize")WindowState=WindowState==WindowState.Maximized?WindowState.Normal:WindowState.Maximized;
                else if(command.Action=="close")Close();
                else if(command.Action=="exit")RequestExit();
                else if(command.Action=="drag")BeginWindowDrag();
                else if(command.Action=="theme")ApplyTheme(command.Message,command.Mode);
                else if(command.Action=="closeBehavior"&&(command.Message=="tray"||command.Message=="exit"))
                {
                    closeBehavior=command.Message;
                    if(!demo&&capturePath==null)try{Directory.CreateDirectory(Path.GetDirectoryName(ClosePreferenceFile));File.WriteAllText(ClosePreferenceFile,closeBehavior);}catch{ }
                }
                else if(command.Action=="enableMotherboard")
                {
                    if(reconnectPending){Reply(command.Id,"正在重新连接风扇服务，请等待完成。",false);return;}
                    await EnableMotherboard(command.Id);
                }
                else if(command.Action=="smart"||command.Action=="plan"||command.Action=="release"||command.Action=="apply"||command.Action=="rescan")
                {
                    if(setupPending||reconnectPending){Reply(command.Id,"正在连接或设置风扇服务，请等待完成。",false);return;}
                    if(worker==null||!worker.Send(command))Reply(command.Id,"尚未连接风扇服务，请稍后再试。",false);
                }
                else Reply(command.Id,"不支持此操作。",false);
            }
            catch(Exception error){Reply(command.Id,error.Message,false);}
        }
        private async Task EnableMotherboard(string id)
        {
            if(demo){Reply(id,"演示模式使用模拟风扇，无需安装硬件组件。",true);return;}
            if(setupPending){Reply(id,"正在设置主板访问，请等待安装和授权完成。",false);return;}
            setupPending=true;
            try
            {
                bool installed=worker!=null&&worker.Latest!=null&&worker.Latest.Snapshot.PawnIoInstalled;
                if(!installed)
                {
                    string path=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"hardware","PawnIO_setup.exe");
                    if(!File.Exists(path))
                    {
                        string folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","installers");
                        Directory.CreateDirectory(folder);path=Path.Combine(folder,"PawnIO_setup-2.2.0.exe");
                        if(!File.Exists(path))
                        {
                            string temporary=path+".download";
                            using(var download=new WebClient())await download.DownloadFileTaskAsync(new Uri("https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe"),temporary);
                            File.Move(temporary,path);
                        }
                    }
                    string hash;using(var stream=File.OpenRead(path))using(var sha=SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","");
                    if(hash!="1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032")
                    {
                        string cache=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","installers");
                        if(String.Equals(Path.GetDirectoryName(path),cache,StringComparison.OrdinalIgnoreCase))File.Delete(path);
                        throw new InvalidDataException("下载的硬件组件未通过校验，已停止安装。请重新开始主板访问设置。");
                    }
                    using(var installer=Process.Start(new ProcessStartInfo(path){UseShellExecute=true,Verb="runas"}))await Task.Run(()=>installer.WaitForExit());
                    using(var key=Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO"))
                        if(key==null)throw new InvalidOperationException("未检测到 PawnIO。请完成安装后，重新设置主板访问。当前风扇控制仍在运行。");
                }
                if(worker!=null)
                {
                    if(!await worker.StopAsync())throw new InvalidOperationException("尚未完成风扇恢复，请稍后重试主板访问设置。");
                    worker.Dispose();worker=null;
                }
                try{rememberMotherboard=true;StartWorker(true);Reply(id,"已启动风扇服务，正在检测主板风扇。",true);}
                catch{rememberMotherboard=false;StartWorker(false);throw;}
            }
            finally{setupPending=false;}
        }
        private async Task VerifyWindowDragRouting()
        {
            string result=await browser.CoreWebView2.ExecuteScriptAsync(@"(()=>{
                const port=window.chrome.webview,original=port.postMessage,actions=[];
                const windowActions=['drag','minimize','maximize','close'];
                const intercept=message=>{if(windowActions.includes(message.Action))actions.push(message.Action);else original.call(port,message);};
                const check=(value,message)=>{if(!value)throw new Error(message);};
                const down=(target,button=0,isPrimary=true)=>{
                    check(target,'A window control or drag target is missing.');
                    const event=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button,isPrimary,pointerType:'mouse'});
                    target.dispatchEvent(event);return event.defaultPrevented;
                };
                const control=name=>document.querySelector('[aria-label='+JSON.stringify(name)+']');
                try{
                    port.postMessage=intercept;check(port.postMessage===intercept,'Could not observe window actions.');
                    const header=document.querySelector('.app-header').getBoundingClientRect();
                    const padding=document.elementFromPoint(header.left+380,header.top+20);
                    for(const [target,label] of [[padding,'Titlebar whitespace'],[document.querySelector('.brand-image'),'Application icon'],[document.querySelector('.brand-name'),'Application name']]){
                        actions.length=0;check(down(target)&&actions.length===1&&actions[0]==='drag',label+' did not start a window drag.');
                    }
                    actions.length=0;down(padding,2);down(padding,1);down(padding,0,false);
                    check(actions.length===0,'Secondary or non-primary pointer input started a drag.');
                    for(const target of [control('最小化'),document.querySelector('[data-testid=window-maximize]'),control('关闭窗口'),document.querySelector('[data-testid=app-settings]'),document.querySelector('[data-testid=advanced-menu]'),document.querySelector('[data-testid=sidebar-pin]')])down(target.querySelector('svg path')||target);
                    check(actions.length===0,'An interactive control started a window drag.');
                    for(const [label,action] of [['最小化','minimize'],['最大化窗口','maximize'],['关闭窗口','close']]){
                        control(label).click();check(actions.pop()===action,'A window control lost its click action.');
                    }
                    return true;
                }catch(error){return error.message;}finally{port.postMessage=original;}
            })()");
            if(result!="true")throw new Exception("Window drag routing regression: "+result);
        }
        private async Task WaitForUi(string condition,string failure)
        {
            for(int i=0;i<50;i++)
            {
                if(await browser.CoreWebView2.ExecuteScriptAsync(condition)=="true")return;
                await Task.Delay(100);
            }
            throw new Exception(failure);
        }
        private async Task SelectTheme(string mode)
        {
            await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=app-settings]').click()");
            await WaitForUi("!!document.querySelector('[data-testid=theme-select]')","Appearance settings did not load.");
            await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=theme-select]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}))");
            await WaitForUi("!!document.querySelector('[data-testid=theme-"+mode+"]')","The theme dropdown did not open.");
            await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=theme-"+mode+"]').click()");
            await WaitForUi("document.querySelector('.app-layout').dataset.theme==='"+mode+"'","The chosen theme did not apply.");
            await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=home-menu]').click()");
            await WaitForUi("!!document.querySelector('[data-testid=configure-plan]')","Overview did not load after choosing a theme.");
        }
        private async Task CaptureUiImage(string name)
        {
            // Wait for the 180 ms UI transition before capturing its final layout.
            await Task.Delay(220);
            using(var stream=File.Create(Path.Combine(Path.GetDirectoryName(capturePath),name)))await browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
        }
        private async Task CaptureUiStates()
        {
            if(!demo||smokeReport==null)throw new InvalidOperationException("UI state fixtures require the simulated desktop smoke test.");
            suppressUiSnapshots=true;
            try
            {
                var empty=Wire.Decode(Wire.Encode(worker.Latest));
                empty.Snapshot.Time=DateTime.UtcNow;empty.Snapshot.Channels.Clear();empty.Snapshot.Sensors.Clear();empty.Profiles.Clear();empty.Recommendations.Clear();Post(empty);
                await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=advanced-menu]').click()");
                await WaitForUi("document.body.textContent.includes('未检测到可控风扇')","The empty device state was not shown.");
                await CaptureUiImage("desktop-empty.png");
                Post(new WireMessage {Type="service-error",Message="界面验证：模拟风扇服务断开，未访问真实设备。"});
                await WaitForUi("!!document.querySelector('[data-testid=connection-notice]')","The connection failure was not shown.");
                await CaptureUiImage("desktop-error.png");
                var longNames=Wire.Decode(Wire.Encode(worker.Latest));longNames.Snapshot.Time=DateTime.UtcNow;
                longNames.Snapshot.Cpu="演示处理器 · 多核心温度与散热风扇监测设备（长型号布局验证）";
                longNames.Snapshot.Gpu="演示显卡 · 双风扇独立调节与热点温度传感器（长设备型号布局验证）";
                longNames.Snapshot.Board="演示主板 · 多接口温度监测与机箱进排风控制器（长设备名称布局验证）";
                foreach(var channel in longNames.Snapshot.Channels)channel.Device=channel.Group=="GPU"?longNames.Snapshot.Gpu:longNames.Snapshot.Board;
                Post(longNames);
                await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=home-menu]').click()");
                await WaitForUi("document.body.textContent.includes('长设备名称布局验证')&&!document.querySelector('[data-testid=connection-notice]')","The long hardware names were not shown.");
                await CaptureUiImage("desktop-long-names.png");
            }
            finally{suppressUiSnapshots=false;Post(worker.Latest);}
        }
        private async Task VerifyTrayLifecycle()
        {
            if(!demo||smokeReport==null||tray==null)throw new InvalidOperationException("托盘测试只能在演示模式运行。");
            var owned=worker.Latest.Snapshot.Channels.Where(c=>c.Owned).Select(c=>c.Id).OrderBy(id=>id).ToArray();
            if(owned.Length==0)throw new Exception("Tray lifecycle test requires active simulated fan control.");
            DateTime before=worker.Latest.Snapshot.Time;
            await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"关闭窗口\"]').click()");
            await Task.Delay(1400);
            if(IsVisible||closing||exitRequested||stopPending||!tray.Visible)throw new Exception("Closing the window did not leave the app in the tray.");
            if(worker.Latest.Snapshot.Time<=before||!owned.SequenceEqual(worker.Latest.Snapshot.Channels.Where(c=>c.Owned).Select(c=>c.Id).OrderBy(id=>id)))throw new Exception("Closing the window interrupted simulated fan control or telemetry.");
            tray.ContextMenuStrip.Items["tray-open"].PerformClick();await Task.Delay(150);
            if(!IsVisible||WindowState!=WindowState.Normal)throw new Exception("The tray could not restore the closed window.");
            // Alt+F4 and the taskbar's Close command also reach WPF Closing.
            SendMessage(new WindowInteropHelper(this).Handle,0x0010,IntPtr.Zero,IntPtr.Zero);
            if(IsVisible||closing||stopPending)throw new Exception("Native window close exited instead of hiding to the tray.");
            tray.ContextMenuStrip.Items["tray-open"].PerformClick();await Task.Delay(150);
            await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"最小化\"]').click()");await Task.Delay(150);
            if(!IsVisible||WindowState!=WindowState.Minimized||closing||stopPending)throw new Exception("Minimizing did not preserve the visible taskbar window.");
            tray.ContextMenuStrip.Items["tray-open"].PerformClick();await Task.Delay(150);
            if(!IsVisible)throw new Exception("The tray could not restore the minimized window.");
        }
        private async Task CaptureAndTest()
        {
            try
            {
                await Task.Delay(900);
                if(smokeReport!=null)
                {
                    if(!demo)throw new InvalidOperationException("界面操作测试只能在演示模式运行。");
                    if(await browser.CoreWebView2.ExecuteScriptAsync("document.body.textContent.includes('风扇服务已重新启动')")=="true")throw new Exception("The initial worker connection was incorrectly reported as a restart.");
                    await VerifyWindowDragRouting();
                    await SelectTheme("light");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=configure-plan]').click()");
                    await WaitForUi("!!document.querySelector('[data-testid=review-plan]')","Plan editor did not load.");
                    await CaptureUiImage("desktop-plan.png");
                    await browser.CoreWebView2.ExecuteScriptAsync("(()=>{const input=document.querySelector('[aria-label=\"方案最低输出\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'42');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();})()");
                    await Task.Delay(1400);
                    if(worker.Latest.Snapshot.Channels.Any(c=>c.Owned))throw new Exception("Editing a plan acquired a fan before review.");
                    string retained=await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"方案最低输出\"]').value==='42'");
                    if(retained!="true")throw new Exception("Telemetry overwrote the plan draft.");
                    RequestExit();
                    await WaitForUi("!!document.querySelector('.ant-modal-confirm')","Exiting did not protect the unapplied plan draft.");
                    if(closing||stopPending||worker.Latest.Snapshot.Channels.Any(c=>c.Owned))throw new Exception("Draft confirmation did not preserve the running app and unchanged simulated hardware.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('.ant-modal-confirm .ant-btn-default').click()");
                    await WaitForUi("!document.querySelector('.ant-modal-confirm')","Continuing the draft did not dismiss the exit confirmation.");
                    if(await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"方案最低输出\"]').value==='42'")!="true")throw new Exception("Cancelling exit discarded the plan draft.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=review-plan]').click()");
                    await WaitForUi("!!document.querySelector('[data-testid=apply-plan]')","Plan review did not load.");
                    string review=await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=plan-review]').textContent.includes('最低输出 42%')&&document.querySelector('[data-testid=plan-review]').textContent.includes('demo/0')");
                    if(review!="true" || worker.Latest.Snapshot.Channels.Any(c=>c.Owned))throw new Exception("Review did not show exact settings before application.");
                    await CaptureUiImage("desktop-plan-review.png");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=apply-plan]').click()");
                    bool applied=false;
                    for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest.Snapshot.Channels.Count(c=>c.Owned)==3&&worker.Latest.Profiles.Any(p=>p.Id=="demo/0"&&p.Minimum==42)){applied=true;break;}}
                    if(!applied || worker.Latest.Snapshot.Channels.First(c=>c.Id=="demo/3").Owned)throw new Exception("Reviewed plan did not reach the native worker or changed the GPU default.");
                    if(worker.Latest.Snapshot.Channels.First(c=>c.Id=="demo/0").ActiveProfile.Minimum!=42)throw new Exception("Actual running parameters were not published.");
                    var cpuPlan=worker.Latest.Snapshot.Channels.First(c=>c.Id=="demo/0").ActiveProfile;
                    var casePlan=worker.Latest.Snapshot.Channels.First(c=>c.Id=="demo/1").ActiveProfile;
                    if(cpuPlan.Role!="CPU" || cpuPlan.RiseSeconds!=3 || cpuPlan.FallSeconds!=20 || casePlan.Role!="Case" || casePlan.Source!="group/mix" || casePlan.Points[1].Temperature!=55 || casePlan.FallSeconds!=30)throw new Exception("Reviewed role curves or smoothing did not survive the native bridge.");
                    await VerifyTrayLifecycle();
                    await Task.Delay(400);
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=configure-plan]').click()");
                    await WaitForUi("!!document.querySelector('[data-testid=review-plan]')","Plan editor did not reopen.");
                    await browser.CoreWebView2.ExecuteScriptAsync("(()=>{const input=document.querySelector('[aria-label=\"方案最低输出\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'48');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();})()");
                    await Task.Delay(500);
                    if(worker.Latest.Snapshot.Channels.First(c=>c.Id=="demo/0").ActiveProfile.Minimum!=42)throw new Exception("Editing an active plan modified hardware immediately.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=review-plan]').click()");
                    await WaitForUi("!!document.querySelector('[data-testid=apply-plan]')","Second plan review did not load.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=apply-plan]').click()");
                    bool changed=false;
                    for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest.Profiles.Any(p=>p.Id=="demo/0"&&p.Minimum==48)){changed=true;break;}}
                    if(!changed)throw new Exception("The second reviewed plan was not applied.");
                    await Task.Delay(400);
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=release-all]').click()");
                    bool released=false;for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest.Snapshot.Channels.All(c=>!c.Owned)){released=true;break;}}
                    if(!released)throw new Exception("Global release did not restore the simulated fan ports.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=advanced-menu]').click()");
                    await WaitForUi("!!document.querySelector('[data-testid=\"configure-demo/0\"]')","The fan settings page did not finish loading.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=\"configure-demo/0\"]').click()");
                    await WaitForUi("!!document.querySelector('[aria-label=\"风扇显示名称\"]')","The fan editor did not finish loading.");
                    await browser.CoreWebView2.ExecuteScriptAsync("(()=>{const input=document.querySelector('[aria-label=\"风扇显示名称\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'CPU 演示草稿');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
                    DateTime editedAt=worker.Latest.Snapshot.Time;
                    for(int i=0;i<20;i++){await Task.Delay(150);if(worker.Latest.Snapshot.Time>editedAt.AddSeconds(1.2))break;}
                    string draftRetained=await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"风扇显示名称\"]').value==='CPU 演示草稿'");
                    if(draftRetained!="true")throw new Exception("Live telemetry overwrote the user's fan editor draft.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"参与方案默认选择\"]').click()");await Task.Delay(100);
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=apply-channel]').click()");
                    bool excluded=false;
                    for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest.Profiles.Any(p=>p.Id=="demo/0"&&p.Excluded==true)){excluded=true;break;}}
                    if(!excluded)throw new Exception("Advanced participation setting did not reach the native worker.");
                    await Task.Delay(400);await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=home-menu]').click()");await Task.Delay(200);
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=configure-plan]').click()");
                    await WaitForUi("!!document.querySelector('[data-testid=review-plan]')","Excluded plan editor did not load.");
                    string checkbox=await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=\"plan-include-demo/0\"]').checked===false");
                    if(checkbox!="true")throw new Exception("Excluded fan was selected when reopening a plan.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=review-plan]').click()");
                    await WaitForUi("!!document.querySelector('[data-testid=apply-plan]')","Excluded plan review did not load.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=apply-plan]').click()");
                    bool respected=false;
                    for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest.Snapshot.Channels.Count(c=>c.Owned)==2&&!worker.Latest.Snapshot.Channels.First(c=>c.Id=="demo/0").Owned){respected=true;break;}}
                    if(!respected)throw new Exception("The reviewed plan was applied to an excluded fan.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=release-all]').click()");await Task.Delay(300);
                    string light=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-layout > .ant-layout')).backgroundColor");
                    string lightSidebar=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor");
                    string lightMenu=await browser.CoreWebView2.ExecuteScriptAsync("!!document.querySelector('.sidebar-rail.ant-layout-sider-light .navigation-list')");
                    if(lightMenu!="true")throw new Exception("Light theme did not reach the sidebar and navigation menu.");
                    await SelectTheme("dark");await Task.Delay(200);
                    await CaptureUiImage("desktop-overview-dark.png");
                    string dark=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-layout > .ant-layout')).backgroundColor");
                    if(dark==light)throw new Exception("Switching to the dark theme did not change the desktop surface.");
                    string darkSidebar=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor");
                    string darkMenu=await browser.CoreWebView2.ExecuteScriptAsync("!!document.querySelector('.sidebar-rail.ant-layout-sider-dark .navigation-list')");
                    if(darkSidebar==lightSidebar||darkMenu!="true")throw new Exception("Switching to the dark theme did not update the sidebar and navigation menu.");
                    await SelectTheme("light");await Task.Delay(200);
                    string restoredSidebar=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor");
                    if(restoredSidebar!=lightSidebar)throw new Exception("Switching back to the light theme did not restore the sidebar surface.");
                    File.WriteAllText(smokeReport,"PASS: WebView2 UI communicates with the native worker\r\nPASS: titlebar whitespace, icon and name route window drags; controls remain independent\r\nPASS: editing and reviewing plans never change simulated hardware\r\nPASS: exact reviewed minima, role curves and response timings reach the worker\r\nPASS: CPU and case fans are acquired; GPU stays under prior settings\r\nPASS: active settings change only after the second explicit application\r\nPASS: restoring settings releases simulated ports\r\nPASS: telemetry preserves plan and per-fan editor drafts\r\nPASS: excluded fans are not selected in a reopened plan\r\nPASS: both themes update the surface, sidebar and navigation\r\nThis test uses simulated fans and does not access physical hardware.\r\n");
                    try{File.AppendAllText(smokeReport,"Native window DPI: "+GetDpiForWindow(new WindowInteropHelper(this).Handle)+"\r\n");}catch(EntryPointNotFoundException){ }
                    File.AppendAllText(smokeReport,"PASS: cancelling exit preserves the unapplied draft and leaves simulated devices unchanged\r\n");
                    File.AppendAllText(smokeReport,"PASS: first connection is not incorrectly reported as a worker restart\r\n");
                    await CaptureUiStates();
                    File.AppendAllText(smokeReport,"PASS: loading, empty devices, connection failure and long names render with simulated fixtures\r\n");
                }
                await Task.Delay(smokeReport==null?400:2300);
                if(qaLaunch!=null)await WriteQaMetrics();
                using(var stream=File.Create(capturePath))await browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
                if(smokeReport!=null)
                {
                    File.AppendAllText(smokeReport,"PASS: close hides to tray, minimize preserves WPF visibility, simulated fan control continues, tray reopen works\r\n");
                    verifyTrayExit=true;tray.ContextMenuStrip.Items["tray-exit"].PerformClick();
                }
                else RequestExit();
            }
            catch(Exception e){FailCapture(e);}
        }
        private void FailCapture(Exception error){TestExitCode=1;File.WriteAllText(capturePath+".error.txt",error.ToString());RequestExit();}
        private async void OnClosing(object sender,System.ComponentModel.CancelEventArgs e)
        {
            if(closing)return;e.Cancel=true;
            if(!exitRequested&&closeBehavior=="tray"){MinimizeToTray();return;}
            if(stopPending)return;
            if(setupPending||reconnectPending)
            {
                exitRequested=false;Restore();Post(new WireMessage {Type="notice",Message="风扇服务正在连接或设置，请完成当前操作后再退出。",Success=false});return;
            }
            stopPending=true;
            try
            {
                if(ready&&browser.CoreWebView2!=null)
                {
                    string allowed=await browser.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('fancontroller-before-exit',{cancelable:true}))");
                    if(allowed=="false")
                    {
                        exitRequested=false;stopPending=false;Restore();return;
                    }
                }
                if(worker!=null&&!await worker.StopAsync())
                {
                    exitRequested=false;stopPending=false;Restore();Post(new WireMessage {Type="notice",Message="尚未完成风扇恢复，应用将继续运行。请稍后重试退出。",Success=false});return;
                }
                closing=true;if(worker!=null)worker.Dispose();if(tray!=null){var menu=tray.ContextMenuStrip;tray.Visible=false;tray.Dispose();if(menu!=null)menu.Dispose();}if(trayIcon!=null)trayIcon.Dispose();if(windowSource!=null)windowSource.RemoveHook(OnWindowMessage);browser.Dispose();await Dispatcher.InvokeAsync(Close);
            }
            catch(Exception error){exitRequested=false;stopPending=false;Restore();Post(new WireMessage {Type="notice",Message=error.Message,Success=false});}
        }
    }
}
