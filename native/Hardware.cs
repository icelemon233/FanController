using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Management;
using System.Security.Principal;
using System.Threading;
using LibreHardwareMonitor.Hardware;
using Microsoft.Win32;

namespace CinnaFanCon
{
    public sealed class LhmFanPort : IControlPort
    {
        private readonly ISensor sensor;
        private readonly string group;
        public LhmFanPort(ISensor s,string g) { sensor=s; group=g; }
        public string Id { get { return sensor.Identifier.ToString(); } }
        public string Name { get { return sensor.Name; } }
        public string Device { get { return sensor.Hardware.Name; } }
        public string Group { get { return group; } }
        public string DefaultRpmId
        {
            get
            {
                var matching=sensor.Hardware.Sensors.FirstOrDefault(s=>s.SensorType==SensorType.Fan && s.Name==sensor.Name);
                return matching==null ? null : matching.Identifier.ToString();
            }
        }
        public double Minimum { get { return Math.Max(0,sensor.Control.MinSoftwareValue); } }
        public double Maximum { get { return Math.Min(100,sensor.Control.MaxSoftwareValue); } }
        public void Write(double value) { sensor.Control.SetSoftware((float)Numbers.Clamp(value,Minimum,Maximum)); }
        public void Restore() { sensor.Control.SetDefault(); }
    }

    public sealed class HardwareBackend : IDisposable
    {
        private Computer computer;
        private AdlxBackend adlx;
        private readonly List<IControlPort> ports=new List<IControlPort>();
        private readonly List<string> initialNotices=new List<string>();
        public bool Administrator { get; private set; }
        public bool PawnIoInstalled { get; private set; }
        public string Board,Cpu,Gpu;
        public IList<IControlPort> Ports { get { return ports.AsReadOnly(); } }

        public static bool IsAdministrator()
        {
            using(var identity=WindowsIdentity.GetCurrent())
                return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
        }

        private static string MachineName(string className,string property)
        {
            try
            {
                using(var query=new ManagementObjectSearcher("SELECT "+property+" FROM "+className))
                {
                    query.Options.Timeout=TimeSpan.FromSeconds(5);
                    using(var objects=query.Get())
                    {
                        var names=new List<string>();
                        foreach(ManagementObject obj in objects)
                            using(obj) { string s=Convert.ToString(obj[property]); if(!String.IsNullOrWhiteSpace(s)) names.Add(s.Trim()); }
                        return String.Join(" / ",names);
                    }
                }
            }
            catch { return "未识别"; }
        }
        private static List<string> DisplayAdapterIds()
        {
            try
            {
                using(var query=new ManagementObjectSearcher("SELECT PNPDeviceID FROM Win32_VideoController"))
                {
                    query.Options.Timeout=TimeSpan.FromSeconds(5);
                    using(var objects=query.Get())
                    {
                        var ids=new List<string>();
                        foreach(ManagementObject adapter in objects)using(adapter)ids.Add(Convert.ToString(adapter["PNPDeviceID"]));
                        return ids;
                    }
                }
            }
            catch{return null;}
        }
        internal static Computer CreateMonitor(IEnumerable<string> adapterIds,bool hasAdlxGpu)
        {
            var ids=adapterIds==null?null:adapterIds.ToList();
            // LHM 0.9.6 enables all GPU vendors together. Its AMD ADL frame-metric
            // poll can terminate the process; never construct that path on AMD
            // or when adapter identity is unknown, even if ADLX is unavailable.
            bool legacyGpu=!hasAdlxGpu&&ids!=null&&ids.Count>0&&ids.All(id=>!String.IsNullOrEmpty(id)&&
                (id.IndexOf("VEN_10DE",StringComparison.OrdinalIgnoreCase)>=0||id.IndexOf("VEN_8086",StringComparison.OrdinalIgnoreCase)>=0)&&
                id.IndexOf("VEN_1002",StringComparison.OrdinalIgnoreCase)<0);
            return new Computer {IsMotherboardEnabled=true,IsCpuEnabled=true,IsGpuEnabled=legacyGpu,
                IsMemoryEnabled=false,IsStorageEnabled=false,IsNetworkEnabled=false,IsControllerEnabled=false};
        }

