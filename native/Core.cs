using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace CinnaFanCon
{
    public enum FanMode { Hardware, Manual, Curve }

    [DataContract]
    public sealed class CurvePoint
    {
        [DataMember] public double Temperature;
        [DataMember] public double Duty;
        public CurvePoint() { }
        public CurvePoint(double t, double d) { Temperature = t; Duty = d; }
    }

    [DataContract]
    public sealed class FanProfile
    {
        [DataMember] public string Id;
        [DataMember] public string Name;
        [DataMember] public FanMode Mode = FanMode.Hardware;
        [DataMember] public string Source = "group/mix";
        [DataMember] public string RpmId;
        [DataMember] public double Manual = 50;
        [DataMember] public double Minimum = 30;
        [DataMember(EmitDefaultValue=false)] public bool? Excluded;
        [DataMember] public List<CurvePoint> Points = Preset("均衡");

        public static List<CurvePoint> Preset(string name)
        {
            if (name == "静音") return new List<CurvePoint> { new CurvePoint(30,30), new CurvePoint(45,30), new CurvePoint(60,45), new CurvePoint(75,70), new CurvePoint(85,100) };
            if (name == "强冷") return new List<CurvePoint> { new CurvePoint(30,45), new CurvePoint(45,55), new CurvePoint(60,70), new CurvePoint(75,90), new CurvePoint(85,100) };
            return new List<CurvePoint> { new CurvePoint(30,30), new CurvePoint(45,40), new CurvePoint(60,55), new CurvePoint(75,75), new CurvePoint(85,100) };
        }

        public FanProfile Clone()
        {
            return new FanProfile { Id = Id, Name = Name, Mode = Mode, Source = Source, RpmId = RpmId,
                Manual = Manual, Minimum = Minimum, Excluded = Excluded, Points = Points == null ? null : Points.Select(p => new CurvePoint(p.Temperature,p.Duty)).ToList() };
        }

        public string Validate()
        {
            if (String.IsNullOrWhiteSpace(Id)) return "没有选择风扇通道。";
            if (!Numbers.Finite(Minimum) || Minimum < 20 || Minimum > 100) return "最低输出需要在 20–100% 之间。";
            if (!Numbers.Finite(Manual) || Manual < 0 || Manual > 100) return "手动输出需要在 0–100% 之间。";
            if (Mode != FanMode.Hardware && Mode != FanMode.Manual && Mode != FanMode.Curve) return "控制模式无效。";
            if (Mode != FanMode.Curve) return null;
            if (Points == null || Points.Count < 2 || Points.Count > 12) return "温度曲线需要 2–12 个节点。";
            for (int i=0; i<Points.Count; i++)
            {
                CurvePoint p = Points[i];
                if (p == null || !Numbers.Finite(p.Temperature) || !Numbers.Finite(p.Duty) || p.Temperature < 20 || p.Temperature > 110 || p.Duty < 0 || p.Duty > 100)
                    return "曲线温度需要在 20–110°C、输出在 0–100% 之间。";
                if (i > 0 && (p.Temperature <= Points[i-1].Temperature || p.Duty < Points[i-1].Duty))
                    return "温度必须递增，输出不能随温度升高而下降。";
            }
            if (Mode == FanMode.Curve && String.IsNullOrWhiteSpace(Source)) return "请选择曲线的温度来源。";
            return null;
        }

        public double Evaluate(double temperature)
        {
            if (!Numbers.Finite(temperature)) throw new ArgumentOutOfRangeException("temperature");
            if (temperature <= Points[0].Temperature) return Math.Max(Minimum, Points[0].Duty);
            for(int i=1; i<Points.Count; i++)
            {
                if (temperature <= Points[i].Temperature)
                {
                    CurvePoint a = Points[i-1], b=Points[i];
                    return Math.Max(Minimum, a.Duty+(b.Duty-a.Duty)*(temperature-a.Temperature)/(b.Temperature-a.Temperature));
                }
            }
            return Math.Max(Minimum,Points[Points.Count-1].Duty);
        }
    }

    public static class Numbers
    {
        public static bool Finite(double v) { return !Double.IsNaN(v) && !Double.IsInfinity(v); }
        public static double Clamp(double v, double a, double b) { return Math.Max(a,Math.Min(b,v)); }
    }

    [DataContract]
    public sealed class SensorReading
    {
        [DataMember] public string Id;
        [DataMember] public string Name;
        [DataMember] public string Device;
        [DataMember] public string Group;
        [DataMember] public string Kind;
        [DataMember] public double? Value;
        [DataMember] public DateTime Time;
        public string Label { get { return Device+" · "+Name; } }
        public string Display { get { return !Value.HasValue ? "—" : Value.Value.ToString(Kind=="Fan" ? "0" : "0.0")+(Kind=="Fan" ? " RPM" : Kind=="Temperature" ? " °C" : " %"); } }
        public bool IsFresh(DateTime now) { return Value.HasValue && Numbers.Finite(Value.Value) && (now-Time).TotalSeconds <= 3 && (now-Time).TotalSeconds >= -1; }
    }

    public static class TemperatureSources
    {
        public static double? Resolve(string source, IList<SensorReading> readings, DateTime now)
        {
            if (source == "group/mix")
            {
                double? cpu = Resolve("group/cpu",readings,now), gpu=Resolve("group/gpu",readings,now);
                return cpu.HasValue && gpu.HasValue ? (double?)Math.Max(cpu.Value,gpu.Value) : null;
            }
            IEnumerable<SensorReading> list = readings.Where(r => r.Kind=="Temperature" && r.IsFresh(now) && r.Value > 0 && r.Value <= 150);
            if (source=="group/cpu") list=list.Where(r=>r.Group=="CPU");
            else if (source=="group/gpu")
            {
                var gpu=list.Where(r=>r.Group=="GPU").ToList();
                var core=gpu.Where(r=>!IsHotspot(r.Name) && !r.Name.ToLowerInvariant().Contains("memory") && !r.Name.ToLowerInvariant().Contains("vram")).ToList();
                list=core.Count>0 ? core : gpu;
            }
            else list=list.Where(r=>r.Id==source);
            var values=list.Select(r=>r.Value.Value).ToList();
            return values.Count==0 ? (double?)null : values.Max();
        }

        public static bool IsHotspot(string name) { string s=(name??"").ToLowerInvariant(); return s.Contains("hotspot") || s.Contains("hot spot") || s.Contains("junction") || s.Contains("热点"); }

        public static bool Overheat(IList<SensorReading> readings, DateTime now)
        {
            return readings.Any(r=>r.Kind=="Temperature" && r.IsFresh(now) &&
                ((r.Group=="CPU" && r.Value>=90) || (r.Group=="GPU" && r.Value>=(IsHotspot(r.Name)?105:90))));
        }
    }

    public interface IControlPort
    {
        string Id { get; }
        string Name { get; }
        string Device { get; }
        string Group { get; }
        string DefaultRpmId { get; }
        double Minimum { get; }
        double Maximum { get; }
        void Write(double value);
        void Restore();
    }

    [DataContract]
    public sealed class ChannelView
    {
        [DataMember] public string Id;
        [DataMember] public string Name;
        [DataMember] public string Device;
        [DataMember] public string Group;
        [DataMember] public string DefaultRpmId;
        [DataMember] public string Status;
        [DataMember] public FanMode Mode;
        [DataMember] public double? Target;
        [DataMember] public bool Owned;
        [DataMember] public string Error;
    }

    public sealed class ControlSession
    {
        public readonly IControlPort Port;
        public FanProfile Profile;
        public bool Owned;
        public double? LastTarget;
        public string Status = "硬件自动控制";
        public string Error;
        private double? heldTemperature;
        private DateTime lastWrite = DateTime.MinValue;

        public ControlSession(IControlPort port) { Port=port; }

        public void Apply(FanProfile profile)
        {
            string error=profile.Validate();
            if(error!=null) throw new ArgumentException(error);
            if(profile.Id!=Port.Id) throw new ArgumentException("配置与风扇通道不匹配。");
            if(profile.Mode==FanMode.Hardware) { Release(); return; }
            Profile=profile.Clone(); heldTemperature=null; LastTarget=null; Error=null;
        }

        public void Tick(IList<SensorReading> readings, DateTime now)
        {
            if(Profile==null || Profile.Mode==FanMode.Hardware) return;
            double? safety=TemperatureSources.Resolve(Port.Group=="GPU"?"group/gpu":"group/cpu",readings,now);
            double? source=TemperatureSources.Resolve(Profile.Source,readings,now);
            bool overheat=TemperatureSources.Overheat(readings,now);
            bool missing=!safety.HasValue || (Profile.Mode==FanMode.Curve && !source.HasValue);
            bool emergency=overheat || missing;
            double target;
            if(emergency) { target=Port.Maximum; Status=overheat ? "高温保护 · 全速" : "温度不可用 · 全速保护"; }
            else if(Profile.Mode==FanMode.Manual) { target=Profile.Manual; Status="手动控制"; }
            else
            {
                double t=source.Value;
                if(!heldTemperature.HasValue || t>=heldTemperature.Value || heldTemperature.Value-t>=3) heldTemperature=t;
                target=Profile.Evaluate(heldTemperature.Value); Status="温度曲线";
            }
            target=Numbers.Clamp(Math.Max(Profile.Minimum,target),Port.Minimum,Port.Maximum);
            bool descending=!emergency && LastTarget.HasValue && target<LastTarget.Value;
            if(descending)
            {
                double elapsed=Numbers.Clamp((now-lastWrite).TotalSeconds,0,3);
                target=Math.Max(target,LastTarget.Value-3*elapsed);
            }
            target=descending?Math.Ceiling(target):Math.Round(target);
            if(!LastTarget.HasValue || Math.Abs(target-LastTarget.Value)>=1)
            {
                // Mark ownership before any write: a failed call may have partially modified hardware.
                Owned=true;
                Port.Write(target);
                LastTarget=target; lastWrite=now;
            }
            Error=null;
        }

        public void Release()
        {
            if(Owned) Port.Restore();
            Owned=false; Profile=null; LastTarget=null; heldTemperature=null; Error=null; Status="硬件自动控制";
        }

        public ChannelView View()
        {
            return new ChannelView { Id=Port.Id,Name=Port.Name,Device=Port.Device,Group=Port.Group,DefaultRpmId=Port.DefaultRpmId,
                Status=Status,Mode=Profile==null?FanMode.Hardware:Profile.Mode,Target=LastTarget,Owned=Owned,Error=Error };
        }
    }

    [DataContract]
    public sealed class AppSnapshot
    {
        [DataMember] public List<ChannelView> Channels = new List<ChannelView>();
        [DataMember] public List<SensorReading> Sensors = new List<SensorReading>();
        [DataMember] public List<string> Notices = new List<string>();
        [DataMember] public bool Administrator;
        [DataMember] public bool PawnIoInstalled;
        [DataMember] public bool Demo;
        [DataMember] public DateTime Time;
        [DataMember] public string Board;
        [DataMember] public string Cpu;
        [DataMember] public string Gpu;
        [DataMember(EmitDefaultValue=false)] public string CoolingMode;
        [DataMember(EmitDefaultValue=false)] public Dictionary<string,List<CurvePoint>> NativeFanCurves;
    }

    [DataContract]
    public sealed class ProfileStore
    {
        [DataMember] public List<FanProfile> Profiles = new List<FanProfile>();
        public static string PathName { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"cinna-fanCon","profiles.json"); } }
        public static ProfileStore Load()
        {
            string path=PathName;
            if(!File.Exists(path))
            {
                string legacy=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"FanDesk","profiles.json");
                if(!File.Exists(legacy))return new ProfileStore();
                path=legacy;
            }
            using(var stream=File.OpenRead(path))
            {
                var store=(ProfileStore)new DataContractJsonSerializer(typeof(ProfileStore)).ReadObject(stream);
                if(store==null || store.Profiles==null) throw new InvalidDataException("配置文件内容为空。");
                return store;
            }
        }
        public FanProfile Find(ChannelView channel)
        {
            var found=Profiles.FirstOrDefault(p=>p.Id==channel.Id);
            return found!=null ? found.Clone() : new FanProfile { Id=channel.Id,Name=channel.Name,RpmId=channel.DefaultRpmId,Source=channel.Group=="GPU"?"group/gpu":"group/cpu",Mode=FanMode.Curve };
        }
        public void Save(FanProfile profile)
        {
            SaveMany(new[] { profile });
        }
        public void SaveMany(IEnumerable<FanProfile> profiles)
        {
            var incoming=profiles.Select(p=>p.Clone()).ToList();
            foreach(var profile in incoming) { string error=profile.Validate(); if(error!=null) throw new ArgumentException(error); }
            var ids=new HashSet<string>(incoming.Select(p=>p.Id));
            var all=Profiles.Where(p=>!ids.Contains(p.Id)).ToList(); all.AddRange(incoming);
            var replacement=new ProfileStore { Profiles=all };
            Directory.CreateDirectory(Path.GetDirectoryName(PathName));
            string temporary=PathName+".tmp";
            using(var stream=File.Create(temporary)) new DataContractJsonSerializer(typeof(ProfileStore)).WriteObject(stream,replacement);
            if(File.Exists(PathName)) File.Replace(temporary,PathName,PathName+".bak");
            else File.Move(temporary,PathName);
            Profiles=all;
        }
    }
}
