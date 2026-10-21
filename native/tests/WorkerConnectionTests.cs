using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using CinnaFanCon;

internal static class WorkerConnectionTests
{
    private static void Assert(bool value,string message){if(!value)throw new Exception(message);}
    private static void Wait(Func<bool> condition,int milliseconds,string message)
    {
        var timer=Stopwatch.StartNew();
        while(!condition()){if(timer.ElapsedMilliseconds>milliseconds)throw new Exception(message);Thread.Sleep(20);}
    }
    private static int Main(string[] args)
    {
        string root=AppDomain.CurrentDomain.BaseDirectory,mode=args[0],report=args[1];
        using(var client=new WorkerClient())
        {
            try
            {
                var events=new ConcurrentQueue<WireMessage>();
                client.Received+=message=>{events.Enqueue(message);if(mode=="Crash"&&message.Type=="snapshot")Thread.Sleep(3);};
                client.Start(false,true);
                if(mode=="StartupExit")
                {
                    Wait(()=>events.Any(m=>m.Type=="service-error"),3000,"Startup exit was not reported.");
                    Assert(client.HasExited&&client.Latest==null&&!client.Connected,"Startup exit left a usable connection.");
                }
                else if(mode=="NoSnapshot")
                {
                    bool timedOut=false;
                    try{client.WaitForSnapshotAsync(400,false).GetAwaiter().GetResult();}catch(TimeoutException){timedOut=true;}
                    Assert(timedOut,"A pipe handshake incorrectly counted as a fresh snapshot.");
                    Assert(client.StopAsync().GetAwaiter().GetResult(),"The idle fake worker did not exit normally.");
                    Assert(!events.Any(m=>m.Type=="service-error"),"Normal shutdown was reported as a crash.");
                }
                else
                {
                    var first=client.WaitForSnapshotAsync(3000,false).GetAwaiter().GetResult();
                    if(mode=="RefuseStop")
                    {
                        bool timedOut=false;
                        try{client.WaitForSnapshotAsync(350,true).GetAwaiter().GetResult();}catch(TimeoutException){timedOut=true;}
                        Assert(timedOut,"The cached frame incorrectly completed a fresh-read request.");
                        Assert(!client.StopAsync().GetAwaiter().GetResult(),"A worker that refused to restore/exit was treated as stopped.");
                        Assert(!client.HasExited&&File.Exists(Path.Combine(root,"stop-requested.txt")),"The refused worker was killed or never asked to stop.");
                    }
                    else
                    {
                        var second=client.WaitForSnapshotAsync(2000,true).GetAwaiter().GetResult();
                        Assert(!Object.ReferenceEquals(first,second),"Healthy refresh replayed a cached snapshot.");
                        File.WriteAllText(Path.Combine(root,"disconnect.txt"),"disconnect");
                        Wait(()=>events.Any(m=>m.Type=="service-error"),3000,"Unexpected disconnection was not reported.");
                        Assert(client.Latest==null&&!client.Connected,"Unexpected disconnection retained usable cached telemetry.");
                        bool rejected=false;
                        try{client.WaitForSnapshotAsync(1000,false).GetAwaiter().GetResult();}catch(InvalidOperationException){rejected=true;}
                        Assert(rejected,"Disconnected worker was reported as ready.");
                        Wait(()=>client.HasExited,3000,"The fake worker did not finish.");
                        Thread.Sleep(100);
                        Assert(events.Count(m=>m.Type=="service-error")==1,"EOF and process exit reported the same failure more than once.");
                        var ordered=events.ToArray();int failureIndex=Array.FindIndex(ordered,m=>m.Type=="service-error");
                        Assert(!ordered.Skip(failureIndex+1).Any(m=>m.Type=="snapshot"),"Buffered frames revived a session after process exit.");
                    }
                }
                File.WriteAllText(report,"PASS: "+mode+"; private pipe and process lifecycle; simulated worker only\r\n");return 0;
            }
            catch(Exception error)
            {
                var frame=client.Latest;
                File.WriteAllText(report,error+"\r\nConnected="+client.Connected+"; exited="+client.HasExited+
                    "; frame="+(frame==null||frame.Snapshot==null?"none":frame.Snapshot.Time.ToString("O")+" / "+frame.Snapshot.Time.Kind)+
                    "; now="+DateTime.UtcNow.ToString("O"));return 1;
            }
            finally
            {
                File.WriteAllText(Path.Combine(root,"cleanup.txt"),"cleanup");
                Wait(()=>client.HasExited,5000,"The isolated fake worker did not respond to cleanup.");
            }
        }
    }
}