        public void Open()
        {
            Administrator=IsAdministrator();
            PawnIoInstalled=LibreHardwareMonitor.PawnIo.PawnIo.IsInstalled;
            Board=MachineName("Win32_BaseBoard","Product");
            Cpu=MachineName("Win32_Processor","Name");
            Gpu=MachineName("Win32_VideoController","Name");
            try
            {
                adlx=new AdlxBackend(); adlx.Open();
                initialNotices.AddRange(adlx.Notices);
                foreach(var port in adlx.Ports.Where(p=>p.Controllable)) ports.Add(port);
            }
            catch(Exception e)
            {
                initialNotices.Add("无法启用 AMD 显卡接口："+e.Message);
                if(adlx!=null) { try { adlx.Dispose(); } catch { } adlx=null; }
            }
            try
            {
                var adapterIds=DisplayAdapterIds();
                computer=CreateMonitor(adapterIds,adlx!=null&&adlx.Ports.Count>0);
                if(!computer.IsGpuEnabled&&adapterIds!=null&&adapterIds.Any(id=>id!=null&&id.IndexOf("VEN_10DE",StringComparison.OrdinalIgnoreCase)>=0))
                    initialNotices.Add("为避开旧版 AMD 监测接口，当前仅通过 ADLX 读取 AMD 显卡；同机的其他显卡暂不监测。");
                if(!computer.IsGpuEnabled&&(adlx==null||adlx.Ports.Count==0))
                    initialNotices.Add("显卡监测未就绪。AMD 显卡仅使用 ADLX 接口，请检查是否已安装完整驱动；CPU 与主板监测不受影响。");
                computer.Open();
            }
            catch(Exception e) { initialNotices.Add("无法启用硬件监测接口："+e.Message); }
            if(!Administrator) initialNotices.Add("读取 CPU 温度和控制主板风扇可能需要管理员权限。请在概览中点击“启用主板访问”。");
            if(!PawnIoInstalled) initialNotices.Add("未安装 PawnIO 硬件组件。请在概览中点击“启用主板访问”。");
            Poll(); // Activate sensors before discovering control channels.
            if(computer!=null)
                foreach(var hardware in computer.Hardware) Discover(hardware);
        }

        private static string Group(IHardware hardware)
        {
            if(hardware.HardwareType==HardwareType.Cpu) return "CPU";
            if(hardware.HardwareType==HardwareType.GpuAmd || hardware.HardwareType==HardwareType.GpuNvidia || hardware.HardwareType==HardwareType.GpuIntel) return "GPU";
            return "主板";
        }

        private void Discover(IHardware hardware)
        {
            // AMD legacy ADL setters can ignore native failure codes. Use the checked ADLX path only.
            if(hardware.HardwareType!=HardwareType.GpuAmd)
                foreach(var sensor in hardware.Sensors)
                    if(sensor.SensorType==SensorType.Control && sensor.Control!=null)
                    {
                        var port=new LhmFanPort(sensor,Group(hardware));
                        if(Numbers.Finite(port.Minimum) && Numbers.Finite(port.Maximum) && port.Minimum>=0 && port.Maximum<=100 && port.Maximum>port.Minimum)
                            ports.Add(port);
                        else initialNotices.Add(hardware.Name+" / "+sensor.Name+"：硬件返回的输出范围无效，已跳过这组风扇。");
                    }
            foreach(var sub in hardware.SubHardware) Discover(sub);
        }

        private void Read(IHardware hardware,List<SensorReading> readings,List<string> notices)
        {
            if(hardware.HardwareType==HardwareType.GpuAmd)return;
            bool success=true;
            try { hardware.Update(); }
            catch(Exception e) { notices.Add(hardware.Name+"："+e.Message); success=false; }
            if(success)
            {
                foreach(var sensor in hardware.Sensors)
                    if(sensor.SensorType==SensorType.Temperature || sensor.SensorType==SensorType.Fan || sensor.SensorType==SensorType.Control)
                    {
                        double? value=sensor.Value;
                        if(sensor.SensorType==SensorType.Temperature && (Group(hardware)=="CPU" || Group(hardware)=="GPU") && value<=0) value=null;
                        readings.Add(new SensorReading { Id=sensor.Identifier.ToString(),Name=sensor.Name,Device=hardware.Name,
                            Group=Group(hardware),Kind=sensor.SensorType.ToString(),Value=value,Time=DateTime.UtcNow });
                    }
            }
            foreach(var sub in hardware.SubHardware) Read(sub,readings,notices);
        }

        public AppSnapshot Poll()
        {
            var frame=new AppSnapshot { Administrator=Administrator,PawnIoInstalled=PawnIoInstalled,Board=Board,Cpu=Cpu,Gpu=Gpu };
            frame.Notices.AddRange(initialNotices);
            if(computer!=null)
            {
                try { foreach(var hardware in computer.Hardware) Read(hardware,frame.Sensors,frame.Notices); }
                catch(Exception e) { frame.Notices.Add("硬件读数获取失败："+e.Message); }
            }
            if(adlx!=null)
            {
                foreach(var port in adlx.Ports)
                    try { port.Poll(frame.Sensors,DateTime.UtcNow); }
                    catch(Exception e) { frame.Notices.Add(port.Device+"："+e.Message); }
            }
            frame.Time=DateTime.UtcNow;
            return frame;
        }

