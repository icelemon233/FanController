import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CSSProperties, SVGProps } from 'react';
import { Alert, App as AntApp, Badge, Button, Card, Collapse, ConfigProvider, Descriptions, Drawer, Empty, Flex, Layout, Menu, Skeleton, Space, Statistic, Steps, Table, Tag, Tooltip, Typography, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Icon, { AppstoreOutlined, AudioMutedOutlined, CheckCircleOutlined, CloseOutlined, ControlOutlined, DesktopOutlined, ExpandOutlined, FundProjectionScreenOutlined, MinusOutlined, MoonOutlined, PoweroffOutlined, QuestionCircleOutlined, ReloadOutlined, SafetyCertificateOutlined, SettingOutlined, SunOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { Channel, CoolingMode, FanProfile, Snapshot } from './model';
import { readTemperature, rpmFor } from './model';
import { desktop, send, subscribe, windowAction } from './bridge';
const AdvancedDrawer=lazy(()=>import('./AdvancedDrawer'));
import './style.css';

const {Text,Title,Paragraph}=Typography;
const modes=[{name:'静音' as const,icon:<AudioMutedOutlined/>,description:'较低风速，适合轻负载',detail:'办公 · 浏览网页'},
  {name:'均衡' as const,icon:<ControlOutlined/>,description:'兼顾安静与散热',detail:'日常使用 · 推荐'},
  {name:'强冷' as const,icon:<ThunderboltOutlined/>,description:'更积极地提高风速',detail:'游戏 · 持续高负载'}];
function FanGlyph(props:SVGProps<SVGSVGElement>){return <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" {...props}>{[0,90,180,270].map(a=><path key={a} transform={`rotate(${a} 12 12)`} d="M12 10C8 8 7 4.5 9.3 3.4c2.7-1.4 5.1.5 4.8 3-.1 1.4-.8 2.6-2.1 3.6Z"/>)}<circle cx="12" cy="12" r="2.5"/></svg>;}
function FanIcon({spin=false,style}:{spin?:boolean;style?:CSSProperties}){return <Icon component={FanGlyph} spin={spin} style={style}/>;}
function MiniTrend({values,color}:{values:(number|null)[];color:string}){
  const data=values.map((v,i)=>v===null?null:{v,i}).filter(v=>v!==null);if(!data.length)return <div className="trend-placeholder"/>;
  const x=(i:number)=>data.length<2?140:4+i/Math.max(1,values.length-1)*154;
  const y=(v:number)=>52-Math.min(100,Math.max(20,v)-20)/80*44;
  const d=data.map((p,i)=>`${i?'L':'M'}${x(p.i)},${y(p.v)}`).join(' ');
  return <svg className="mini-trend" viewBox="0 0 162 58" aria-hidden="true"><path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>{data.at(-1)&&<circle cx={x(data.at(-1)!.i)} cy={y(data.at(-1)!.v)} r="3.5" fill={color}/>}</svg>;
}

function Content({dark,onTheme}:{dark:boolean;onTheme:()=>void}){
  const {token}=theme.useToken();const {message,notification}=AntApp.useApp();
  const [snapshot,setSnapshot]=useState<Snapshot>();const [page,setPage]=useState('home');
  const [selectedMode,setSelectedMode]=useState<CoolingMode>(()=>{const p=localStorage.getItem('cinna-fancon-mode');return p==='静音'||p==='强冷'?p:'均衡';});
  const [busy,setBusy]=useState('');const [selectedId,setSelectedId]=useState<string>();const [drawer,setDrawer]=useState(false);const [drawerMounted,setDrawerMounted]=useState(false);const [setup,setSetup]=useState(false);const [help,setHelp]=useState(false);const [stale,setStale]=useState(false);
  const [history,setHistory]=useState<{cpu:(number|null)[];gpu:(number|null)[]}>({cpu:[],gpu:[]});
  const lastReceived=useRef(Date.now());
  useEffect(()=>{
    const off=subscribe(event=>{
      if(event.Type==='snapshot'){
        setSnapshot(event);lastReceived.current=Date.now();setStale(false);
        setHistory(p=>({cpu:[...p.cpu,readTemperature(event.Snapshot,'CPU')].slice(-60),gpu:[...p.gpu,readTemperature(event.Snapshot,'GPU')].slice(-60)}));
      } else if(event.Type==='notice')notification[event.Success?'info':'error']({title:event.Success?'应用状态':'风扇服务需要处理',description:event.Message,placement:'bottomRight'});
    });
    send('ready').catch(()=>{});const timer=setInterval(()=>setStale(Date.now()-lastReceived.current>6000),1000);
    return()=>{off();clearInterval(timer);};
  },[notification]);
  const frame=snapshot?.Snapshot;
  useEffect(()=>{const mode=frame?.CoolingMode;if(mode==='静音'||mode==='均衡'||mode==='强冷')setSelectedMode(mode);},[frame?.CoolingMode]);
  const active=frame?.Channels.filter(c=>c.Owned).length??0;
  const eligible=snapshot?.Recommendations.filter(r=>r.Eligible).length??0;
  const needsSetup=frame&&!frame.Demo&&(!frame.Administrator||!frame.PawnIoInstalled);
  const cpu=readTemperature(frame,'CPU'),gpu=readTemperature(frame,'GPU');
  const abnormal=frame?.Channels.filter(c=>c.Error||c.Status.includes('保护'))??[];
  const cooling=frame?.CoolingMode;
  const channels=frame?.Channels??[];
  const perform=async(action:string,extras:Parameters<typeof send>[1]={})=>{
    if(busy)return false;setBusy(action);
    try{const reply=await send(action,extras);message.open({key:'fan-operation',type:reply.Success?'success':'warning',content:reply.Message||'操作完成',duration:2});return reply.Success;}
    catch(error){message.open({key:'fan-operation',type:'error',content:error instanceof Error?error.message:'操作未完成',duration:3});return false;}
    finally{setBusy('');}
  };
  const chooseMode=(mode:CoolingMode)=>{setSelectedMode(mode);localStorage.setItem('cinna-fancon-mode',mode);if(active>0)void perform('smart',{Mode:mode});};
  const openChannel=(channel:Channel)=>{setSelectedId(channel.Id);setDrawerMounted(true);setDrawer(true);};
  const applyProfile=(Profile:FanProfile)=>perform('apply',{Profile});
  const fallbackGpu=frame?.Sensors.find(s=>s.Group==='GPU')?.Device??frame?.Gpu;
  const name=(c:Channel)=>snapshot?.Profiles.find(p=>p.Id===c.Id)?.Name||c.Name;
  const stats=[{key:'CPU',label:'CPU 温度',value:cpu,icon:<DesktopOutlined/>,name:frame?.Cpu,values:history.cpu,color:token.colorPrimary},
    {key:'GPU',label:'GPU 核心温度',value:gpu,icon:<FundProjectionScreenOutlined/>,name:fallbackGpu,values:history.gpu,color:token.colorSuccess}];

  return <Layout className="app-layout" style={{'--fd-border':token.colorBorderSecondary,'--fd-muted':token.colorTextSecondary,'--fd-primary':token.colorPrimary,'--fd-primary-bg':token.colorPrimaryBg,'--fd-fill':token.colorFillQuaternary,'--fd-container':token.colorBgContainer,'--fd-layout':token.colorBgLayout} as CSSProperties}>
    <Layout.Sider className="app-sidebar" width={184} breakpoint="lg" collapsedWidth={64} trigger={null} theme={dark?'dark':'light'} style={{background:token.colorBgContainer,borderRight:`1px solid ${token.colorBorderSecondary}`}}>
      <div className="brand"><div className="brand-icon"><FanIcon style={{fontSize:28}}/></div><div><Text strong className="brand-name">cinna-fanCon</Text><Text type="secondary" className="brand-caption">电脑散热管理</Text></div></div>
      <Menu selectedKeys={[page]} onClick={({key})=>setPage(key)} items={[{key:'home',icon:<AppstoreOutlined/>,label:<span data-testid="home-menu">散热概览</span>},{key:'devices',icon:<SettingOutlined/>,label:<span data-testid="advanced-menu">设备与高级设置</span>}]} style={{background:'transparent',borderInlineEnd:0,padding:'0 8px'}}/>
      <div className="sidebar-bottom"><Space direction="vertical" size={10}><Tag icon={<SafetyCertificateOutlined/>} variant="filled">本地运行</Tag><Text type="secondary" style={{fontSize:11}}>cinna-fanCon 0.2.1 预览版</Text><Button size="small" type="text" aria-label="使用帮助" icon={<QuestionCircleOutlined/>} onClick={()=>setHelp(true)}>使用帮助</Button></Space></div>
    </Layout.Sider>
    <Layout style={{minWidth:0,background:token.colorBgLayout}}>
      <Layout.Header className="app-header" style={{background:token.colorBgContainer,borderBottom:`1px solid ${token.colorBorderSecondary}`}}
        onPointerDown={e=>{if(desktop&&!(e.target as HTMLElement).closest('button,a,input'))windowAction('drag');}}>
        <Space size={10}><Text strong>{page==='home'?'散热概览':'设备与高级设置'}</Text><Tag variant="filled">本机</Tag></Space>
        <Space size={12}>
          {frame?.Demo&&<Tooltip title="所有数据与操作均为演示，不接触实际硬件"><Tag color="gold">演示模式</Tag></Tooltip>}
          <Badge status={frame&&!stale?'success':'processing'} text={<Text type="secondary" style={{fontSize:12}}>{stale?'连接中':frame?'实时更新':'正在检测'}</Text>}/>
          <Tooltip title={dark?'切换浅色':'切换深色'}><Button type="text" aria-label="切换主题" icon={dark?<SunOutlined/>:<MoonOutlined/>} onClick={onTheme}/></Tooltip>
          {desktop&&<Space size={0} className="window-actions"><Button type="text" aria-label="最小化" icon={<MinusOutlined/>} onClick={()=>windowAction('minimize')}/><Button type="text" aria-label="最大化或还原" icon={<ExpandOutlined/>} onClick={()=>windowAction('maximize')}/><Button type="text" aria-label="关闭应用" className="window-close" icon={<CloseOutlined/>} onClick={()=>windowAction('close')}/></Space>}
        </Space>
      </Layout.Header>
      <Layout.Content className="main-scroll">
        <main className="main-content">
          <div className="page-heading"><div><Title level={3}>{page==='home'?'散热，简单一点。':'需要精细调整时，再打开这里。'}</Title><Paragraph type="secondary">{page==='home'?'选一个模式，风扇就会随温度自动调整。':'日常使用主页模式即可；这里可以单独调整或保留某组风扇。'}</Paragraph></div>
            {page==='devices'&&<Button icon={<ReloadOutlined/>} loading={busy==='rescan'} disabled={Boolean(busy)} onClick={()=>perform('rescan')}>重新检测</Button>}</div>
          {!frame&&<Card><Skeleton active paragraph={{rows:6}}/></Card>}
          {stale&&<Alert showIcon type="warning" title="正在连接风扇服务" description="连接恢复后即可继续调整，已开启的自动调节由独立风扇服务运行。"/>}
          {needsSetup&&<Alert className="setup-alert" type="info" showIcon title="完成主板支持，即可一起管理 CPU 和机箱风扇" action={<Button type="primary" ghost size="small" loading={busy==='enableMotherboard'} onClick={()=>setSetup(true)}>启用主板支持</Button>}/>}
          {abnormal.length>0&&<Alert type="warning" showIcon title="有风扇正在保护或需要处理" description={abnormal.map(c=>`${name(c)}：${c.Error??c.Status}`).join('；')} action={<Button size="small" onClick={()=>setPage('devices')}>查看</Button>}/>}
          {page==='home'&&frame&&<>
            <div className="stats-grid">
              {stats.map(stat=><Card key={stat.key} className="stat-card" styles={{body:{padding:20}}}>
                <Flex justify="space-between" align="center"><Space><span className="stat-icon" style={{color:stat.color,background:stat.key==='CPU'?token.colorPrimaryBg:token.colorSuccessBg}}>{stat.icon}</span><Text type="secondary">{stat.label}</Text></Space>{stat.value!==null&&<Tag variant="filled" color={stat.value>=90?'red':stat.value>=75?'orange':'green'}>{stat.value>=90?'高温':stat.value>=75?'较热':'正常'}</Tag>}</Flex>
                <div className="stat-value-row"><Statistic value={stat.value??'—'} precision={0} suffix={stat.value!==null?<span className="temperature-unit">°C</span>:null}/><MiniTrend values={stat.values} color={stat.color}/></div>
                <Text type="secondary" className="stat-subtitle" ellipsis>{stat.value===null?(needsSetup?'启用主板支持后显示':'等待有效读数'):stat.name}</Text>
              </Card>)}
              <Card className="stat-card" styles={{body:{padding:20}}}><Flex justify="space-between" align="center"><Space><span className="stat-icon" style={{color:token.colorPrimary,background:token.colorPrimaryBg}}><FanIcon spin={active>0}/></span><Text type="secondary">风扇控制</Text></Space><Tag color={active?'blue':'default'} variant="filled">{active?'已开启':'待开启'}</Tag></Flex>
                <div className="stat-value-row"><Statistic value={active} suffix={<span className="temperature-unit">组风扇</span>}/><CheckCircleOutlined style={{color:active?token.colorSuccess:token.colorTextQuaternary,fontSize:30}}/></div>
                <Text type="secondary" className="stat-subtitle">{active?cooling==='自定义'?'自定义设置正在运行':`${cooling??'自动'}模式 · 自动跟随温度`:`${eligible} 组已就绪，点击下方开启`}</Text></Card>
            </div>
            <Card className="cooling-card" styles={{body:{padding:24}}}>
              <Flex className="cooling-heading" justify="space-between" align="center" gap={16}>
                <Space size={14}><div className={`cooling-icon ${active?'is-active':''}`}><FanIcon spin={active>0} style={{fontSize:28}}/></div><div><Title level={4}>{active?cooling==='自定义'?'自定义散热正在运行':'智能散热已开启':'选择你的散热模式'}</Title><Text type="secondary">{active?'切换模式即可调整所有参与智能散热的风扇。':'温度来源自动匹配，不用逐个关联风扇。'}</Text></div></Space>
                <Space>{active>0&&<Button data-testid="release-all" disabled={Boolean(busy)||stale} loading={busy==='release'} onClick={()=>perform('release')}>恢复原设置</Button>}<Button data-testid="smart-start" type="primary" size="large" icon={active?<ReloadOutlined/>:<PoweroffOutlined/>} loading={busy==='smart'} disabled={!frame||eligible===0||Boolean(busy)||stale} onClick={()=>perform('smart',{Mode:selectedMode})}>{active?'重新应用':'开启智能散热'}</Button></Space>
              </Flex>
              <div className="mode-grid">{modes.map(mode=><Button key={mode.name} data-testid={`mode-${mode.name}`} className={`mode-option ${selectedMode===mode.name?'mode-selected':''}`} disabled={Boolean(busy)||stale} onClick={()=>chooseMode(mode.name)} aria-pressed={selectedMode===mode.name}>
                <Flex vertical gap={8} align="flex-start"><Flex gap={10} align="center"><span className="mode-icon">{mode.icon}</span><Text strong>{mode.name}</Text>{mode.name==='均衡'&&<Tag color={selectedMode==='均衡'?'blue':'default'} variant="filled">推荐</Tag>}</Flex><Text className="mode-description">{mode.description}</Text><Text type="secondary" className="mode-detail">{mode.detail}</Text></Flex>{selectedMode===mode.name&&<CheckCircleOutlined className="selected-check"/>}
              </Button>)}</div>
              <Flex className="protection-note" justify="space-between" gap={16} wrap><Space><SafetyCertificateOutlined/><Text type="secondary">高温保护 · 平稳降速 · 退出恢复原设置</Text></Space><Button type="link" size="small" onClick={()=>setPage('devices')}>需要单独调整？打开高级设置</Button></Flex>
            </Card>
            <div className="section-heading"><Title level={5}>设备状态</Title><Text type="secondary">无需手动配置温度与风扇关系</Text></div>
            <div className="device-grid">{[{group:'GPU',title:'显卡风扇',icon:<FundProjectionScreenOutlined/>,device:fallbackGpu},{group:'主板',title:'CPU 与机箱风扇',icon:<DesktopOutlined/>,device:frame?.Board}].map(device=>{
              const groupChannels=channels.filter(c=>c.Group===device.group);const managed=groupChannels.filter(c=>c.Owned).length;
              const rpms=snapshot?groupChannels.map(c=>rpmFor(c,snapshot)).filter((r):r is number=>r!==null):[];
              return <Card key={device.group} size="small" className="device-card"><Flex justify="space-between" align="center" gap={12}><Space><span className="device-icon">{device.icon}</span><Flex vertical gap={2}><Text strong>{device.title}</Text><Text type="secondary" className="device-model" ellipsis>{device.device??'正在识别设备'}</Text></Flex></Space><Tag color={managed?'blue':groupChannels.length?'green':'default'} variant="filled">{managed?groupChannels.some(c=>c.Owned&&c.Mode===1)?'自定义':'自动调节':groupChannels.length?'已识别':needsSetup?'待启用':'暂不可用'}</Tag></Flex>
                <Flex className="device-summary" justify="space-between"><Text type="secondary">{groupChannels.length?`${groupChannels.length} 组可控 · ${managed} 组已接管`:needsSetup?'完成主板支持后自动识别':'未检测到可控接口'}</Text><Text>{rpms.length?rpms.length===1?`${Math.round(rpms[0]).toLocaleString()} RPM`:`${Math.round(Math.min(...rpms))}–${Math.round(Math.max(...rpms))} RPM`:'—'}</Text></Flex></Card>;
            })}</div>
          </>}
          {page==='devices'&&frame&&snapshot&&<>
            <Card title="风扇设置" extra={<Tag variant="filled">{channels.length} 组可控接口</Tag>} styles={{body:{padding:0}}}>
              <Table<Channel> rowKey="Id" pagination={false} dataSource={channels} locale={{emptyText:<Empty description="暂未检测到可控风扇"/>}} columns={[
                {title:'风扇',key:'name',render:(_,c)=><Flex vertical gap={4}><Text strong>{name(c)}</Text><Text type="secondary" style={{fontSize:12}}>{c.Group==='GPU'?'显卡风扇':'主板风扇'}</Text></Flex>},
                {title:'当前状态',key:'status',render:(_,c)=><Tag color={c.Error?'red':c.Status.includes('保护')?'orange':c.Owned?'blue':'default'}>{c.Error?'需要处理':c.Owned?c.Status:'硬件默认'}</Tag>},
                {title:'转速',key:'rpm',render:(_,c)=>{const v=rpmFor(c,snapshot);return v===null?<Text type="secondary">未关联</Text>:<Text>{Math.round(v).toLocaleString()} RPM</Text>;}},
                {title:'智能匹配',key:'source',render:(_,c)=>{const r=snapshot.Recommendations.find(r=>r.Id===c.Id);return <Text type="secondary">{r?.Eligible?r.SourceLabel:r?.Reason??'等待识别'}</Text>;}},
                {title:'',key:'action',width:80,render:(_,c)=><Button type="link" data-testid={`configure-${c.Id}`} aria-label={`设置${name(c)}`} onClick={()=>openChannel(c)}>设置</Button>},
              ]}/>
            </Card>
            <Collapse items={[{key:'sensors',label:`全部传感器与检测详情（${frame.Sensors.length} 项）`,children:<Flex vertical gap={16}>
              <Descriptions size="small" column={1} items={[{key:'cpu',label:'处理器',children:frame.Cpu},{key:'gpu',label:'显卡',children:fallbackGpu},{key:'board',label:'主板',children:frame.Board},{key:'access',label:'主板支持',children:frame.PawnIoInstalled&&frame.Administrator?'组件与权限已就绪':'尚未完成'}]}/>
              <Table size="small" rowKey="Id" pagination={false} dataSource={frame.Sensors} columns={[{title:'名称',dataIndex:'Name'},{title:'设备',dataIndex:'Device',ellipsis:true},{title:'当前读数',key:'value',render:(_,s)=>s.Value===null?'—':`${s.Value.toFixed(s.Kind==='Fan'?0:1)} ${s.Kind==='Fan'?'RPM':s.Kind==='Temperature'?'°C':'%'}`} ]}/>
              {frame.Notices.map((notice,i)=><Text type="secondary" key={i}>{notice}</Text>)}
            </Flex>}]}/>
          </>}
          <footer className="main-footer"><Text type="secondary">设置仅保存在此电脑 · 每秒更新</Text><Text type="secondary">最小化后继续运行，关闭时恢复风扇原设置</Text></footer>
        </main>
      </Layout.Content>
    </Layout>
    {drawerMounted&&<Suspense fallback={null}><AdvancedDrawer channel={channels.find(c=>c.Id===selectedId)} snapshot={snapshot} open={drawer} busy={busy==='apply'} onClose={()=>setDrawer(false)} onApply={applyProfile}/></Suspense>}
    <Drawer title="启用主板支持" open={setup} onClose={()=>setSetup(false)} size={480} footer={<Button type="primary" block size="large" loading={busy==='enableMotherboard'} onClick={async()=>{if(await perform('enableMotherboard'))setSetup(false);}}>开始设置</Button>}>
      <Flex vertical gap={24}><Paragraph>首次完成主板支持后，应用会自动显示硬件提供的 CPU 和机箱风扇接口。已可用的显卡风扇可以直接使用。</Paragraph><Steps current={frame?.PawnIoInstalled?1:0} orientation="vertical" items={[{title:'安装硬件组件',description:'按官方安装器的默认选项完成安装。'},{title:'授权风扇服务',description:'在 Windows 授权提示中确认，让服务访问主板风扇。'},{title:'自动检测并匹配',description:'完成后选择散热模式，点击“开启智能散热”即可。'}]}/><Alert type="info" showIcon title="界面会保持打开" description="应用自动重新连接风扇服务，无需手动重启界面。"/></Flex>
    </Drawer>
    <Drawer title="使用 cinna-fanCon" open={help} onClose={()=>setHelp(false)} size={480}><Flex vertical gap={24}><Steps orientation="vertical" items={[{title:'选一个散热模式',description:'静音、均衡、强冷，按当前使用场景选择。'},{title:'开启智能散热',description:'应用自动匹配温度来源，接管状态正常的风扇。'},{title:'需要时再精细调整',description:'在设备与高级设置中修改单组风扇，或将它保留为硬件默认。'}]}/><Alert type="info" showIcon title="风扇按硬件提供的接口分组" description="同一组可能包含多个物理风扇，因此不一定能逐个独立调整。"/><Paragraph type="secondary">关闭应用会先恢复接管前的设置。强制结束风扇服务或驱动崩溃不保证恢复；独立服务在界面断开时会尝试恢复。</Paragraph></Flex></Drawer>
  </Layout>;
}
export default function App(){
  const [dark,setDark]=useState(()=>localStorage.getItem('cinna-fancon-theme')==='dark');
  const toggle=()=>setDark(d=>{localStorage.setItem('cinna-fancon-theme',d?'light':'dark');return !d;});
  return <ConfigProvider locale={zhCN} theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm,cssVar:{key:'cinna-fancon'},token:{colorPrimary:'#1677ff',borderRadius:10,fontFamily:'"Segoe UI", "Microsoft YaHei UI", sans-serif',fontSize:13,colorBgLayout:dark?'#11151d':'#f5f7fb'},components:{Card:{paddingLG:24},Button:{controlHeight:34},Menu:{itemHeight:42,itemMarginBlock:6,itemBorderRadius:8},Statistic:{contentFontSize:34}}}}><AntApp><Content dark={dark} onTheme={toggle}/></AntApp></ConfigProvider>;
}
