import type { Command, CoolingMode, HostEvent, Reply, Snapshot, FanProfile } from './model';
import { preset, readTemperature } from './model';

type WebView={ postMessage(message: Command): void; addEventListener(type: 'message', listener: (event: {data: HostEvent})=>void): void; removeEventListener(type: 'message',listener: (event: {data: HostEvent})=>void): void };
declare global { interface Window { chrome?: {webview?: WebView} } }
const native=window.chrome?.webview;
const listeners=new Set<(event:HostEvent)=>void>();
const pending=new Map<string,{resolve:(reply:Reply)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
let counter=0;
const emit=(event:HostEvent)=>{ if(event.Type==='reply'){const job=pending.get(event.Id);if(job){clearTimeout(job.timer);pending.delete(event.Id);job.resolve(event);}}for(const listener of listeners)listener(event); };
native?.addEventListener('message',event=>emit(event.data));
export const desktop=Boolean(native);
export function subscribe(listener:(event:HostEvent)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function send(action:string, extras:Partial<Command>={}):Promise<Reply>{
  const Id=`ui-${++counter}`;const command:Command={Type:'command',Id,Action:action,...extras};
  if(!native)return demoCommand(command);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(Id);reject(new Error('尚未收到操作结果，请查看风扇状态后再试'));},action==='enableMotherboard'?180000:20000);pending.set(Id,{resolve,reject,timer});native.postMessage(command);});
}
export function windowAction(action:'minimize'|'maximize'|'close'|'drag'){native?.postMessage({Type:'command',Id:'',Action:action});}

const now=()=>new Date().toISOString();
const demo:Snapshot={Type:'snapshot',Snapshot:{Demo:true,Administrator:true,PawnIoInstalled:true,Time:now(),Board:'Demo Motherboard',Cpu:'Demo CPU',Gpu:'Demo GPU',Notices:[],Channels:[],Sensors:[]},Profiles:[],Recommendations:[]};
demo.Snapshot.Sensors=[['cpu','CPU 核心','CPU',48],['gpu','GPU 核心','GPU',54],['hotspot','GPU 热点','GPU',65]].map(([Id,Name,Group,Value])=>({Id:String(Id),Name:String(Name),Group:String(Group),Device:Group==='CPU'?demo.Snapshot.Cpu:demo.Snapshot.Gpu,Kind:'Temperature',Value:Number(Value),Time:now()}));
['CPU 散热风扇','机箱进风','机箱排风','显卡风扇'].forEach((Name,i)=>{
  const Id=`demo/${i}`,Group=i===3?'GPU':'主板';
  demo.Snapshot.Channels.push({Id,Name,Group,Device:i===3?demo.Snapshot.Gpu:demo.Snapshot.Board,DefaultRpmId:`${Id}/rpm`,Status:'未接管',Mode:0,Target:null,Owned:false,Error:null});
  demo.Snapshot.Sensors.push({Id:`${Id}/rpm`,Name,Group,Device:i===3?demo.Snapshot.Gpu:demo.Snapshot.Board,Kind:'Fan',Value:[1120,820,940,1510][i],Time:now()});
  demo.Recommendations.push({Id,Role:i===3?'GPU':i===0?'CPU':'Case',Source:i===3?'group/gpu':i===0?'group/cpu':'group/mix',SourceLabel:i===3?'GPU 温度（优先核心）':i===0?'CPU 最高温度':'CPU 与 GPU 的较高温度',Eligible:true,Reason:null});
});
function demoSnapshot(){demo.Snapshot.Time=now();demo.Snapshot.Sensors.forEach(s=>s.Time=demo.Snapshot.Time);emit(structuredClone(demo));}
function demoApply(profile:FanProfile){
  const channel=demo.Snapshot.Channels.find(c=>c.Id===profile.Id);if(!channel)throw new Error('未找到这组风扇，请重新检测');
  channel.Mode=profile.Excluded?0:profile.Mode;channel.Owned=channel.Mode!==0;channel.Target=channel.Owned?Math.max(profile.Minimum,profile.Mode===1?profile.Manual:55):null;channel.Status=channel.Owned?channel.Mode===1?'固定输出':'随温度调节':'未接管';
  demo.Profiles=demo.Profiles.filter(p=>p.Id!==profile.Id);demo.Profiles.push(structuredClone({...profile,Mode:channel.Mode}));
  const recommendation=demo.Recommendations.find(r=>r.Id===profile.Id)!;recommendation.Eligible=!profile.Excluded;recommendation.Reason=profile.Excluded?'已关闭“跟随主页模式”':null;
}
async function demoCommand(command:Command):Promise<Reply>{
  await new Promise(resolve=>setTimeout(resolve,180));
  const reply:Reply={Type:'reply',Id:command.Id,Success:true,Message:''};
  if(command.Action==='ready'){demoSnapshot();return reply;}
  if(command.Action==='smart'){
    const mode=command.Mode as CoolingMode;let count=0;
    demo.Snapshot.Channels.forEach(c=>{const rec=demo.Recommendations.find(r=>r.Id===c.Id)!;if(!rec.Eligible)return;const saved=demo.Profiles.find(p=>p.Id===c.Id);demoApply({Id:c.Id,Name:saved?.Name??c.Name,Mode:2,Source:rec.Source,RpmId:saved?.RpmId??c.DefaultRpmId,Minimum:Math.max(30,saved?.Minimum??30),Manual:50,Points:preset(mode)});count++;});
    demo.Snapshot.CoolingMode=mode;reply.Message=`已将 ${count} 组风扇设为${mode}模式`;reply.Applied=count;
  } else if(command.Action==='release'){
    demo.Snapshot.Channels.forEach(c=>{c.Owned=false;c.Target=null;c.Mode=0;c.Status='未接管';});demo.Snapshot.CoolingMode=null;reply.Message='已恢复风扇原设置';
  } else if(command.Action==='apply' && command.Profile){demoApply(command.Profile);demo.Snapshot.CoolingMode='自定义';reply.Message='设置已应用';}
  else if(command.Action==='rescan')reply.Message='演示设备检测完成';
  else if(command.Action==='enableMotherboard')reply.Message='演示模式使用模拟风扇，无需安装硬件组件';
  demoSnapshot();return reply;
}
if(!native)setInterval(demoSnapshot,1000);
export function demoDescription(){return readTemperature(demo.Snapshot,'GPU');}
