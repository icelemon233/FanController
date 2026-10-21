using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using CinnaFanCon;

// This fixture never opens hardware. Each copy lives in a disposable directory.
internal static class ConnectionFixture
{
    private static int Main(string[] args)
    {
        string root=AppDomain.CurrentDomain.BaseDirectory;
        string mode=File.ReadAllText(Path.Combine(root,"fixture-mode.txt"));
        if(mode=="StartupExit")return 7;
        var values=new Dictionary<string,string>();
        for(int i=0;i<args.Length-1;i++)if(args[i].StartsWith("--")&&args[i]!="--demo")values[args[i]]=args[++i];
        using(var pipe=new NamedPipeClientStream(".",values["--pipe"],PipeDirection.InOut,PipeOptions.Asynchronous))
        {
            pipe.Connect(5000);
            var writer=new StreamWriter(pipe,new UTF8Encoding(false)){AutoFlush=true};
            writer.WriteLine(Wire.Encode(new WireMessage {Type="hello",Token=values["--token"],Success=true}));
            bool stop=false;
            var input=new Thread(delegate()
            {
                try
                {
                    var reader=new StreamReader(pipe,Encoding.UTF8);
                    string line;while((line=reader.ReadLine())!=null)
                    {
                        if(Wire.Decode(line).Action!="stop")continue;
                        File.WriteAllText(Path.Combine(root,"stop-requested.txt"),"requested");
                        if(mode!="RefuseStop")stop=true;
                    }
                }
                catch{ }
            }){IsBackground=true};input.Start();
            int frames=0;
            while(!stop&&!File.Exists(Path.Combine(root,"cleanup.txt")))
            {
                if(File.Exists(Path.Combine(root,"disconnect.txt")))
                {
                    if(mode=="Eof"){pipe.Dispose();Thread.Sleep(200);return 0;}
                    for(int burst=0;burst<30;burst++)writer.WriteLine(Wire.Encode(new WireMessage {Type="snapshot",Snapshot=DemoData.Create(),
                        Profiles=new List<FanProfile>(),Recommendations=new List<ChannelRecommendation>()}));
                    return 23;
                }
                if(mode!="NoSnapshot"&&(mode!="RefuseStop"||frames==0))
                {
                    writer.WriteLine(Wire.Encode(new WireMessage {Type="snapshot",Snapshot=DemoData.Create(),
                        Profiles=new List<FanProfile>(),Recommendations=new List<ChannelRecommendation>()}));
                    frames++;
                }
                Thread.Sleep(80);
            }
        }
        return 0;
    }
}
