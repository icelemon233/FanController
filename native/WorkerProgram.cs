using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Text;
using System.Threading;

namespace CinnaFanCon
{
    public sealed class DemoPort : IControlPort
    {
        private readonly ChannelView channel;
        public DemoPort(ChannelView c) { channel=c; }
        public string Id {get{return channel.Id;}}
        public string Name {get{return channel.Name;}}
        public string Device {get{return channel.Device;}}
        public string Group {get{return channel.Group;}}
        public string DefaultRpmId {get{return channel.DefaultRpmId;}}
        public double Minimum {get{return 0;}}
        public double Maximum {get{return 100;}}
        public int Writes,Restores;
        public void Write(double value) {Writes++;}
        public void Restore() {Restores++;}
    }

    public sealed class WorkerService
    {
        private readonly object sendLock=new object(),stateLock=new object();
        private readonly NamedPipeClientStream pipe;
        private readonly StreamWriter writer;
        private readonly StreamReader reader;
        private readonly bool demo;
        private readonly ProfileStore store;
        private readonly ManualResetEvent stopping=new ManualResetEvent(false);
        private FanEngine engine;
        private AppSnapshot latest;
        private List<ControlSession> demoSessions;
        private string demoMode;
        private string saveError;
        private bool persistenceReadFailed;

