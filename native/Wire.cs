using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace CinnaFanCon
{
    [DataContract]
    public sealed class WireMessage
    {
        [DataMember(EmitDefaultValue=false)] public string Type;
        [DataMember(EmitDefaultValue=false)] public string Id;
        [DataMember(EmitDefaultValue=false)] public string Action;
        [DataMember(EmitDefaultValue=false)] public string Mode;
        [DataMember(EmitDefaultValue=false)] public string Token;
        [DataMember(EmitDefaultValue=false)] public string Message;
        [DataMember(EmitDefaultValue=false)] public string PersistenceError;
        [DataMember] public bool Success;
        [DataMember(EmitDefaultValue=false)] public FanProfile Profile;
        [DataMember(EmitDefaultValue=false)] public AppSnapshot Snapshot;
        [DataMember(EmitDefaultValue=false)] public List<FanProfile> Profiles;
        [DataMember(EmitDefaultValue=false)] public List<ChannelRecommendation> Recommendations;
        [DataMember] public int Applied;
        [DataMember] public int Skipped;
    }
    public static class Wire
    {
        public const int MaximumMessageLength=262144;
        public static string Encode(WireMessage message)
        {
            using(var memory=new MemoryStream())
            {
                new DataContractJsonSerializer(typeof(WireMessage)).WriteObject(memory,message);return Encoding.UTF8.GetString(memory.ToArray());
            }
        }
        public static WireMessage Decode(string json)
        {
            if(json==null || json.Length>MaximumMessageLength) throw new InvalidDataException("收到空消息或消息过长，无法处理。");
            using(var memory=new MemoryStream(Encoding.UTF8.GetBytes(json))) return (WireMessage)new DataContractJsonSerializer(typeof(WireMessage)).ReadObject(memory);
        }
    }
    public static class DemoData
    {
        public static AppSnapshot Create()
        {
            DateTime now=DateTime.UtcNow;
            var frame=new AppSnapshot { Demo=true,Administrator=true,PawnIoInstalled=true,Time=now,Board="Demo Motherboard",Cpu="Demo CPU",Gpu="Demo GPU" };
            frame.Sensors.Add(new SensorReading {Id="demo/cpu",Name="CPU 核心",Device=frame.Cpu,Group="CPU",Kind="Temperature",Value=48,Time=now});
            frame.Sensors.Add(new SensorReading {Id="demo/gpu",Name="GPU 核心",Device=frame.Gpu,Group="GPU",Kind="Temperature",Value=54,Time=now});
            frame.Sensors.Add(new SensorReading {Id="demo/hotspot",Name="GPU 热点",Device=frame.Gpu,Group="GPU",Kind="Temperature",Value=65,Time=now});
            string[] names={"CPU 散热风扇","机箱进风","机箱排风","显卡风扇"};
            int[] rpm={1120,820,940,1510};
            for(int i=0;i<4;i++)
            {
                string id="demo/"+i;string group=i==3?"GPU":"主板";
                frame.Channels.Add(new ChannelView {Id=id,Name=names[i],Group=group,Device=i==3?frame.Gpu:frame.Board,DefaultRpmId=id+"/rpm",Status="未接管"});
                frame.Sensors.Add(new SensorReading {Id=id+"/rpm",Name=names[i],Device=i==3?frame.Gpu:frame.Board,Group=group,Kind="Fan",Value=rpm[i],Time=now});
            }
            return frame;
        }
    }
}
