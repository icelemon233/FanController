using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace CinnaFanCon
{
    public sealed class WorkerClient : IDisposable
    {
        private readonly object sendLock=new object(),receiveLock=new object();
        private NamedPipeServerStream server;
        private StreamWriter writer;
        private Process process;
        private volatile bool expectedStop;
        private volatile bool connected,disposed;
        private volatile WireMessage latest;
        private int failureReported;
        public WireMessage Latest {get{return latest;}}
        public bool Elevated {get;private set;}
        public bool HasExited {get{try{return process==null||process.HasExited;}catch{return true;}}}
        public bool Connected {get{return connected&&!HasExited&&!disposed;}}
        public event Action<WireMessage> Received;

        public void Start(bool elevated,bool demo)
        {
            Elevated=elevated;
            string name="cinna-fanCon-"+Guid.NewGuid().ToString("N");
            string token;using(var rng=RandomNumberGenerator.Create()){var bytes=new byte[32];rng.GetBytes(bytes);token=BitConverter.ToString(bytes).Replace("-","");}
            SecurityIdentifier sid;using(var identity=WindowsIdentity.GetCurrent())sid=identity.User;
            var security=new PipeSecurity();security.SetAccessRuleProtection(true,false);
            security.AddAccessRule(new PipeAccessRule(sid,PipeAccessRights.FullControl,AccessControlType.Allow));
            server=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,65536,65536,security);
            var listener=new Thread(()=>Listen(token)){IsBackground=true,Name="cinna-fanCon private worker channel"};listener.Start();
            using(var current=Process.GetCurrentProcess())
            {
                string args="--pipe "+name+" --token "+token+" --parent "+current.Id+" --parentticks "+current.StartTime.ToUniversalTime().Ticks+(demo?" --demo":"");
                var info=new ProcessStartInfo(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"FanController.Worker.exe"),args)
                {UseShellExecute=elevated,WorkingDirectory=AppDomain.CurrentDomain.BaseDirectory,WindowStyle=ProcessWindowStyle.Hidden};
                if(elevated)info.Verb="runas";else info.CreateNoWindow=true;
                try
                {
                    process=Process.Start(info);
                    process.Exited+=delegate
                    {
                        string code;try{code=unchecked((uint)process.ExitCode).ToString("X8");}catch{code="未知";}
                        Fail("风扇服务意外退出（退出代码 "+code+"）。请重新连接后核对风扇状态，之前的设置是否恢复无法确认。");
                    };
                    process.EnableRaisingEvents=true;
                }
                catch{expectedStop=true;server.Dispose();throw;}
            }
        }
        private void Fail(string message)
        {
            lock(receiveLock)
            {
                connected=false;latest=null;
                if(expectedStop||disposed||Interlocked.Exchange(ref failureReported,1)!=0)return;
                var callback=Received;if(callback!=null)callback(new WireMessage {Type="service-error",Message=message,Success=false});
            }
        }
        private void Listen(string token)
        {
            try
            {
                server.WaitForConnection();
                using(var reader=new StreamReader(server,Encoding.UTF8,false,65536,true))
                {
                    var hello=Wire.Decode(reader.ReadLine());
                    if(hello==null||hello.Type!="hello" || hello.Token!=token)throw new InvalidDataException("风扇服务身份校验失败，未建立连接。");
                    lock(sendLock)writer=new StreamWriter(server,new UTF8Encoding(false),65536,true){AutoFlush=true};
                    lock(receiveLock){if(disposed||failureReported!=0)return;connected=true;}
                    if(expectedStop)Send(new WireMessage {Type="command",Id="shutdown",Action="stop"});
                    string line;
                    while((line=reader.ReadLine())!=null)
                    {
                        var message=Wire.Decode(line);
                        lock(receiveLock)
                        {
                            // Process exit and buffered pipe frames can race. Publish the
                            // failure last and never revive a terminated session's cache.
                            if(disposed||failureReported!=0)break;
                            if(message.Type=="snapshot")latest=message;
                            var callback=Received;if(callback!=null)callback(message);
                        }
                    }
                }
            }
            catch(Exception e)
            {
                Fail("风扇服务连接中断："+e.Message+"。请重新连接后核对风扇状态。");
            }
            finally{Fail("风扇服务连接已断开。请重新连接；之前的风扇状态无法确认。");}
        }
        public async Task<WireMessage> WaitForSnapshotAsync(int milliseconds,bool requireNew)
        {
            var previous=latest;var timer=Stopwatch.StartNew();
            while(timer.ElapsedMilliseconds<milliseconds)
            {
                if(failureReported!=0||HasExited||disposed)throw new InvalidOperationException("风扇服务已退出或断开连接，请重新连接。");
                var frame=latest;
                if(Connected&&frame!=null&&frame.Snapshot!=null&&(!requireNew||!Object.ReferenceEquals(frame,previous)))
                {
                    double age=(DateTime.UtcNow-frame.Snapshot.Time).TotalMilliseconds;
                    if(age>=-1000&&age<=6000)return frame;
                }
                await Task.Delay(100);
            }
            throw new TimeoutException("风扇服务没有返回新的读数。服务可能被驱动阻塞，请稍后重试。");
        }
        public bool Send(WireMessage message)
        {
            lock(sendLock)
            {
                try{if(disposed||writer==null||server==null||!server.IsConnected)return false;writer.WriteLine(Wire.Encode(message));return true;}catch{return false;}
            }
        }
        public Task<bool> StopAsync()
        {
            expectedStop=true;
            // A blocked pipe must not freeze the UI or bypass the exit timeout.
            Task.Run(()=>Send(new WireMessage {Type="command",Id="shutdown",Action="stop"}));
            return Task.Run(()=>
            {
                if(process==null)return true;
                bool stopped=process.WaitForExit(6000);
                if(!stopped)expectedStop=false;
                return stopped;
            });
        }
        public void Dispose()
        {
            lock(receiveLock){expectedStop=true;disposed=true;connected=false;latest=null;}
            if(server!=null)server.Dispose();
            if(process!=null)process.Dispose();
        }
    }
}
