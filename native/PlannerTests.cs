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
            Assert(plan.Profiles.Count==3,"legacy planner keeps GPU driver automatic by default");
            Assert(plan.Profiles[0].Source=="group/cpu","CPU fan uses CPU temperature");
            Assert(plan.Profiles[1].Source=="group/mix" && plan.Profiles[2].Source=="group/mix","case fans use the higher CPU/GPU temperature");
            Assert(plan.Skipped.Any(p=>p.Id=="demo/3"),"GPU idle-stop settings are preserved");
            Assert(frame.Channels.All(c=>!c.Owned),"planning itself never acquires hardware");
            var saved=plan.Profiles.Select(p=>p.Clone()).ToList();saved[0].Minimum=48;saved[1].Excluded=true;
            plan=CoolingPlanner.Create(frame,"静音",saved,now);
            Assert(plan.Profiles.Count==2 && plan.Skipped.Count==2,"excluded fan remains outside smart control");
            Assert(plan.Profiles.First(p=>p.Id==saved[0].Id).Minimum==48,"calibrated minimum preserved across presets");
            frame.Sensors.RemoveAll(s=>s.Group=="CPU");plan=CoolingPlanner.Create(frame,"均衡",new List<FanProfile>(),now);
            Assert(plan.Profiles.Count==0,"missing CPU sensor cannot activate motherboard fans and GPU remains automatic");
            frame=DemoData.Create();frame.Sensors.RemoveAll(s=>s.Group=="GPU");plan=CoolingPlanner.Create(frame,"均衡",new List<FanProfile>(),now);
            Assert(plan.Profiles.Count==3 && plan.Profiles.All(p=>p.Source=="group/cpu"),"CPU-only machine needs no manual sensor pairing");
            frame=DemoData.Create();frame.Channels[1].Name="AIO Pump";plan=CoolingPlanner.Create(frame,"均衡",new List<FanProfile>(),now);
            Assert(plan.Profiles.Count==2 && plan.Skipped.Any(s=>s.Reason.Contains("水泵")),"pump is not silently included in a fan preset");
            plan=CoolingPlanner.Create(DemoData.Create(),"均衡",new List<FanProfile>(),now.AddSeconds(5));
            Assert(plan.Profiles.Count==0,"stale readings cannot start smart control");
            var original=saved[0];Assert(original.Clone().Minimum==48,"profile clone retains calibrated floor");
            var json=Wire.Encode(new WireMessage {Type="command",Id="test",Action="apply",Profile=saved[1]});
            Assert(Wire.Decode(json).Profile.Excluded==true,"profile exclusion survives bridge serialization");
            frame=DemoData.Create();now=frame.Time;
            frame.Channels[1].Name="Fan #1";
            Assert(CoolingPlanner.Role(frame.Channels[1])=="Unknown","generic ports are not assumed to be case fans");
            plan=CoolingPlanner.Create(frame,"静音",new List<FanProfile>(),now);
            Assert(plan.Profiles.Count==2,"anonymous ports remain unchanged");
            var explicitProfile=new FanProfile {Id="demo/1",Name="Case",Role="Case",Mode=FanMode.Curve,Source="group/mix",Minimum=47,RiseSeconds=5,FallSeconds=30,Points=FanProfile.Preset("静音")};
            Assert(CoolingPlanner.ValidateExplicit(frame,new[]{explicitProfile},now)==null,"explicitly identified port accepts exact reviewed parameters");
            Assert(explicitProfile.Minimum==47 && explicitProfile.Points[0].Duty==30,"validation never regenerates reviewed settings");
            Assert(frame.Channels.All(c=>!c.Owned),"validation cannot acquire ports");
            var unknown=explicitProfile.Clone();unknown.Role="Unknown";
            Assert(CoolingPlanner.ValidateExplicit(frame,new[]{unknown},now)!=null,"unconfirmed port cannot be controlled");
            Assert(CoolingPlanner.ValidateExplicit(frame,new[]{explicitProfile,explicitProfile},now)!=null,"duplicate ports rejected before application");
            Assert(CoolingPlanner.ValidateExplicit(frame,new[]{explicitProfile},now.AddSeconds(5))!=null,"stale plan rejected");
            var removed=explicitProfile.Clone();removed.Id="removed";
            Assert(CoolingPlanner.ValidateExplicit(frame,new[]{explicitProfile,removed},now)!=null,"an invalid trailing entry rejects the whole plan");
            frame.Channels[1].Name="AIO Pump";
            Assert(CoolingPlanner.ValidateExplicit(frame,new[]{explicitProfile},now)!=null,"detected pump cannot be overridden by a submitted role");
            explicitProfile.Mode=FanMode.Hardware;
            Assert(CoolingPlanner.ValidateExplicit(frame,new[]{explicitProfile},now)==null,"pump restoration remains available");
            frame=DemoData.Create();now=frame.Time;explicitProfile.Mode=FanMode.Curve;
            frame.Sensors.RemoveAll(s=>s.Group=="GPU");
            Assert(CoolingPlanner.ValidateExplicit(frame,new[]{explicitProfile},now)!=null,"missing mixed temperature rejects start");
            explicitProfile.Source="group/cpu";
            Assert(CoolingPlanner.ValidateExplicit(frame,new[]{explicitProfile},now)==null,"explicit CPU-only source accepted");
            json=Wire.Encode(new WireMessage {Type="command",Id="plan",Action="plan",Profiles=new List<FanProfile>{explicitProfile}});
            var roundTrip=Wire.Decode(json).Profiles[0];
            Assert(roundTrip.Role=="Case" && roundTrip.RiseSeconds==5 && roundTrip.FallSeconds==30 && roundTrip.Minimum==47,"role, timings and reviewed parameters survive the wire");
            var legacy=Wire.Decode("{\"Type\":\"command\",\"Action\":\"apply\",\"Profile\":{\"Id\":\"demo/0\",\"Mode\":1,\"Manual\":50,\"Minimum\":30}}").Profile;
            Assert(legacy.Role==null && !legacy.RiseSeconds.HasValue && !legacy.FallSeconds.HasValue && legacy.Validate()==null,"legacy profiles remain readable without new fields");
            var large=new WireMessage {Type="snapshot",Snapshot=DemoData.Create(),Profiles=new List<FanProfile>()};large.Snapshot.Channels.Clear();
            for(int i=0;i<64;i++)
            {
                var p=new FanProfile {Id="many/"+i,Name=new string('F',60),Mode=FanMode.Curve,Role="Case",Source="group/mix",RiseSeconds=5,FallSeconds=30,
                    Points=Enumerable.Range(0,12).Select(n=>new CurvePoint(20+n*5,30+n*6)).ToList()};
                large.Profiles.Add(p);large.Snapshot.Channels.Add(new ChannelView {Id=p.Id,Name=p.Name,Device="Demo",Group="主板",Mode=p.Mode,Owned=true,ActiveProfile=p.Clone()});
            }
            string largeJson=Wire.Encode(large);
            Assert(largeJson.Length>65536 && Wire.Decode(largeJson).Snapshot.Channels.Count==64,"bounded wire packets accommodate both saved and actual profiles for 64 channels");
            try {Wire.Decode(new string(' ',Wire.MaximumMessageLength+1));Assert(false,"oversized packet must fail");}catch(System.IO.InvalidDataException) { }
            return "PASS  Quiet-first inclusion, explicit roles, GPU automatic, pump and unknown-port exclusion, exact plan validation, stale/missing sensors, duplicate and removed channels, wire round-trip and legacy profiles.\r\n";
        }
    }
}
