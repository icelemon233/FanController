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
        private readonly object sendLock=new object();
        private NamedPipeServerStream server;
        private StreamWriter writer;
        private Process process;
        private volatile bool expectedStop;
        public WireMessage Latest {get;private set;}
        public event Action<WireMessage> Received;

        public void Start(bool elevated,bool demo)
        {
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
                try{process=Process.Start(info);}catch{expectedStop=true;server.Dispose();throw;}
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
                    if(hello.Type!="hello" || hello.Token!=token)throw new InvalidDataException("风扇服务身份校验失败，未建立连接。");
                    lock(sendLock)writer=new StreamWriter(server,new UTF8Encoding(false),65536,true){AutoFlush=true};
                    if(expectedStop)Send(new WireMessage {Type="command",Id="shutdown",Action="stop"});
                    string line;
                    while((line=reader.ReadLine())!=null)
                    {
                        var message=Wire.Decode(line);if(message.Type=="snapshot")Latest=message;
                        var callback=Received;if(callback!=null)callback(message);
                    }
                }
            }
            catch(Exception e)
            {
                if(!expectedStop){var callback=Received;if(callback!=null)callback(new WireMessage {Type="notice",Message="风扇服务连接中断："+e.Message,Success=false});}
            }
        }
        public bool Send(WireMessage message)
        {
            lock(sendLock)
            {
                if(writer==null || !server.IsConnected)return false;
                try{writer.WriteLine(Wire.Encode(message));return true;}catch{return false;}
            }
        }
        public Task<bool> StopAsync()
        {
            expectedStop=true;Send(new WireMessage {Type="command",Id="shutdown",Action="stop"});
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
            expectedStop=true;
            if(server!=null)server.Dispose();
            if(process!=null)process.Dispose();
        }
    }
}
