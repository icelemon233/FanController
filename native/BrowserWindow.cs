using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shell;
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
        private const string Origin="https://cinna-fancon.example";
        private readonly WebView2 browser=new WebView2();
        private readonly bool demo;
        private readonly string capturePath,smokeReport;
        private WorkerClient worker;
        private Forms.NotifyIcon tray;
        private bool ready,closing,stopPending,captureStarted,setupPending;
        private bool rememberMotherboard;
        private static string MotherboardPreference {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","motherboard-access.enabled");}}
        public int TestExitCode;

        public BrowserWindow(bool demonstration,string capture,string smoke)
        {
            demo=demonstration;capturePath=capture;smokeReport=smoke;
            Title="cinna-fanCon · 风扇控制";Width=1280;Height=860;MinWidth=1040;MinHeight=740;
            if(capture==null){var area=SystemParameters.WorkArea;Width=Math.Min(1280,area.Width-32);Height=Math.Min(860,area.Height-32);MinWidth=Math.Min(920,area.Width-16);MinHeight=Math.Min(660,area.Height-16);}
            WindowStyle=WindowStyle.None;ResizeMode=ResizeMode.CanResize;WindowStartupLocation=WindowStartupLocation.CenterScreen;
            Background=new SolidColorBrush(Color.FromRgb(10,13,20));
            WindowChrome.SetWindowChrome(this,new WindowChrome {CaptionHeight=0,ResizeBorderThickness=new Thickness(6),GlassFrameThickness=new Thickness(0)});
            var border=new System.Windows.Controls.Border {Padding=new Thickness(1),Background=new SolidColorBrush(Color.FromRgb(34,44,61)),Child=browser};Content=border;
            browser.DefaultBackgroundColor=System.Drawing.Color.FromArgb(10,13,20);
            Loaded+=async delegate{await Initialize();};
            Closing+=OnClosing;
            if(capturePath==null)
            {
                tray=new Forms.NotifyIcon {Icon=System.Drawing.Icon.ExtractAssociatedIcon(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"cinna-fanCon.exe")),Text="cinna-fanCon · 风扇控制",Visible=true};
                var menu=new TrayContextMenu(
                    ()=>Dispatcher.BeginInvoke(new Action(Restore)),
                    ()=>{if(worker!=null)worker.Send(new WireMessage {Type="command",Id="tray-release",Action="release"});},
                    ()=>Dispatcher.BeginInvoke(new Action(()=>Close())));
                tray.ContextMenuStrip=menu;tray.DoubleClick+=delegate{Dispatcher.BeginInvoke(new Action(Restore));};
                StateChanged+=delegate{if(WindowState==WindowState.Minimized)Hide();};
            }
            else{ShowInTaskbar=false;WindowStartupLocation=WindowStartupLocation.Manual;Left=-30000;Top=-30000;}
        }
        private void Restore(){Show();WindowState=WindowState.Normal;Activate();}
        private async Task Initialize()
        {
            try
            {
                string ui=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ui");
                if(!File.Exists(Path.Combine(ui,"index.html")))throw new FileNotFoundException("界面文件缺失，请完整解压 cinna-fanCon 压缩包。");
                string cache=capturePath==null?Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","webview-v2"):Path.Combine(Environment.CurrentDirectory,"work","webview-v2-capture");
                var environment=await CoreWebView2Environment.CreateAsync(null,cache);
                await browser.EnsureCoreWebView2Async(environment);
                var core=browser.CoreWebView2;
                core.Settings.AreHostObjectsAllowed=false;core.Settings.AreDevToolsEnabled=false;
                core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreDefaultScriptDialogsEnabled=false;core.Settings.IsStatusBarEnabled=false;core.Settings.IsZoomControlEnabled=false;
                core.SetVirtualHostNameToFolderMapping("cinna-fancon.example",ui,CoreWebView2HostResourceAccessKind.DenyCors);
                core.NavigationStarting+=delegate(object s,CoreWebView2NavigationStartingEventArgs e){if(!Trusted(e.Uri))e.Cancel=true;};
                core.FrameNavigationStarting+=delegate(object s,CoreWebView2NavigationStartingEventArgs e){e.Cancel=true;};
                core.NewWindowRequested+=delegate(object s,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;};
                core.PermissionRequested+=delegate(object s,CoreWebView2PermissionRequestedEventArgs e){e.State=CoreWebView2PermissionState.Deny;};
                core.WebMessageReceived+=OnMessage;
                core.Navigate(Origin+"/index.html");
                bool preferred=!demo&&capturePath==null&&File.Exists(MotherboardPreference);
                if(preferred)
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
                MessageBox.Show(this,"界面启动失败："+e.Message+"\n\n请确认已安装 Microsoft Edge WebView2 Runtime，并完整解压了应用文件。","cinna-fanCon",MessageBoxButton.OK,MessageBoxImage.Error);Close();
            }
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
            worker=new WorkerClient();
            worker.Received+=message=>Dispatcher.BeginInvoke(new Action(async delegate
            {
                if(closing)return;Post(message);
                if(rememberMotherboard&&message.Type=="snapshot"&&message.Snapshot.Administrator&&message.Snapshot.PawnIoInstalled)
                {
                    try{Directory.CreateDirectory(Path.GetDirectoryName(MotherboardPreference));File.WriteAllText(MotherboardPreference,"enabled");}catch{ }
                    rememberMotherboard=false;
                }
                if(message.Type=="snapshot"&&ready&&capturePath!=null&&!captureStarted){captureStarted=true;await CaptureAndTest();}
            }));
            worker.Start(elevated,demo);
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
                    ready=true;Reply(command.Id,"界面已就绪。",true);
                    if(worker!=null&&worker.Latest!=null){Post(worker.Latest);if(capturePath!=null&&!captureStarted){captureStarted=true;await CaptureAndTest();}}
                }
                else if(command.Action=="minimize")WindowState=WindowState.Minimized;
                else if(command.Action=="maximize")WindowState=WindowState==WindowState.Maximized?WindowState.Normal:WindowState.Maximized;
                else if(command.Action=="close")Close();
                else if(command.Action=="drag"){ReleaseCapture();SendMessage(new WindowInteropHelper(this).Handle,0xA1,new IntPtr(2),IntPtr.Zero);}
                else if(command.Action=="enableMotherboard")await EnableMotherboard(command.Id);
                else if(command.Action=="smart"||command.Action=="release"||command.Action=="apply"||command.Action=="rescan")
                {
                    if(setupPending){Reply(command.Id,"正在设置主板访问，请等待安装和授权完成。",false);return;}
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
        private async Task WaitForUi(string condition,string failure)
        {
            for(int i=0;i<50;i++)
            {
                if(await browser.CoreWebView2.ExecuteScriptAsync(condition)=="true")return;
                await Task.Delay(100);
            }
            throw new Exception(failure);
        }
        private async Task CaptureAndTest()
        {
            try
            {
                await Task.Delay(900);
                if(smokeReport!=null)
                {
                    if(!demo)throw new InvalidOperationException("界面操作测试只能在演示模式运行。");
                    await browser.CoreWebView2.ExecuteScriptAsync("if(document.querySelector('.app-layout').dataset.theme==='dark')document.querySelector('[aria-label=\"切换主题\"]').click()");await Task.Delay(600);
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=mode-均衡]').click()");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=smart-start]').click()");
                    bool applied=false;
                    for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest!=null&&worker.Latest.Snapshot.Channels.All(c=>c.Owned)){applied=true;break;}}
                    if(!applied)throw new Exception("Automatic control did not acquire all four simulated fan ports.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=mode-静音]').click()");
                    bool changed=false;for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest.Snapshot.CoolingMode=="静音"){changed=true;break;}}
                    if(!changed)throw new Exception("Changing a mode did not reach the native smart planner.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=release-all]').click()");
                    bool released=false;for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest.Snapshot.Channels.All(c=>!c.Owned)){released=true;break;}}
                    if(!released)throw new Exception("Global release did not restore all fake ports.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=advanced-menu]').click()");
                    await WaitForUi("!!document.querySelector('[data-testid=\"configure-demo/0\"]')","The fan settings page did not finish loading.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=\"configure-demo/0\"]').click()");
                    await WaitForUi("!!document.querySelector('[aria-label=\"风扇显示名称\"]')","The fan editor did not finish loading.");
                    await browser.CoreWebView2.ExecuteScriptAsync("(()=>{const input=document.querySelector('[aria-label=\"风扇显示名称\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'CPU 演示草稿');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
                    DateTime editedAt=worker.Latest.Snapshot.Time;
                    for(int i=0;i<20;i++){await Task.Delay(150);if(worker.Latest.Snapshot.Time>editedAt.AddSeconds(1.2))break;}
                    string draftRetained=await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"风扇显示名称\"]').value==='CPU 演示草稿'");
                    if(draftRetained!="true")throw new Exception("Live telemetry overwrote the user's fan editor draft.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"跟随主页模式\"]').click()");await Task.Delay(100);
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=apply-channel]').click()");
                    bool excluded=false;
                    for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest.Profiles.Any(p=>p.Id=="demo/0"&&p.Excluded==true)){excluded=true;break;}}
                    if(!excluded)throw new Exception("Advanced participation setting did not reach the native worker.");
                    await Task.Delay(400);await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=home-menu]').click()");await Task.Delay(200);
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=smart-start]').click()");
                    bool respected=false;
                    for(int i=0;i<25;i++){await Task.Delay(200);if(worker.Latest.Snapshot.Channels.Count(c=>c.Owned)==3&&!worker.Latest.Snapshot.Channels.First(c=>c.Id=="demo/0").Owned){respected=true;break;}}
                    if(!respected)throw new Exception("The preset was applied to an excluded fan.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=release-all]').click()");await Task.Delay(300);
                    string light=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-layout > .ant-layout')).backgroundColor");
                    string lightSidebar=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor");
                    string lightMenu=await browser.CoreWebView2.ExecuteScriptAsync("!!document.querySelector('.app-sidebar.ant-layout-sider-light .ant-menu-light')");
                    if(lightMenu!="true")throw new Exception("Light theme did not reach the sidebar and navigation menu.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"切换主题\"]').click()");await Task.Delay(600);
                    string dark=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-layout > .ant-layout')).backgroundColor");
                    if(dark==light)throw new Exception("Switching to the dark theme did not change the desktop surface.");
                    string darkSidebar=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor");
                    string darkMenu=await browser.CoreWebView2.ExecuteScriptAsync("!!document.querySelector('.app-sidebar.ant-layout-sider-dark .ant-menu-dark')");
                    if(darkSidebar==lightSidebar||darkMenu!="true")throw new Exception("Switching to the dark theme did not update the sidebar and navigation menu.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[aria-label=\"切换主题\"]').click()");await Task.Delay(600);
                    string restoredSidebar=await browser.CoreWebView2.ExecuteScriptAsync("getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor");
                    if(restoredSidebar!=lightSidebar)throw new Exception("Switching back to the light theme did not restore the sidebar surface.");
                    await browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-testid=mode-均衡]').click()");
                    File.WriteAllText(smokeReport,"PASS: WebView2 UI communicates with the native worker\r\nPASS: automatic control acquires four simulated fans and matches temperature sources\r\nPASS: switching to Quiet mode updates the native planner\r\nPASS: restoring prior settings releases all four simulated fan ports\r\nPASS: live telemetry preserves the fan editor draft\r\nPASS: the next preset skips a fan excluded in its settings\r\nPASS: switching themes updates the desktop surface, sidebar and navigation menu\r\nThis test uses simulated fans and does not access physical hardware.\r\n");
                }
                await Task.Delay(smokeReport==null?400:2300);
                using(var stream=File.Create(capturePath))await browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
                Close();
            }
            catch(Exception e){FailCapture(e);}
        }
        private void FailCapture(Exception error){TestExitCode=1;File.WriteAllText(capturePath+".error.txt",error.ToString());Close();}
        private async void OnClosing(object sender,System.ComponentModel.CancelEventArgs e)
        {
            if(closing)return;e.Cancel=true;if(stopPending)return;stopPending=true;
            try
            {
                if(worker!=null&&!await worker.StopAsync())
                {
                    Post(new WireMessage {Type="notice",Message="尚未完成风扇恢复，应用将继续运行。请稍后重试退出。",Success=false});stopPending=false;return;
                }
                closing=true;if(worker!=null)worker.Dispose();if(tray!=null){var menu=tray.ContextMenuStrip;tray.Visible=false;tray.Dispose();if(menu!=null)menu.Dispose();}browser.Dispose();Close();
            }
            catch(Exception error){stopPending=false;Post(new WireMessage {Type="notice",Message=error.Message,Success=false});}
        }
    }
}