        public void Dispose()
        {
            Exception failure=null;
            if(computer!=null) { try { computer.Close(); } catch(Exception e) { failure=e; } finally { computer=null; } }
            if(adlx!=null) { try { adlx.Dispose(); } catch(Exception e) { failure=e; } finally { adlx=null; } }
            ports.Clear();
            if(failure!=null) throw failure;
        }
    }

    public sealed class EngineCommand
    {
        public string Kind;
        public FanProfile Profile;
        public string RequestId;
        public string Mode;
        public List<FanProfile> Profiles;
    }

    public sealed class FanEngine
    {
        private readonly ConcurrentQueue<EngineCommand> commands=new ConcurrentQueue<EngineCommand>();
        private readonly AutoResetEvent wake=new AutoResetEvent(false);
        private readonly List<ControlSession> sessions=new List<ControlSession>();
        private readonly List<string> shutdownErrors=new List<string>();
        private Thread worker;
        private volatile bool stopping;
        private string coolingMode;
        public event Action<AppSnapshot> Updated;
        public event Action<FanProfile,string,bool> Completed;
        public event Action<string,string,bool> RequestCompleted;
        public event Action<SmartResult> SmartCompleted;
        public IList<string> ShutdownErrors { get { lock(shutdownErrors) return shutdownErrors.ToArray(); } }

        public void Start()
        {
            worker=new Thread(Run) { IsBackground=true,Name="cinna-fanCon hardware worker" };
            worker.SetApartmentState(ApartmentState.MTA); worker.Start();
        }
        public void Enqueue(string kind,FanProfile profile,string requestId=null)
        {
            if(stopping) return;
            commands.Enqueue(new EngineCommand { Kind=kind,Profile=profile==null?null:profile.Clone(),RequestId=requestId }); wake.Set();
        }
        public void EnqueueSmart(string mode,IEnumerable<FanProfile> profiles,string requestId)
        {
            if(stopping) return;
            commands.Enqueue(new EngineCommand { Kind="smart",Mode=mode,Profiles=profiles.Select(p=>p.Clone()).ToList(),RequestId=requestId });wake.Set();
        }
        public void EnqueuePlan(IEnumerable<FanProfile> profiles,string requestId)
        {
            if(stopping)return;
            commands.Enqueue(new EngineCommand {Kind="plan",Mode="自定义",Profiles=profiles.Select(p=>p.Clone()).ToList(),RequestId=requestId});wake.Set();
        }

        private void Notify(FanProfile p,string message,bool success,string requestId=null)
        {
            var handler=Completed; if(handler!=null) handler(p,message,success);
            var request=RequestCompleted;if(requestId!=null && request!=null) request(requestId,message,success);
        }

        private void ReleaseAll()
        {
            foreach(var session in sessions)
            {
                try { session.Release(); }
                catch(Exception e) { session.Error=e.Message; session.Status="恢复失败 · 请重试"; }
            }
        }

        private void Tick(ControlSession session,AppSnapshot frame)
        {
            try { session.Tick(frame.Sensors,DateTime.UtcNow); }
            catch(Exception e)
            {
                string error=e.Message;
                try { session.Release(); session.Status="调节失败 · 已恢复原设置"; }
                catch(Exception restore) { error+=" 恢复失败："+restore.Message; session.Profile=null; session.Status="恢复失败 · 请重试"; }
                session.Error=error;
            }
        }

