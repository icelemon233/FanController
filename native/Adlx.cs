// ADLX C ABI, verified against AMD GPUOpen ADLX SDK headers (ISystem,
// IGPUTuning, IGPUManualFanTuning and IPerformanceMonitoring).
// Loads only the AMD driver DLL in Windows System32. No vendor GPU-wide reset.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

namespace CinnaFanCon
{
    public sealed class AdlxBackend : IDisposable
    {
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern IntPtr LoadLibraryEx(string file,IntPtr reserved,uint flags);
        [DllImport("kernel32.dll",CharSet=CharSet.Ansi,SetLastError=true)] private static extern IntPtr GetProcAddress(IntPtr module,string name);
        [DllImport("kernel32.dll")] private static extern bool FreeLibrary(IntPtr module);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int QueryVersion(out ulong version);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int Initialize(ulong version,out IntPtr system);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int Terminate();
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetPtr(IntPtr self,out IntPtr value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int QueryFn(IntPtr self,[MarshalAs(UnmanagedType.LPWStr)] string interfaceId,out IntPtr value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetGpuPtr(IntPtr self,IntPtr gpu,out IntPtr value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate uint SizeFn(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int AtFn(IntPtr self,uint index,out IntPtr value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetInt(IntPtr self,out int value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetDouble(IntPtr self,out double value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetBool(IntPtr self,out byte value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetGpuBool(IntPtr self,IntPtr gpu,out byte value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int SetInt(IntPtr self,int value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int SetBool(IntPtr self,byte value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int SetPtr(IntPtr self,IntPtr value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int ValidateStates(IntPtr self,IntPtr states,out int errorIndex);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int ReleaseFn(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int RangesFn(IntPtr self,out IntRange speed,out IntRange temperature);
        [StructLayout(LayoutKind.Sequential)] internal struct IntRange { public int Min,Max,Step; }

        private IntPtr library,system,tuning,performance;
        private bool initialized;
        private readonly List<AdlxFanPort> ports=new List<AdlxFanPort>();
        public IList<AdlxFanPort> Ports { get { return ports.AsReadOnly(); } }
        public readonly List<string> Notices=new List<string>();

        internal static T V<T>(IntPtr obj,int slot) where T:class
        {
            if(obj==IntPtr.Zero) throw new InvalidOperationException("ADLX 接口为空。");
            return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj),slot*IntPtr.Size),typeof(T)) as T;
        }
        internal static void Check(int result,string operation)
        {
            if(result<0 || result>2) throw new InvalidOperationException(operation+"失败（ADLX "+result+"）。");
        }
        internal static void Release(ref IntPtr obj) { if(obj!=IntPtr.Zero) { V<ReleaseFn>(obj,1)(obj); obj=IntPtr.Zero; } }

        public void Open()
        {
            string path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"amdadlx64.dll");
            if(!File.Exists(path)) { Notices.Add("未找到 AMD ADLX 驱动接口；AMD 显卡请安装完整的 AMD 显卡驱动。"); return; }
            library=LoadLibraryEx(path,IntPtr.Zero,0x00000800); // LOAD_LIBRARY_SEARCH_SYSTEM32
            if(library==IntPtr.Zero) throw new InvalidOperationException("无法加载 AMD 驱动接口："+Marshal.GetLastWin32Error());
            IntPtr query=GetProcAddress(library,"ADLXQueryFullVersion"), init=GetProcAddress(library,"ADLXInitialize");
            if(query==IntPtr.Zero || init==IntPtr.Zero) throw new InvalidOperationException("AMD 驱动没有 ADLX 初始化接口。");
            ulong version;
            Check(((QueryVersion)Marshal.GetDelegateForFunctionPointer(query,typeof(QueryVersion)))(out version),"读取 ADLX 版本");
            Check(((Initialize)Marshal.GetDelegateForFunctionPointer(init,typeof(Initialize)))(version,out system),"初始化 ADLX");
            initialized=true;
            Check(V<GetPtr>(system,8)(system,out tuning),"获取 GPU 风扇服务");
            Check(V<GetPtr>(system,9)(system,out performance),"获取 GPU 温度服务");
            IntPtr gpuList=IntPtr.Zero;
            try
            {
                Check(V<GetPtr>(system,1)(system,out gpuList),"枚举 AMD 显卡");
                uint count=V<SizeFn>(gpuList,3)(gpuList);
                for(uint i=0;i<count && i<16;i++)
                {
                    IntPtr gpu=IntPtr.Zero,fan=IntPtr.Zero;
                    try
                    {
                        Check(V<AtFn>(gpuList,11)(gpuList,i,out gpu),"获取显卡");
                        IntPtr namePtr; int unique;
                        Check(V<GetPtr>(gpu,7)(gpu,out namePtr),"读取显卡名称");
                        Check(V<GetInt>(gpu,18)(gpu,out unique),"读取显卡标识");
                        string name=Marshal.PtrToStringAnsi(namePtr);
                        byte supported;
                        Check(V<GetGpuBool>(tuning,10)(tuning,gpu,out supported),"检查显卡风扇支持");
                        if(supported!=0)
                        {
                            Check(V<GetGpuPtr>(tuning,16)(tuning,gpu,out fan),"获取显卡风扇接口");
                            IntPtr typedFan;
                            Check(V<QueryFn>(fan,2)(fan,"IADLXManualFanTuning",out typedFan),"查询显卡风扇接口类型");
                            Release(ref fan);fan=typedFan;
                        }
                        var port=new AdlxFanPort(gpu,fan,performance,name,unique);
                        ports.Add(port); gpu=IntPtr.Zero; fan=IntPtr.Zero;
                        if(!port.Controllable) Notices.Add(name+"：驱动未开放手动风扇控制，保留温度和转速监测。");
                    }
                    catch(Exception e) { Notices.Add("AMD 显卡检测："+e.Message); }
                    finally { Release(ref fan); Release(ref gpu); }
                }
            }
            finally { Release(ref gpuList); }
        }

        public void Poll(List<SensorReading> readings,DateTime now)
        {
            foreach(var port in ports) port.Poll(readings,now);
        }

        public void Dispose()
        {
            foreach(var port in ports) port.Dispose(); ports.Clear();
            Release(ref performance); Release(ref tuning);
            system=IntPtr.Zero; // IADLXSystem is not reference counted.
            if(initialized)
            {
                IntPtr ptr=GetProcAddress(library,"ADLXTerminate");
                if(ptr!=IntPtr.Zero) ((Terminate)Marshal.GetDelegateForFunctionPointer(ptr,typeof(Terminate)))();
                initialized=false;
            }
            if(library!=IntPtr.Zero) { FreeLibrary(library); library=IntPtr.Zero; }
        }
    }

    public sealed class AdlxFanPort : IControlPort,IDisposable
    {
        private IntPtr gpu,fan;
        private readonly IntPtr performance;
        private readonly string name,id;
        private AdlxBackend.IntRange speedRange;
        private List<CurvePoint> original;
        private byte? originalZeroRpm;
        private List<CurvePoint> temperatures;
        public bool Controllable { get; private set; }

        internal AdlxFanPort(IntPtr gpuPtr,IntPtr fanPtr,IntPtr metrics,string device,int unique)
        {
            gpu=gpuPtr; fan=fanPtr; performance=metrics; name=device; id="adlx/"+unique+"/fan";
            if(fan!=IntPtr.Zero)
            {
                AdlxBackend.IntRange temperature;
                AdlxBackend.Check(AdlxBackend.V<AdlxBackend.RangesFn>(fan,3)(fan,out speedRange,out temperature),"读取风扇范围");
                // The SDK uses percentage. Refuse an unexpected range rather than treating RPM as duty.
                Controllable=speedRange.Min>=0 && speedRange.Max<=100 && speedRange.Max>speedRange.Min;
            }
        }
        public string Id { get { return id; } }
        public string Name { get { return "显卡风扇"; } }
        public string Device { get { return name; } }
        public string Group { get { return "GPU"; } }
        public string DefaultRpmId { get { return id+"/rpm"; } }
        public double Minimum { get { return speedRange.Min; } }
        public double Maximum { get { return speedRange.Max; } }
        public List<CurvePoint> ReadCurveForDiagnosis() { return fan==IntPtr.Zero?null:ReadStates(); }

        private List<CurvePoint> ReadStates()
        {
            IntPtr list=IntPtr.Zero;
            try
            {
                AdlxBackend.Check(AdlxBackend.V<AdlxBackend.GetPtr>(fan,4)(fan,out list),"读取原风扇曲线");
                uint count=AdlxBackend.V<AdlxBackend.SizeFn>(list,3)(list);
                if(count<2 || count>16) throw new InvalidOperationException("显卡返回的风扇曲线节点数无效。");
                var result=new List<CurvePoint>();
                for(uint i=0;i<count;i++)
                {
                    IntPtr state=IntPtr.Zero;
                    try
                    {
                        AdlxBackend.Check(AdlxBackend.V<AdlxBackend.AtFn>(list,11)(list,i,out state),"读取风扇节点");
                        int speed,t;
                        AdlxBackend.Check(AdlxBackend.V<AdlxBackend.GetInt>(state,3)(state,out speed),"读取风扇输出");
                        AdlxBackend.Check(AdlxBackend.V<AdlxBackend.GetInt>(state,5)(state,out t),"读取风扇温度");
                        result.Add(new CurvePoint(t,speed));
                    }
                    finally { AdlxBackend.Release(ref state); }
                }
                return result;
            }
            finally { AdlxBackend.Release(ref list); }
        }

        private void SetStates(List<CurvePoint> points)
        {
            IntPtr list=IntPtr.Zero;
            try
            {
                AdlxBackend.Check(AdlxBackend.V<AdlxBackend.GetPtr>(fan,5)(fan,out list),"创建风扇曲线");
                uint count=AdlxBackend.V<AdlxBackend.SizeFn>(list,3)(list);
                if(count!=points.Count) throw new InvalidOperationException("显卡的风扇节点数发生变化。");
                for(uint i=0;i<count;i++)
                {
                    IntPtr state=IntPtr.Zero;
                    try
                    {
                        AdlxBackend.Check(AdlxBackend.V<AdlxBackend.AtFn>(list,11)(list,i,out state),"获取风扇节点");
                        AdlxBackend.Check(AdlxBackend.V<AdlxBackend.SetInt>(state,6)(state,(int)points[(int)i].Temperature),"设置节点温度");
                        AdlxBackend.Check(AdlxBackend.V<AdlxBackend.SetInt>(state,4)(state,(int)points[(int)i].Duty),"设置节点输出");
                    }
                    finally { AdlxBackend.Release(ref state); }
                }
                int errorIndex;
                int validation=AdlxBackend.V<AdlxBackend.ValidateStates>(fan,6)(fan,list,out errorIndex);
                AdlxBackend.Check(validation,"验证显卡曲线（节点 "+errorIndex+"）");
                AdlxBackend.Check(AdlxBackend.V<AdlxBackend.SetPtr>(fan,7)(fan,list),"写入显卡风扇曲线");
            }
            finally { AdlxBackend.Release(ref list); }
        }

        public void Write(double value)
        {
            if(!Controllable) throw new InvalidOperationException("此显卡未开放风扇调速。");
            if(original==null)
            {
                var saved=ReadStates();
                byte supported;
                AdlxBackend.Check(AdlxBackend.V<AdlxBackend.GetBool>(fan,8)(fan,out supported),"检查零转速功能");
                byte? savedZero=null;
                if(supported!=0)
                {
                    byte state;
                    AdlxBackend.Check(AdlxBackend.V<AdlxBackend.GetBool>(fan,9)(fan,out state),"保存零转速状态");
                    savedZero=state;
                }
                original=saved; originalZeroRpm=savedZero; temperatures=saved;
                if(savedZero.HasValue)
                    AdlxBackend.Check(AdlxBackend.V<AdlxBackend.SetBool>(fan,10)(fan,0),"切换显卡风扇控制");
            }
            int step=Math.Max(1,speedRange.Step);
            int duty=(int)Numbers.Clamp(speedRange.Min+Math.Round((value-speedRange.Min)/step)*step,speedRange.Min,speedRange.Max);
            var flat=new List<CurvePoint>();
            foreach(var point in temperatures) flat.Add(new CurvePoint(point.Temperature,duty));
            SetStates(flat);
        }

        public void Restore()
        {
            if(original==null) return;
            Exception failure=null;
            try { SetStates(original); } catch(Exception e) { failure=e; }
            try
            {
                if(originalZeroRpm.HasValue) AdlxBackend.Check(AdlxBackend.V<AdlxBackend.SetBool>(fan,10)(fan,originalZeroRpm.Value),"恢复零转速状态");
            }
            catch(Exception e) { failure=failure==null?e:new AggregateException(failure,e); }
            if(failure!=null) throw failure;
            original=null; originalZeroRpm=null; temperatures=null;
        }

        public void Poll(List<SensorReading> readings,DateTime now)
        {
            IntPtr metric=IntPtr.Zero;
            try
            {
                AdlxBackend.Check(AdlxBackend.V<AdlxBackend.GetGpuPtr>(performance,18)(performance,gpu,out metric),"读取显卡数据");
                double t; int rpm;
                if(AdlxBackend.V<AdlxBackend.GetDouble>(metric,7)(metric,out t)==0 && Numbers.Finite(t))
                    readings.Add(new SensorReading { Id=id+"/temperature",Name="GPU 核心",Device=name,Group="GPU",Kind="Temperature",Value=t,Time=now });
                if(AdlxBackend.V<AdlxBackend.GetDouble>(metric,8)(metric,out t)==0 && Numbers.Finite(t))
                    readings.Add(new SensorReading { Id=id+"/hotspot",Name="GPU 热点",Device=name,Group="GPU",Kind="Temperature",Value=t,Time=now });
                if(AdlxBackend.V<AdlxBackend.GetInt>(metric,11)(metric,out rpm)==0)
                    readings.Add(new SensorReading { Id=DefaultRpmId,Name="显卡风扇",Device=name,Group="GPU",Kind="Fan",Value=rpm,Time=now });
            }
            finally { AdlxBackend.Release(ref metric); }
        }

        public void Dispose()
        {
            // The engine restores all owned channels before disposing the backends.
            AdlxBackend.Release(ref fan); AdlxBackend.Release(ref gpu);
        }
    }
}
