using System;
using System.Collections.Generic;
using System.Linq;

namespace CinnaFanCon
{
    public static class PlannerTests
    {
        private static void Assert(bool value,string name){if(!value)throw new Exception("FAIL: "+name);}
        public static string Run()
        {
            var frame=DemoData.Create();var now=frame.Time;
            var plan=CoolingPlanner.Create(frame,"均衡",new List<FanProfile>(),now);
            Assert(plan.Profiles.Count==4,"one action plans all available fans");
            Assert(plan.Profiles[0].Source=="group/cpu","CPU fan uses CPU temperature");
            Assert(plan.Profiles[1].Source=="group/mix" && plan.Profiles[2].Source=="group/mix","case fans use the higher CPU/GPU temperature");
            Assert(plan.Profiles[3].Source=="group/gpu","GPU fan uses GPU temperature");
            Assert(frame.Channels.All(c=>!c.Owned),"planning itself never acquires hardware");
            var saved=plan.Profiles.Select(p=>p.Clone()).ToList();saved[0].Minimum=48;saved[1].Excluded=true;
            plan=CoolingPlanner.Create(frame,"静音",saved,now);
            Assert(plan.Profiles.Count==3 && plan.Skipped.Count==1,"excluded fan remains outside smart control");
            Assert(plan.Profiles.First(p=>p.Id==saved[0].Id).Minimum==48,"calibrated minimum preserved across presets");
            frame.Sensors.RemoveAll(s=>s.Group=="CPU");plan=CoolingPlanner.Create(frame,"均衡",new List<FanProfile>(),now);
            Assert(plan.Profiles.Count==1 && plan.Profiles[0].Id=="demo/3","missing CPU sensor does not block healthy GPU or activate unsupported motherboard fans");
            frame=DemoData.Create();frame.Sensors.RemoveAll(s=>s.Group=="GPU");plan=CoolingPlanner.Create(frame,"均衡",new List<FanProfile>(),now);
            Assert(plan.Profiles.Count==3 && plan.Profiles.All(p=>p.Source=="group/cpu"),"CPU-only machine needs no manual sensor pairing");
            frame=DemoData.Create();frame.Channels[1].Name="AIO Pump";plan=CoolingPlanner.Create(frame,"均衡",new List<FanProfile>(),now);
            Assert(plan.Profiles.Count==3 && plan.Skipped.Any(s=>s.Reason.Contains("水泵")),"pump is not silently included in a fan preset");
            plan=CoolingPlanner.Create(DemoData.Create(),"均衡",new List<FanProfile>(),now.AddSeconds(5));
            Assert(plan.Profiles.Count==0,"stale readings cannot start smart control");
            var original=saved[0];Assert(original.Clone().Minimum==48,"profile clone retains calibrated floor");
            var json=Wire.Encode(new WireMessage {Type="command",Id="test",Action="apply",Profile=saved[1]});
            Assert(Wire.Decode(json).Profile.Excluded==true,"profile exclusion survives bridge serialization");
            return "PASS  Smart mode plans all eligible fans, automatic CPU/GPU/case sources, calibrated floors, exclusions, missing/stale sensors, pump exclusion, serialization.\r\n";
        }
    }
}
