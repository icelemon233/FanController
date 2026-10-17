using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Serialization.Json;
using System.Security.Principal;
using System.Threading;
using System.Windows;

[assembly:AssemblyTitle("FanController")]
[assembly:AssemblyProduct("FanController")]
[assembly:AssemblyCompany("Cinna")]
[assembly:AssemblyCopyright("Cinna")]
[assembly:AssemblyDescription("Control supported CPU, case and GPU fans on Windows")]
[assembly:AssemblyVersion("0.4.3.0")]
[assembly:AssemblyFileVersion("0.4.3.0")]

namespace CinnaFanCon
{
    public static class AppProgram
    {
        [STAThread]
        public static int Main(string[] args)
        {
            string capture=null;
            try
            {
                if(args.Length>1&&args[0]=="--self-test"){File.WriteAllText(args[1],CoreTests.Run()+PlannerTests.Run());return 0;}
                if(args.Length>1&&args[0]=="--diagnose")
                {
                    using(var backend=new HardwareBackend())
                    {
                        backend.Open();var frame=backend.Poll();frame.Channels=backend.Ports.Select(p=>new ControlSession(p).View()).ToList();
                        using(var stream=File.Create(args[1]))new DataContractJsonSerializer(typeof(AppSnapshot)).WriteObject(stream,frame);
                    }
                    return 0;
                }
                bool smoke=args.Length>2&&args[0]=="--smoke";
                capture=smoke?args[2]:args.Length>1&&args[0]=="--capture"?args[1]:null;
                bool demo=smoke||args.Contains("--demo");
                string sid;using(var identity=WindowsIdentity.GetCurrent())sid=identity.User.Value;
                // Keep the established singleton name to prevent two versions controlling the same fans.
                using(var mutex=new Mutex(false,@"Local\FanDesk.Main."+sid))
                {
                    bool entered=capture!=null;
                    if(!entered){try{entered=mutex.WaitOne(0);}catch(AbandonedMutexException){entered=true;}}
                    if(!entered){MessageBox.Show("已有 FanController 或旧版应用正在运行。请从托盘打开，或退出后再启动此版本。","FanController");return 0;}
                    using(var installerGuard=new Mutex(false,@"Local\cinna-fanCon.Running"))
                    try
                    {
                        bool installing=false;
                        try{using(var installation=Mutex.OpenExisting(@"Local\cinna-fanCon.Installing"))installing=true;}
                        catch(WaitHandleCannotBeOpenedException){ }
                        if(installing)throw new InvalidOperationException("安装或卸载正在进行，请完成后再打开应用。");
                        System.Windows.Forms.Application.EnableVisualStyles();
                        System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
                        var app=new Application {ShutdownMode=ShutdownMode.OnMainWindowClose};
                        var window=new BrowserWindow(demo,capture,smoke?args[1]:null);
                        app.Run(window);return window.TestExitCode;
                    }
                    finally{if(capture==null)mutex.ReleaseMutex();}
                }
            }
            catch(Exception error)
            {
                if(capture!=null){File.WriteAllText(capture+".error.txt",error.ToString());return 1;}
                if(args.Length>1&&args[0].StartsWith("--")&&args[0]!="--demo"){File.WriteAllText(args[1]+".error.txt",error.ToString());return 1;}
                MessageBox.Show(error.Message,"FanController · 启动失败",MessageBoxButton.OK,MessageBoxImage.Error);return 1;
            }
        }
    }
}
