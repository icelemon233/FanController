using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

// An isolated fake app and worker. These processes never access fan hardware,
// the real installation, its mutexes, registry entries or saved profiles.
internal static class UpdateFixture
{
    [STAThread]
    private static void Main(string[] args)
    {
        string root=AppDomain.CurrentDomain.BaseDirectory;
        string log=Path.Combine(root,"events.txt"),cleanup=Path.Combine(root,"cleanup.txt");
        string stop=Path.Combine(root,"stop-worker.txt"),mutex=args[1];
        using(var running=new Mutex(false,mutex))
        {
            if(args[0]=="worker")
            {
                File.WriteAllText(Path.Combine(root,"worker-ready.txt"),"ready");
                while(!File.Exists(stop)&&!File.Exists(cleanup))Thread.Sleep(50);
                if(!File.Exists(cleanup))Thread.Sleep(800);
                File.AppendAllText(log,"worker-restored\n");
                return;
            }
            using(var worker=Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"worker "+mutex){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden}))
            using(var form=new Form {Text=args[2],ShowInTaskbar=false,Left=-30000,Top=-30000,StartPosition=FormStartPosition.Manual})
            using(var timer=new System.Windows.Forms.Timer {Interval=100})
            {
                bool closed=false,pending=false;
                form.Shown+=delegate{File.WriteAllText(Path.Combine(root,"app-ready.txt"),"ready");};
                form.FormClosing+=async delegate(object sender,FormClosingEventArgs e)
                {
                    if(closed)return;
                    e.Cancel=true;if(pending)return;pending=true;
                    File.AppendAllText(log,"close-requested\n");
                    if(args[0]=="Refuse")return;
                    await Task.Delay(400);
                    File.WriteAllText(stop,"stop");
                    await Task.Run(()=>worker.WaitForExit());
                    File.AppendAllText(log,"host-exit\n");
                    closed=true;form.Close();
                };
                timer.Tick+=delegate{if(File.Exists(cleanup)){closed=true;form.Close();}};
                timer.Start();Application.Run(form);
                if(File.Exists(cleanup))worker.WaitForExit(5000);
            }
        }
    }
}
