using System;
using System.Collections.Generic;
using System.Linq;

namespace CinnaFanCon
{
    // All tests use fake ports. No hardware is opened or written.
    public static class CoreTests
    {
        private sealed class Port : IControlPort
        {
            public string Id { get { return "fake"; } }
            public string Name { get { return "fake fan"; } }
            public string Device { get { return "test"; } }
            public string Group { get { return "主板"; } }
            public string DefaultRpmId { get { return null; } }
            public double Minimum { get { return 0; } }
            public double Maximum { get { return 100; } }
            public List<double> Writes=new List<double>();
            public int Restores;
            public bool FailWrite,FailRestore;
            public void Write(double value) { Writes.Add(value);if(FailWrite)throw new InvalidOperationException("simulated write failure"); }
            public void Restore() { Restores++;if(FailRestore)throw new InvalidOperationException("simulated restore failure"); }
        }
        private static void Assert(bool condition,string message) { if(!condition)throw new Exception("FAIL: "+message); }
        private static List<SensorReading> Readings(DateTime now,double cpu,double gpu)
        {
            return new List<SensorReading> {
                new SensorReading { Id="cpu",Group="CPU",Kind="Temperature",Name="CPU",Value=cpu,Time=now },
                new SensorReading { Id="gpu",Group="GPU",Kind="Temperature",Name="GPU core",Value=gpu,Time=now }
            };
        }
        public static string Run()
        {
            var passed=new List<string>();
            Assert(!HardwareBackend.CreateMonitor(new[]{@"PCI\VEN_1002&DEV_TEST"},true).IsGpuEnabled,"AMD ADLX must not also open legacy ADL");
            Assert(!HardwareBackend.CreateMonitor(new[]{@"PCI\VEN_1002&DEV_TEST"},false).IsGpuEnabled,"AMD without ADLX must not fall back to legacy ADL");
            Assert(!HardwareBackend.CreateMonitor(new[]{@"PCI\VEN_10DE&DEV_TEST",@"PCI\VEN_1002&DEV_TEST"},false).IsGpuEnabled,"hybrid AMD systems must not initialize legacy ADL");
            Assert(!HardwareBackend.CreateMonitor(null,false).IsGpuEnabled,"unknown GPU identity fails closed");
            Assert(HardwareBackend.CreateMonitor(new[]{@"PCI\VEN_10DE&DEV_TEST"},false).IsGpuEnabled,"NVIDIA-only monitoring remains enabled");
            Assert(HardwareBackend.CreateMonitor(new[]{@"PCI\VEN_8086&DEV_TEST"},false).IsCpuEnabled,"CPU monitoring remains enabled independently of GPU selection");
            passed.Add("AMD ADLX isolation, no legacy ADL fallback, hybrid and unknown adapters, NVIDIA and CPU monitoring");
            var profile=new FanProfile { Id="fake",Mode=FanMode.Curve,Source="group/cpu" };
            Assert(profile.Validate()==null,"default profile valid");
            Assert(Math.Abs(profile.Evaluate(52.5)-47.5)<0.001,"piecewise linear interpolation");
            Assert(profile.Evaluate(10)==30 && profile.Evaluate(150)==100,"curve endpoint clamps");
            profile.Minimum=65;Assert(profile.Evaluate(30)==65,"minimum duty overrides low curve");profile.Minimum=30;
            passed.Add("Curve interpolation, endpoint clamp, minimum duty");
            var invalid=profile.Clone();invalid.Points[1].Temperature=30;Assert(invalid.Validate()!=null,"duplicate temperature rejected");
            invalid=profile.Clone();invalid.Points[2].Duty=Double.NaN;Assert(invalid.Validate()!=null,"NaN duty rejected");
            invalid=profile.Clone();invalid.Points[2].Duty=20;Assert(invalid.Validate()!=null,"decreasing curve rejected");
            invalid=profile.Clone();invalid.Mode=(FanMode)900;Assert(invalid.Validate()!=null,"unknown mode rejected");
            passed.Add("Invalid curve order, NaN and mode rejection");
            DateTime t=DateTime.UtcNow;var readings=Readings(t,48,54);
            Assert(TemperatureSources.Resolve("group/mix",readings,t)==54,"mixed source max");
            readings.RemoveAt(0);Assert(!TemperatureSources.Resolve("group/mix",readings,t).HasValue,"mixed source requires both sensors");
            readings=Readings(t,0,54);Assert(!TemperatureSources.Resolve("group/cpu",readings,t).HasValue,"invalid zero CPU temperature rejected");
            readings=Readings(t,48,54);Assert(!TemperatureSources.Resolve("group/cpu",readings,t.AddSeconds(4)).HasValue,"stale source rejected");
            passed.Add("Sensor freshness, zero reading rejection, incomplete mixed source");
            var port=new Port();var session=new ControlSession(port);
            session.Tick(Readings(t,48,54),t);Assert(port.Writes.Count==0 && port.Restores==0,"startup performs no writes or resets");
            session.Apply(profile);session.Tick(Readings(t,60,54),t);Assert(port.Writes.Last()==55 && session.Owned,"curve application");
            session.Tick(Readings(t.AddSeconds(1),20,54),t.AddSeconds(1));Assert(port.Writes.Last()==52,"downward slew limit");
            session.Tick(Readings(t.AddSeconds(2),96,54),t.AddSeconds(2));Assert(port.Writes.Last()==100,"overheat jumps to full speed");
            session.Release();Assert(port.Restores==1 && !session.Owned,"release restores owned port");
            session.Release();Assert(port.Restores==1,"unowned release has no write");
            passed.Add("No startup writes; curve control, smooth descent, emergency ascent, restoration");
            port=new Port();session=new ControlSession(port);session.Apply(profile);session.Tick(new List<SensorReading>(),t);
            Assert(port.Writes.Last()==100 && session.Status.Contains("不可用"),"missing sensor full speed");
            session.Release();
            profile.Mode=FanMode.Manual;profile.Manual=45;
            session.Apply(profile);session.Tick(Readings(t,95,54),t);Assert(port.Writes.Last()==100,"manual overheat protection");
            session.Release();passed.Add("Missing sensor and manual-mode thermal protection");
            var smooth=new FanProfile {Id="fake",Role="CPU",Mode=FanMode.Curve,Source="group/cpu",Minimum=30,RiseSeconds=3,FallSeconds=20,
                Points=new List<CurvePoint>{new CurvePoint(30,40),new CurvePoint(50,40),new CurvePoint(65,55),new CurvePoint(75,75),new CurvePoint(85,100)}};
            port=new Port();session=new ControlSession(port);session.Apply(smooth);session.Tick(Readings(t,40,54),t);
            session.Tick(Readings(t.AddSeconds(1),80,54),t.AddSeconds(1));double spike=port.Writes.Last();
            Assert(spike<60,"a short normal temperature spike is smoothed");
            session.Tick(Readings(t.AddSeconds(2),80,54),t.AddSeconds(2));Assert(port.Writes.Last()>spike,"sustained load still increases output");
            session.Tick(Readings(t.AddSeconds(3),85,54),t.AddSeconds(3));Assert(port.Writes.Last()==100,"raw full-speed curve endpoint bypasses smoothing");
            session.Tick(new List<SensorReading>(),t.AddSeconds(4));Assert(port.Writes.Last()==100,"missing readings bypass long response smoothing");
            var view=session.View();Assert(view.ActiveProfile!=null && view.ActiveProfile.RiseSeconds==3,"actual running parameters are published independently of persistence");
            view.ActiveProfile.Points[0].Duty=99;Assert(session.Profile.Points[0].Duty==40,"active profile snapshots do not mutate a running session");
            session.Release();
            invalid=smooth.Clone();invalid.RiseSeconds=Double.PositiveInfinity;Assert(invalid.Validate()!=null,"infinite smoothing rejected");
            invalid=smooth.Clone();invalid.FallSeconds=-1;Assert(invalid.Validate()!=null,"negative smoothing rejected");
            passed.Add("Quiet response smooths transients; full-speed endpoint and missing readings bypass smoothing; actual parameter snapshots are isolated");
            port=new Port { FailWrite=true };session=new ControlSession(port);session.Apply(profile);
            try { session.Tick(Readings(t,48,54),t);Assert(false,"write failure must throw"); } catch(InvalidOperationException) { }
            Assert(session.Owned,"partial write retains ownership for rollback");session.Release();Assert(port.Restores==1 && !session.Owned,"failed-write rollback");
            port=new Port();session=new ControlSession(port);session.Apply(profile);session.Tick(Readings(t,48,54),t);port.FailRestore=true;
            try { session.Release();Assert(false,"restore failure must throw"); } catch(InvalidOperationException) { }
            Assert(session.Owned,"failed restore preserves ownership");port.FailRestore=false;session.Release();Assert(!session.Owned && port.Restores==2,"restoration can be retried");
            passed.Add("Partial write rollback and failed restoration retry");
            return "PASS: "+passed.Count+" test groups\r\n\r\n"+String.Join("\r\n",passed.Select(s=>"PASS  "+s))+"\r\n\r\nAll tests use fake ports; no hardware writes.\r\n";
        }
    }
}