        private void Run()
        {
            HardwareBackend backend=null;
            try
            {
                backend=new HardwareBackend(); backend.Open();
                foreach(var port in backend.Ports) sessions.Add(new ControlSession(port));
                while(true)
                {
                  while(!stopping)
                  {
                    AppSnapshot frame=backend.Poll();
                    EngineCommand command;
                    while(commands.TryDequeue(out command))
                    {
                        if(command.Kind=="release")
                        {
                            ReleaseAll();
                            bool ok=sessions.All(s=>!s.Owned);
                            coolingMode=null;
                            Notify(null,ok?"已恢复风扇原设置。":"部分风扇未能恢复。请在“风扇设置”中选择“恢复原设置”并应用。",ok,command.RequestId);
                        }
                        else if(command.Kind=="rescan")
                        {
                            ReleaseAll();
                            if(sessions.Any(s=>s.Owned)) { Notify(null,"部分风扇未能恢复，请先点击“恢复原设置”重试，再重新检测。",false,command.RequestId); continue; }
                            backend.Dispose(); sessions.Clear();
                            backend=new HardwareBackend(); backend.Open();
                            foreach(var port in backend.Ports) sessions.Add(new ControlSession(port));
                            coolingMode=null;frame=backend.Poll(); Notify(null,"硬件检测完成。",true,command.RequestId);
                        }
                        else if(command.Kind=="smart" || command.Kind=="plan")
                        {
                            frame.Channels=sessions.Select(s=>s.View()).ToList();
                            var result=new SmartResult { Id=command.RequestId,Mode=command.Mode };
                            try
                            {
                                CoolingPlan plan;
                                if(command.Kind=="plan")
                                {
                                    string error=CoolingPlanner.ValidateExplicit(frame,command.Profiles,DateTime.UtcNow);
                                    if(error!=null)throw new ArgumentException(error);
                                    plan=new CoolingPlan {Profiles=command.Profiles};
                                }
                                else plan=CoolingPlanner.Create(frame,command.Mode,command.Profiles,DateTime.UtcNow);
                                result.Skipped=plan.Skipped;
                                foreach(var profile in plan.Profiles)
                                {
                                    var session=sessions.First(s=>s.Port.Id==profile.Id);
                                    try
                                    {
                                        session.Apply(profile);Tick(session,frame);
                                        if(session.Error==null) result.Applied.Add(profile.Clone());
                                        else result.Errors.Add(new ChannelIssue { Id=profile.Id,Name=profile.Name,Reason=session.Error });
                                    }
                                    catch(Exception e) { result.Errors.Add(new ChannelIssue { Id=profile.Id,Name=profile.Name,Reason=e.Message }); }
                                }
                                if(result.Applied.Count>0) coolingMode=result.Errors.Count==0?command.Mode:"自定义";
                            }
                            catch(Exception e) { result.Errors.Add(new ChannelIssue { Reason=e.Message }); }
                            var smart=SmartCompleted;if(smart!=null) smart(result);
                        }
                        else if(command.Kind=="apply")
                        {
                            frame.Channels=sessions.Select(s=>s.View()).ToList();
                            string invalid=CoolingPlanner.ValidateExplicit(frame,new[]{command.Profile},DateTime.UtcNow);
                            if(invalid!=null){Notify(command.Profile,invalid,false,command.RequestId);continue;}
                            var session=sessions.FirstOrDefault(s=>s.Port.Id==command.Profile.Id);
                            if(session==null) { Notify(command.Profile,"未找到这组风扇，请重新检测。",false,command.RequestId); continue; }
                            try
                            {
                                session.Apply(command.Profile); Tick(session,frame);coolingMode="自定义";
                                Notify(command.Profile,session.Error==null?"设置已应用。":session.Error,session.Error==null,command.RequestId);
                            }
                            catch(Exception e) { Notify(command.Profile,e.Message,false,command.RequestId); }
                        }
                    }
                    foreach(var session in sessions) Tick(session,frame);
                    frame.Channels=sessions.Select(s=>s.View()).ToList();
                    frame.CoolingMode=frame.Channels.Any(c=>c.Owned)?coolingMode:null;
                    var handler=Updated; if(handler!=null) handler(frame);
                    wake.WaitOne(1000);
                  }
                  ReleaseAll();
                  if(sessions.Any(s=>s.Owned))
                  {
                      // Retain the backend and its original fan snapshots so restoration can be retried.
                      foreach(var session in sessions.Where(s=>s.Owned)) session.Profile=null;
                      EngineCommand discarded;while(commands.TryDequeue(out discarded)) { }
                      Notify(null,"部分风扇未能恢复，应用将继续运行。请点击“恢复原设置”重试。",false);
                      stopping=false;
                      continue;
                  }
                  break;
                }
            }
            catch(Exception e)
            {
                Notify(null,"风扇服务已停止："+e.Message,false);
                var handler=Updated;
                if(handler!=null) handler(new AppSnapshot { Time=DateTime.UtcNow,Notices=new List<string> { "风扇服务已停止："+e.Message },Channels=sessions.Select(s=>s.View()).ToList() });
            }
            finally
            {
                ReleaseAll();
                foreach(var session in sessions.Where(s=>s.Owned))
                    lock(shutdownErrors) shutdownErrors.Add(session.Port.Name+"："+session.Error);
                if(backend!=null) { try { backend.Dispose(); } catch(Exception e) { lock(shutdownErrors) shutdownErrors.Add(e.Message); } }
            }
        }

        public bool Stop(int milliseconds)
        {
            stopping=true; wake.Set();
            return worker==null || worker.Join(milliseconds);
        }
    }
}