        public WorkerService(NamedPipeClientStream client,bool demonstration)
        {
            pipe=client;demo=demonstration;
            writer=new StreamWriter(pipe,new UTF8Encoding(false),65536,true) {AutoFlush=true};
            reader=new StreamReader(pipe,Encoding.UTF8,false,65536,true);
            try {store=demo?new ProfileStore():ProfileStore.Load();}
            catch(Exception e) {store=new ProfileStore();persistenceReadFailed=true;saveError="无法读取已保存的风扇设置，原文件已保留："+e.Message;}
        }
        private void Send(WireMessage message)
        {
            try {lock(sendLock)writer.WriteLine(Wire.Encode(message));}
            catch {stopping.Set();}
        }
        private void Reply(string id,string message,bool success,int applied=0,int skipped=0,string persistenceError=null)
        {
            Send(new WireMessage {Type="reply",Id=id,Message=message,Success=success,Applied=applied,Skipped=skipped,PersistenceError=persistenceError});
        }
        private void Save(IEnumerable<FanProfile> profiles)
        {
            lock(stateLock)
            {
                try
                {
                    if(persistenceReadFailed)throw new InvalidDataException("原配置未能读取，已保留原文件；请修复配置后重启应用。");
                    if(demo)
                    {
                        foreach(var p in profiles) {store.Profiles.RemoveAll(x=>x.Id==p.Id);store.Profiles.Add(p.Clone());}
                    }
                    else store.SaveMany(profiles);
                    saveError=null;
                }
                catch(Exception e) {saveError="设置已生效，但未能保存到此电脑："+e.Message;}
            }
        }
        private void Publish(AppSnapshot frame)
        {
            lock(stateLock)
            {
                latest=frame;
                if(persistenceReadFailed && !frame.Notices.Contains(saveError))frame.Notices.Add(saveError);
                Send(new WireMessage {Type="snapshot",Snapshot=frame,Profiles=store.Profiles.Select(p=>p.Clone()).ToList(),
                    Recommendations=frame.Channels.Select(c=>CoolingPlanner.Recommend(frame,c,c.ActiveProfile??store.Profiles.FirstOrDefault(p=>p.Id==c.Id),DateTime.UtcNow)).ToList()});
            }
        }
        public void Run(string token,Process parent)
        {
            Send(new WireMessage {Type="hello",Token=token,Success=true});
            if(demo)
            {
                latest=DemoData.Create();demoSessions=latest.Channels.Select(c=>new ControlSession(new DemoPort(c))).ToList();
                PublishDemo();
            }
            else
            {
                engine=new FanEngine();
                engine.Updated+=Publish;
                engine.Completed+=(p,message,success)=>{if(p!=null && success)Save(new[]{p});};
                engine.RequestCompleted+=(id,message,success)=>Reply(id,saveError??message,success,0,0,saveError);
                engine.SmartCompleted+=OnSmartCompleted;
                engine.Start();
            }
            var input=new Thread(ReadCommands){IsBackground=true,Name="cinna-fanCon private command pipe"};input.Start();
            while(!stopping.WaitOne(1000))
            {
                try {if(parent.HasExited){stopping.Set();break;}}
                catch {stopping.Set();break;}
                if(demo)PublishDemo();
            }
            if(engine!=null)
            {
                // Keep original snapshots alive and retry restoration instead of killing a stuck worker.
                while(!engine.Stop(3000)) Thread.Sleep(500);
            }
            if(demoSessions!=null)foreach(var session in demoSessions)session.Release();
        }
        private void PublishDemo()
        {
            var frame=DemoData.Create();
            lock(stateLock)
            {
                foreach(var session in demoSessions)session.Tick(frame.Sensors,frame.Time);
                frame.Channels=demoSessions.Select(s=>s.View()).ToList();frame.CoolingMode=frame.Channels.Any(c=>c.Owned)?demoMode:null;
                Publish(frame);
            }
        }
        private void OnSmartCompleted(SmartResult result)
        {
            Save(result.Applied);
            bool success=result.Applied.Count>0 && result.Errors.Count==0;
            int controlled=result.Applied.Count(p=>p.Mode!=FanMode.Hardware),original=result.Applied.Count-controlled;
            string message=result.Applied.Count==0?"方案未应用，请检查风扇和温度读数。":"已调节 "+controlled+" 组风扇，"+original+" 组使用原设置。";
            if(result.Errors.Count>0)message+=" 未能应用："+String.Join("；",result.Errors.Select(e=>(e.Name??"方案")+"："+e.Reason));
            if(saveError!=null)message+=" "+saveError;
            Reply(result.Id,message,success,result.Applied.Count,result.Skipped.Count,saveError);
        }
        private void ReadCommands()
        {
            try
            {
                string line;
                while((line=reader.ReadLine())!=null)
                {
                    WireMessage command;
                    try {command=Wire.Decode(line);}
                    catch(Exception e){Send(new WireMessage {Type="notice",Message=e.Message,Success=false});continue;}
                    if(command==null || command.Type!="command")continue;
                    if(command.Action=="stop"){stopping.Set();continue;}
                    try {Execute(command);}
                    catch(Exception e){Reply(command.Id,e.Message,false);}
                }
            }
            catch { }
            finally {stopping.Set();}
        }
        private void Execute(WireMessage command)
        {
            if(stopping.WaitOne(0))throw new InvalidOperationException("正在恢复风扇原设置，请等待完成。");
            if(command.Id==null || command.Id.Length>100)throw new InvalidDataException("请求编号无效。");
            if(command.Action=="plan")
            {
                List<FanProfile> profiles=command.Profiles;
                if(profiles==null || profiles.Count==0 || profiles.Count>64 || profiles.Any(p=>p==null))throw new ArgumentException("未收到有效方案，请重新预览。");
                foreach(var profile in profiles){string invalid=profile.Validate();if(invalid!=null)throw new ArgumentException(invalid);}
                if(!demo)engine.EnqueuePlan(profiles,command.Id);
                else lock(stateLock)
                {
                    string error=CoolingPlanner.ValidateExplicit(latest,profiles,DateTime.UtcNow);
                    if(error!=null)throw new ArgumentException(error);
                    var result=new SmartResult {Id=command.Id,Mode="自定义"};
                    foreach(var profile in profiles)
                    {
                        var session=demoSessions.First(s=>s.Port.Id==profile.Id);
                        session.Apply(profile);session.Tick(latest.Sensors,DateTime.UtcNow);result.Applied.Add(profile.Clone());
                    }
                    demoMode="自定义";OnSmartCompleted(result);PublishDemo();
                }
            }
            else if(command.Action=="smart")
            {
                if(!CoolingPlanner.ValidMode(command.Mode))throw new ArgumentException("风扇模式无效，请重新选择。");
                List<FanProfile> saved;lock(stateLock)saved=store.Profiles.Select(p=>p.Clone()).ToList();
                if(!demo)engine.EnqueueSmart(command.Mode,saved,command.Id);
                else
                {
                    lock(stateLock)
                    {
                        var plan=CoolingPlanner.Create(latest,command.Mode,saved,DateTime.UtcNow);
                        var result=new SmartResult {Id=command.Id,Mode=command.Mode,Skipped=plan.Skipped};
                        foreach(var profile in plan.Profiles)
                        {
                            var session=demoSessions.First(s=>s.Port.Id==profile.Id);session.Apply(profile);session.Tick(latest.Sensors,DateTime.UtcNow);result.Applied.Add(profile);
                        }
                        demoMode=command.Mode;OnSmartCompleted(result);PublishDemo();
                    }
                }
            }
            else if(command.Action=="apply")
            {
                var profile=command.Profile;if(profile==null)throw new ArgumentException("未收到风扇设置，请重新应用。");
                if(profile.Excluded==true)profile.Mode=FanMode.Hardware;
                string error=profile.Validate();if(error!=null)throw new ArgumentException(error);
                if(!demo)engine.Enqueue("apply",profile,command.Id);
                else
                {
                    lock(stateLock)
                    {
                        string invalid=CoolingPlanner.ValidateExplicit(latest,new[]{profile},DateTime.UtcNow);if(invalid!=null)throw new ArgumentException(invalid);
                        var session=demoSessions.FirstOrDefault(s=>s.Port.Id==profile.Id);if(session==null)throw new ArgumentException("未找到这组风扇，请重新检测。");
                        session.Apply(profile);session.Tick(latest.Sensors,DateTime.UtcNow);Save(new[]{profile});demoMode="自定义";PublishDemo();Reply(command.Id,"设置已应用。",true);
                    }
                }
            }
            else if(command.Action=="release" || command.Action=="rescan")
            {
                if(!demo)engine.Enqueue(command.Action=="release"?"release":"rescan",null,command.Id);
                else
                {
                    lock(stateLock){foreach(var session in demoSessions)session.Release();demoMode=null;PublishDemo();Reply(command.Id,command.Action=="release"?"已恢复风扇原设置。":"设备检测完成。",true);}
                }
            }
            else throw new ArgumentException("不支持此风扇操作。");
        }
    }
    public static class WorkerProgram
    {
        public static int Main(string[] args)
        {
            try
            {
                if(args.Length>1 && args[0]=="--self-test"){File.WriteAllText(args[1],CoreTests.Run()+PlannerTests.Run());return 0;}
                var values=new Dictionary<string,string>();bool demo=args.Contains("--demo");
                for(int i=0;i<args.Length-1;i++)if(args[i].StartsWith("--") && args[i]!="--demo")values[args[i]]=args[++i];
                string name=values["--pipe"],token=values["--token"];
                if(!name.StartsWith("cinna-fanCon-") || name.Length>80 || token.Length!=64)return 1;
                int parentId=Int32.Parse(values["--parent"]);long ticks=Int64.Parse(values["--parentticks"]);
                using(var installerGuard=new Mutex(false,@"Local\cinna-fanCon.Running"))
                using(var parent=Process.GetProcessById(parentId))
                {
                    if(parent.StartTime.ToUniversalTime().Ticks!=ticks)return 1;
                    using(var pipe=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous))
                    {
                        pipe.Connect(15000);new WorkerService(pipe,demo).Run(token,parent);
                    }
                }
                return 0;
            }
            catch {return 1;}
        }
    }
}
