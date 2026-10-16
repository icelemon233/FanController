using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Serialization;

namespace CinnaFanCon
{
    [DataContract]
    public sealed class ChannelRecommendation
    {
        [DataMember] public string Id;
        [DataMember] public string Role;
        [DataMember] public string Source;
        [DataMember] public string SourceLabel;
        [DataMember] public bool Eligible;
        [DataMember] public string Reason;
    }
    [DataContract]
    public sealed class ChannelIssue
    {
        [DataMember] public string Id;
        [DataMember] public string Name;
        [DataMember] public string Reason;
    }
    [DataContract]
    public sealed class SmartResult
    {
        [DataMember] public string Id;
        [DataMember] public string Mode;
        [DataMember] public List<FanProfile> Applied=new List<FanProfile>();
        [DataMember] public List<ChannelIssue> Skipped=new List<ChannelIssue>();
        [DataMember] public List<ChannelIssue> Errors=new List<ChannelIssue>();
    }
    public sealed class CoolingPlan
    {
        public List<FanProfile> Profiles=new List<FanProfile>();
        public List<ChannelIssue> Skipped=new List<ChannelIssue>();
    }
    public static class CoolingPlanner
    {
        public static bool ValidMode(string mode) { return mode=="静音" || mode=="均衡" || mode=="强冷"; }
        public static string Role(ChannelView channel)
        {
            if(channel.Group=="GPU") return "GPU";
            string name=(channel.Name??"").ToLowerInvariant();
            if(name.Contains("pump") || name.Contains("水泵")) return "Pump";
            if(name.Contains("cpu") || name.Contains("processor") || name.Contains("处理器")) return "CPU";
            return "Case";
        }
        public static ChannelRecommendation Recommend(AppSnapshot frame,ChannelView channel,FanProfile stored,DateTime now)
        {
            string role=Role(channel);
            double? cpu=TemperatureSources.Resolve("group/cpu",frame.Sensors,now);
            double? gpu=TemperatureSources.Resolve("group/gpu",frame.Sensors,now);
            string source=role=="GPU"?"group/gpu":role=="CPU"?"group/cpu":cpu.HasValue && gpu.HasValue?"group/mix":"group/cpu";
            var result=new ChannelRecommendation { Id=channel.Id,Role=role,Source=source,
                SourceLabel=source=="group/gpu"?"跟随显卡温度":source=="group/mix"?"跟随 CPU / GPU 中更高的温度":"跟随 CPU 温度" };
            if(stored!=null && stored.Excluded==true) result.Reason="已设为保留原设置";
            else if(role=="Pump") result.Reason="水泵保留原设置";
            else if(!String.IsNullOrEmpty(channel.Error)) result.Reason="请先处理此风扇的控制异常";
            else if(!(channel.Group=="GPU"?gpu:cpu).HasValue) result.Reason=channel.Group=="GPU"?"等待显卡温度读数":"等待 CPU 温度读数";
            else if(!TemperatureSources.Resolve(source,frame.Sensors,now).HasValue) result.Reason="等待温度读数";
            else result.Eligible=true;
            return result;
        }
        public static CoolingPlan Create(AppSnapshot frame,string mode,IEnumerable<FanProfile> stored,DateTime now)
        {
            if(!ValidMode(mode)) throw new ArgumentException("散热模式无效。");
            var configurations=stored==null?new List<FanProfile>():stored.ToList();
            var plan=new CoolingPlan();
            foreach(var channel in frame.Channels)
            {
                var saved=configurations.FirstOrDefault(p=>p.Id==channel.Id);
                var recommendation=Recommend(frame,channel,saved,now);
                if(!recommendation.Eligible) { plan.Skipped.Add(new ChannelIssue { Id=channel.Id,Name=saved==null?channel.Name:saved.Name,Reason=recommendation.Reason });continue; }
                var profile=saved==null?new FanProfile { Id=channel.Id,Name=channel.Name,RpmId=channel.DefaultRpmId }:saved.Clone();
                profile.Mode=FanMode.Curve;profile.Source=recommendation.Source;profile.Points=FanProfile.Preset(mode);
                // Preserve a user-calibrated minimum rather than lowering it when changing presets.
                profile.Minimum=Math.Max(30,profile.Minimum);
                string error=profile.Validate();
                if(error!=null) { plan.Skipped.Add(new ChannelIssue { Id=channel.Id,Name=channel.Name,Reason="保存的设置无效，请在高级设置中修正" });continue; }
                plan.Profiles.Add(profile);
            }
            return plan;
        }
    }
}
