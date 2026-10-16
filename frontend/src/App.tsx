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
const modes=[{name:'静音' as const,icon:<AudioMutedOutlined/>,description:'低温时保持较低输出',detail:'办公、网页浏览'},
  {name:'均衡' as const,icon:<ControlOutlined/>,description:'温度升高时逐步提速',detail:'日常使用'},
  {name:'强冷' as const,icon:<ThunderboltOutlined/>,description:'较早提高风扇输出',detail:'游戏、持续高负载'}];
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
      } else if(event.Type==='notice')notification[event.Success?'info':'error']({title:event.Success?'风扇服务':'风扇服务异常',description:event.Message,placement:'bottomRight'});
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
    try{const reply=await send(action,extras);message.open({key:'fan-operation',type:reply.Success?'success':'warning',content:reply.Message||(reply.Success?'操作完成':'操作失败，请重试'),duration:2});return reply.Success;}
    catch(error){message.open({key:'fan-operation',type:'error',content:error instanceof Error?error.message:'操作失败，请重试',duration:3});return false;}
    finally{setBusy('');}
  };
  const chooseMode=(mode:CoolingMode)=>{setSelectedMode(mode);localStorage.setItem('cinna-fancon-mode',mode);if(active>0)void perform('smart',{Mode:mode});};
  const openChannel=(channel:Channel)=>{setSelectedId(channel.Id);setDrawerMounted(true);setDrawer(true);};
  const applyProfile=(Profile:FanProfile)=>perform('apply',{Profile});
  const fallbackGpu=frame?.Sensors.find(s=>s.Group==='GPU')?.Device??frame?.Gpu;
  const name=(c:Channel)=>snapshot?.Profiles.find(p=>p.Id===c.Id)?.Name||c.Name;
  const stats=[{key:'CPU',label:'CPU 温度',value:cpu,icon:<DesktopOutlined/>,name:frame?.Cpu,values:history.cpu,color:token.colorPrimary},
    {key:'GPU',label:'GPU 温度',value:gpu,icon:<FundProjectionScreenOutlined/>,name:fallbackGpu,values:history.gpu,color:token.colorSuccess}];

  return <Layout className="app-layout" style={{'--fd-border':token.colorBorderSecondary,'--fd-muted':token.colorTextSecondary,'--fd-primary':token.colorPrimary,'--fd-primary-bg':token.colorPrimaryBg,'--fd-fill':token.colorFillQuaternary,'--fd-container':token.colorBgContainer,'--fd-layout':token.colorBgLayout} as CSSProperties}>
    <Layout.Sider className="app-sidebar" width={184} breakpoint="lg" collapsedWidth={64} trigger={null} theme={dark?'dark':'light'} style={{background:token.colorBgContainer,borderRight:`1px solid ${token.colorBorderSecondary}`}}>
      <div className="brand"><div className="brand-icon"><FanIcon style={{fontSize:28}}/></div><div><Text strong className="brand-name">cinna-fanCon</Text><Text type="secondary" className="brand-caption">Windows 风扇控制</Text></div></div>
      <Menu selectedKeys={[page]} onClick={({key})=>setPage(key)} items={[{key:'home',icon:<AppstoreOutlined/>,label:<span data-testid="home-menu">散热概览</span>},{key:'devices',icon:<SettingOutlined/>,label:<span data-testid="advanced-menu">风扇设置</span>}]} style={{background:'transparent',borderInlineEnd:0,padding:'0 8px'}}/>
      <div className="sidebar-bottom"><Space direction="vertical" size={10}><Tag icon={<SafetyCertificateOutlined/>} variant="filled">本地运行</Tag><Text type="secondary" style={{fontSize:11}}>cinna-fanCon 0.2.2 预览版</Text><Button size="small" type="text" aria-label="使用帮助" icon={<QuestionCircleOutlined/>} onClick={()=>setHelp(true)}>使用帮助</Button></Space></div>
    </Layout.Sider>
    <Layout style={{minWidth:0,background:token.colorBgLayout}}>
      <Layout.Header className="app-header" style={{background:token.colorBgContainer,borderBottom:`1px solid ${token.colorBorderSecondary}`}}
        onPointerDown={e=>{if(desktop&&!(e.target as HTMLElement).closest('button,a,input'))windowAction('drag');}}>
        <Space size={10}><Text strong>{page==='home'?'散热概览':'风扇设置'}</Text><Tag variant="filled">本机</Tag></Space>
        <Space size={12}>
          {frame?.Demo&&<Tooltip title="使用模拟读数，操作只影响演示风扇"><Tag color="gold">演示模式</Tag></Tooltip>}
          <Badge status={frame&&!stale?'success':'processing'} text={<Text type="secondary" style={{fontSize:12}}>{stale?'读数已暂停':frame?'每秒更新':'正在检测'}</Text>}/>
          <Tooltip title={dark?'切换为浅色主题':'切换为深色主题'}><Button type="text" aria-label="切换主题" icon={dark?<SunOutlined/>:<MoonOutlined/>} onClick={onTheme}/></Tooltip>
          {desktop&&<Space size={0} className="window-actions"><Button type="text" aria-label="最小化" icon={<MinusOutlined/>} onClick={()=>windowAction('minimize')}/><Button type="text" aria-label="最大化或还原" icon={<ExpandOutlined/>} onClick={()=>windowAction('maximize')}/><Button type="text" aria-label="关闭应用" className="window-close" icon={<CloseOutlined/>} onClick={()=>windowAction('close')}/></Space>}
        </Space>
      </Layout.Header>
      <Layout.Content className="main-scroll">
        <main className="main-content">
          <div className="page-heading"><Title level={3}>{page==='home'?'风扇模式':'单组风扇设置'}</Title>
            {page==='devices'&&<Button icon={<ReloadOutlined/>} loading={busy==='rescan'} disabled={Boolean(busy)} onClick={()=>perform('rescan')}>重新检测</Button>}</div>
          {!frame&&<Card><Skeleton active paragraph={{rows:6}}/></Card>}
          {stale&&<Alert showIcon type="warning" title="未收到风扇服务的最新读数" description="当前无法确认风扇状态，调整功能已暂停。服务仍在运行时会继续控制；与应用断开连接时会尝试恢复原设置。"/>}
          {needsSetup&&<Alert className="setup-alert" type="info" showIcon title="启用主板访问，检测受支持的 CPU 和机箱风扇" action={<Button type="primary" ghost size="small" loading={busy==='enableMotherboard'} onClick={()=>setSetup(true)}>启用主板访问</Button>}/>}
          {abnormal.length>0&&<Alert type="warning" showIcon title="风扇保护与故障" description={abnormal.map(c=>`${name(c)}：${c.Error??c.Status}`).join('；')} action={<Button size="small" onClick={()=>setPage('devices')}>查看详情</Button>}/>}
          {page==='home'&&frame&&<>
            <div className="stats-grid">
              {stats.map(stat=><Card key={stat.key} className="stat-card" styles={{body:{padding:20}}}>
                <Flex justify="space-between" align="center"><Space><span className="stat-icon" style={{color:stat.color,background:stat.key==='CPU'?token.colorPrimaryBg:token.colorSuccessBg}}>{stat.icon}</span><Text type="secondary">{stat.label}</Text></Space>{stat.value!==null&&<Tag variant="filled" color={stat.value>=90?'red':stat.value>=75?'orange':'green'}>{stat.value>=90?'高温':stat.value>=75?'较热':'正常'}</Tag>}</Flex>
                <div className="stat-value-row"><Statistic value={stat.value??'—'} precision={0} suffix={stat.value!==null?<span className="temperature-unit">°C</span>:null}/><MiniTrend values={stat.values} color={stat.color}/></div>
                <Text type="secondary" className="stat-subtitle" ellipsis>{stat.value===null?(stat.key==='CPU'&&needsSetup?'请先启用主板访问':'暂无有效温度读数'):stat.name}</Text>
              </Card>)}
              <Card className="stat-card" styles={{body:{padding:20}}}><Flex justify="space-between" align="center"><Space><span className="stat-icon" style={{color:token.colorPrimary,background:token.colorPrimaryBg}}><FanIcon spin={active>0}/></span><Text type="secondary">已接管风扇</Text></Space><Tag color={active?'blue':'default'} variant="filled">{active?'调节中':'未开启'}</Tag></Flex>
                <div className="stat-value-row"><Statistic value={active} suffix={<span className="temperature-unit">组风扇</span>}/><CheckCircleOutlined style={{color:active?token.colorSuccess:token.colorTextQuaternary,fontSize:30}}/></div>
                <Text type="secondary" className="stat-subtitle">{active?cooling==='自定义'?'使用自定义设置':`${cooling??selectedMode}模式`:`${eligible} 组可开启自动调节`}</Text></Card>
            </div>
            <Card className="cooling-card" styles={{body:{padding:24}}}>
              <Flex className="cooling-heading" justify="space-between" align="center" gap={16}>
                <Space size={14}><div className={`cooling-icon ${active?'is-active':''}`}><FanIcon spin={active>0} style={{fontSize:28}}/></div><div><Title level={4}>{active?cooling==='自定义'?'正在使用自定义设置':'自动调节已开启':'尚未开启自动调节'}</Title><Text type="secondary">{active?cooling==='自定义'?'选择主页模式会替换参与风扇的单组设置。':'点击模式即可切换，风扇输出随温度变化。':'选择模式后，点击“开启自动调节”。'}</Text></div></Space>
                <Space>{active>0&&<Button data-testid="release-all" disabled={Boolean(busy)||stale} loading={busy==='release'} onClick={()=>perform('release')}>恢复原设置</Button>}<Button data-testid="smart-start" type="primary" size="large" icon={active?<ReloadOutlined/>:<PoweroffOutlined/>} loading={busy==='smart'} disabled={!frame||eligible===0||Boolean(busy)||stale} onClick={()=>perform('smart',{Mode:selectedMode})}>{active?'应用所选模式':'开启自动调节'}</Button></Space>
              </Flex>
              <div className="mode-grid">{modes.map(mode=><Button key={mode.name} data-testid={`mode-${mode.name}`} className={`mode-option ${selectedMode===mode.name?'mode-selected':''}`} disabled={Boolean(busy)||stale} onClick={()=>chooseMode(mode.name)} aria-pressed={selectedMode===mode.name}>
                <Flex vertical gap={8} align="flex-start"><Flex gap={10} align="center"><span className="mode-icon">{mode.icon}</span><Text strong>{mode.name}</Text>{mode.name==='均衡'&&<Tag color={selectedMode==='均衡'?'blue':'default'} variant="filled">默认</Tag>}</Flex><Text className="mode-description">{mode.description}</Text><Text type="secondary" className="mode-detail">{mode.detail}</Text></Flex>{selectedMode===mode.name&&<CheckCircleOutlined className="selected-check"/>}
              </Button>)}</div>
              <Flex className="protection-note" justify="space-between" gap={16} wrap><Space><SafetyCertificateOutlined/><Text type="secondary">已接管风扇遇到高温或必要温度缺失时，会设为最高输出。</Text></Space><Button type="link" size="small" onClick={()=>setPage('devices')}>设置单组风扇</Button></Flex>
            </Card>
            <div className="section-heading"><Title level={5}>设备状态</Title></div>
            <div className="device-grid">{[{group:'GPU',title:'显卡风扇',icon:<FundProjectionScreenOutlined/>,device:fallbackGpu},{group:'主板',title:'CPU 与机箱风扇',icon:<DesktopOutlined/>,device:frame?.Board}].map(device=>{
              const groupChannels=channels.filter(c=>c.Group===device.group);const managed=groupChannels.filter(c=>c.Owned).length;
              const rpms=snapshot?groupChannels.map(c=>rpmFor(c,snapshot)).filter((r):r is number=>r!==null):[];
              return <Card key={device.group} size="small" className="device-card"><Flex justify="space-between" align="center" gap={12}><Space><span className="device-icon">{device.icon}</span><Flex vertical gap={2}><Text strong>{device.title}</Text><Text type="secondary" className="device-model" ellipsis>{device.device??'未识别设备'}</Text></Flex></Space><Tag color={managed?'blue':groupChannels.length?'green':'default'} variant="filled">{managed?groupChannels.some(c=>c.Owned&&c.Mode===1)?'单组设置':'自动调节':groupChannels.length?'未接管':device.group==='主板'&&needsSetup?'待授权':'无可控风扇'}</Tag></Flex>
                <Flex className="device-summary" justify="space-between"><Text type="secondary">{groupChannels.length?`${groupChannels.length} 组可控，${managed} 组已接管`:device.group==='主板'&&needsSetup?'请先启用主板访问':'未检测到可控接口'}</Text><Text>{rpms.length?rpms.length===1?`${Math.round(rpms[0]).toLocaleString()} RPM`:`${Math.round(Math.min(...rpms))}–${Math.round(Math.max(...rpms))} RPM`:'—'}</Text></Flex></Card>;
            })}</div>
          </>}
          {page==='devices'&&frame&&snapshot&&<>
            <Card title="可控风扇" extra={<Tag variant="filled">共 {channels.length} 组</Tag>} styles={{body:{padding:0}}}>
              <Table<Channel> rowKey="Id" pagination={false} dataSource={channels} locale={{emptyText:<Empty description="未检测到可控风扇"/>}} columns={[
                {title:'风扇',key:'name',render:(_,c)=><Flex vertical gap={4}><Text strong>{name(c)}</Text><Text type="secondary" style={{fontSize:12}}>{c.Group==='GPU'?'显卡风扇':'主板风扇'}</Text></Flex>},
                {title:'当前状态',key:'status',render:(_,c)=><Tag color={c.Error?'red':c.Status.includes('保护')?'orange':c.Owned?'blue':'default'}>{c.Error?'控制异常':c.Owned?c.Status:'未接管'}</Tag>},
                {title:'转速',key:'rpm',render:(_,c)=>{const v=rpmFor(c,snapshot);return v===null?<Text type="secondary">暂无读数</Text>:<Text>{Math.round(v).toLocaleString()} RPM</Text>;}},
                {title:'主页模式温度来源',key:'source',render:(_,c)=>{const r=snapshot.Recommendations.find(r=>r.Id===c.Id);return <Text type="secondary">{r?.Eligible?r.SourceLabel:r?.Reason??'暂无匹配结果'}</Text>;}},
                {title:'',key:'action',width:80,render:(_,c)=><Button type="link" data-testid={`configure-${c.Id}`} aria-label={`设置${name(c)}`} onClick={()=>openChannel(c)}>设置</Button>},
              ]}/>
            </Card>
            <Collapse items={[{key:'sensors',label:`传感器与检测详情（${frame.Sensors.length} 项）`,children:<Flex vertical gap={16}>
              <Descriptions size="small" column={1} items={[{key:'cpu',label:'处理器',children:frame.Cpu},{key:'gpu',label:'显卡',children:fallbackGpu},{key:'board',label:'主板',children:frame.Board},{key:'access',label:'主板访问',children:frame.PawnIoInstalled&&frame.Administrator?'已启用':!frame.PawnIoInstalled?'未安装硬件组件':'未获得访问权限'}]}/>
              <Table size="small" rowKey="Id" pagination={false} dataSource={frame.Sensors} columns={[{title:'名称',dataIndex:'Name'},{title:'设备',dataIndex:'Device',ellipsis:true},{title:'当前读数',key:'value',render:(_,s)=>s.Value===null?'—':`${s.Value.toFixed(s.Kind==='Fan'?0:1)} ${s.Kind==='Fan'?'RPM':s.Kind==='Temperature'?'°C':'%'}`} ]}/>
              {frame.Notices.map((notice,i)=><Text type="secondary" key={i}>{notice}</Text>)}
            </Flex>}]}/>
          </>}
          <footer className="main-footer"><Text type="secondary">设置保存在此电脑</Text><Text type="secondary">最小化后在托盘运行，退出前会尝试恢复原设置</Text></footer>
        </main>
      </Layout.Content>
    </Layout>
    {drawerMounted&&<Suspense fallback={null}><AdvancedDrawer channel={channels.find(c=>c.Id===selectedId)} snapshot={snapshot} open={drawer} busy={busy==='apply'} onClose={()=>setDrawer(false)} onApply={applyProfile}/></Suspense>}
    <Drawer title="启用主板访问" open={setup} onClose={()=>setSetup(false)} size={480} footer={<Button type="primary" block size="large" loading={busy==='enableMotherboard'} onClick={async()=>{if(await perform('enableMotherboard'))setSetup(false);}}>开始设置</Button>}>
      <Flex vertical gap={24}><Paragraph>读取 CPU 温度和控制主板风扇可能需要硬件组件及管理员权限。设置完成后，应用会重新检测受支持的 CPU 和机箱风扇。</Paragraph><Steps current={frame?.PawnIoInstalled?1:0} orientation="vertical" items={[{title:'安装硬件组件',description:'未安装 PawnIO 时，应用会下载官方安装器。请按安装器提示完成安装。'},{title:'授权主板访问',description:'确认 Windows 授权提示，允许风扇服务访问主板。'},{title:'开启自动调节',description:'检测完成后，回到概览选择模式并开启自动调节。'}]}/><Alert type="info" showIcon title="设置期间保持应用打开" description="安装和授权完成后，界面会自动连接风扇服务。已检测到的显卡风扇可直接使用。"/></Flex>
    </Drawer>
    <Drawer title="使用帮助" open={help} onClose={()=>setHelp(false)} size={480}><Flex vertical gap={24}><Steps orientation="vertical" items={[{title:'选择风扇模式',description:'轻负载可选静音，日常使用可选均衡，持续高负载可选强冷。'},{title:'开启自动调节',description:'CPU 风扇使用 CPU 温度，显卡风扇优先使用 GPU 核心温度；机箱风扇在两者可用时取较高值，否则使用 CPU 温度。'},{title:'调整单组风扇',description:'在“风扇设置”中修改曲线或固定输出。关闭“跟随主页模式”并应用，可让该组恢复原设置。'}]}/><Alert type="info" showIcon title="同一组可能包含多个风扇" description="分组取决于硬件提供的接口。接在同一接口上的风扇无法分别调节。"/><Paragraph type="secondary">退出时会尝试恢复已接管风扇的原设置，恢复失败时应用会保持运行。与应用断开连接后，风扇服务也会尝试恢复；强制结束服务、驱动故障或断电可能导致无法恢复。</Paragraph></Flex></Drawer>
  </Layout>;
}
export default function App(){
  const [dark,setDark]=useState(()=>localStorage.getItem('cinna-fancon-theme')==='dark');
  const toggle=()=>setDark(d=>{localStorage.setItem('cinna-fancon-theme',d?'light':'dark');return !d;});
  return <ConfigProvider locale={zhCN} theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm,cssVar:{key:'cinna-fancon'},token:{colorPrimary:'#1677ff',borderRadius:10,fontFamily:'"Segoe UI", "Microsoft YaHei UI", sans-serif',fontSize:13,colorBgLayout:dark?'#11151d':'#f5f7fb'},components:{Card:{paddingLG:24},Button:{controlHeight:34},Menu:{itemHeight:42,itemMarginBlock:6,itemBorderRadius:8},Statistic:{contentFontSize:34}}}}><AntApp><Content dark={dark} onTheme={toggle}/></AntApp></ConfigProvider>;
}
