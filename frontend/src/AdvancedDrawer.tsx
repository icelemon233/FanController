import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Drawer, Flex, Form, Input, InputNumber, Radio, Select, Slider, Space, Switch, Tag, Typography } from 'antd';
import { CheckOutlined, SlidersOutlined } from '@ant-design/icons';
import type { Channel, FanProfile, Snapshot } from './model';
import { preset, profileFor, validateProfile } from './model';
import CurveEditor from './CurveEditor';

export default function AdvancedDrawer({ channel, snapshot, open, busy, onClose, onApply }: {channel:Channel|undefined;snapshot:Snapshot|undefined;open:boolean;busy:boolean;onClose:()=>void;onApply:(profile:FanProfile)=>Promise<boolean>}){
  const [draft,setDraft]=useState<FanProfile>();const [manualSource,setManualSource]=useState(false);
  useEffect(()=>{if(channel&&snapshot){const value=profileFor(channel,snapshot);setDraft(value);const recommended=snapshot.Recommendations.find(r=>r.Id===channel.Id)?.Source;setManualSource(value.Source!==recommended);}},[channel?.Id,open]); // Preserve edits while live readings refresh.
  if(!channel||!snapshot||!draft)return null;
  const recommendation=snapshot.Recommendations.find(r=>r.Id===channel.Id);
  const unavailable=recommendation?.Role==='Pump'||Boolean(recommendation?.Reason?.includes('等待')||channel.Error);
  const patch=(value:Partial<FanProfile>)=>setDraft(p=>p?{...p,...value}:p);
  const error=validateProfile(draft);const disabled=draft.Mode!==0&&!draft.Excluded&&unavailable;
  const apply=async()=>{
    const value=structuredClone(draft);if(!manualSource&&recommendation)value.Source=recommendation.Source;
    if(value.Excluded)value.Mode=0;
    if(await onApply(value))onClose();
  };
  return <Drawer title={<Space><SlidersOutlined/>风扇设置</Space>} size={660} open={open} onClose={onClose} extra={<Tag color={channel.Owned?'blue':'default'}>{channel.Owned?'软件调节中':'硬件默认'}</Tag>}
    footer={<Flex justify="space-between" align="center" gap={16}><Typography.Text type="secondary">修改后点击应用才会生效</Typography.Text><Space><Button onClick={onClose}>取消</Button><Button data-testid="apply-channel" type="primary" icon={<CheckOutlined/>} loading={busy} disabled={Boolean(error)||disabled} onClick={apply}>应用设置</Button></Space></Flex>}>
    <Flex vertical gap={20}>
      <div><Typography.Title level={4} style={{margin:'0 0 4px'}}>{channel.Name}</Typography.Title><Typography.Text type="secondary">{channel.Device}</Typography.Text></div>
      {disabled&&<Alert type="info" showIcon title={recommendation?.Reason??'温度读数尚未就绪'} description="设备就绪后即可调整，也可以先交还硬件默认控制。"/>}
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="显示名称"><Input value={draft.Name} maxLength={60} onChange={e=>patch({Name:e.target.value})}/></Form.Item>
        <Form.Item label="控制方式"><Radio.Group value={draft.Mode} onChange={e=>patch({Mode:e.target.value})} optionType="button" buttonStyle="solid" options={[{label:'自动跟随温度',value:2,disabled:recommendation?.Role==='Pump'},{label:'固定输出',value:1,disabled:recommendation?.Role==='Pump'},{label:'交还硬件默认',value:0}]}/></Form.Item>
        {draft.Mode===2&&<><Alert type="info" showIcon title={manualSource?'使用自选温度来源':recommendation?.SourceLabel??'自动匹配温度来源'} description="日常使用可以保持推荐设置，无需手动关联传感器。"/>
          <Form.Item label="散热预设" style={{marginTop:20}}><Space wrap>{(['静音','均衡','强冷'] as const).map(mode=><Button key={mode} onClick={()=>patch({Points:preset(mode)})}>{mode}</Button>)}</Space></Form.Item></>}
        {draft.Mode===1&&<Form.Item label={<Space>固定输出<Tag color="blue">{draft.Manual}%</Tag></Space>}><Slider min={0} max={100} value={draft.Manual} onChange={Manual=>patch({Manual})}/><Typography.Text type="secondary">实际输出不会低于设置的最低值，转速以反馈为准。</Typography.Text></Form.Item>}
        {draft.Mode===0&&<Alert type="success" showIcon title="恢复接管前的风扇设置" description="应用后，此风扇停止由 cinna-fanCon 调速。"/>}
        <Form.Item label="参与智能散热" style={{marginTop:24}}><Space><Switch aria-label="参与智能散热" checked={!draft.Excluded} disabled={recommendation?.Role==='Pump'} onChange={checked=>patch({Excluded:!checked})}/><Typography.Text type="secondary">关闭后保留硬件默认，不随主页模式改变</Typography.Text></Space></Form.Item>
      </Form>
      <Collapse items={[{key:'details',label:'自定义曲线与更多设置',children:<Flex vertical gap={20}>
        {draft.Mode===2&&<><Space><Switch aria-label="手动选择温度来源" checked={manualSource} onChange={setManualSource}/><Typography.Text>手动选择温度来源</Typography.Text></Space>
          {manualSource&&<Select value={draft.Source} onChange={Source=>patch({Source})} options={[
            {value:'group/cpu',label:'CPU 最高温度'},{value:'group/gpu',label:'GPU 核心温度'},{value:'group/mix',label:'CPU / GPU 取最高（需两者可用）'},
            ...snapshot.Snapshot.Sensors.filter(s=>s.Kind==='Temperature').map(s=>({value:s.Id,label:`${s.Device} · ${s.Name}`})),
          ]}/>}
          <CurveEditor points={draft.Points} minimum={draft.Minimum} onChange={Points=>patch({Points})}/></>}
        <Form layout="vertical"><Form.Item label="最低输出"><InputNumber value={draft.Minimum} min={20} max={100} precision={0} suffix="%" onChange={Minimum=>{if(Minimum!==null)patch({Minimum});}}/><Typography.Paragraph type="secondary" style={{margin:'8px 0 0'}}>保留已确认可正常运转的最低值。切换主页散热模式不会降低此值。</Typography.Paragraph></Form.Item>
        <Form.Item label="转速反馈"><Select value={draft.RpmId??''} onChange={RpmId=>patch({RpmId})} options={[{value:'',label:'不关联'},...snapshot.Snapshot.Sensors.filter(s=>s.Kind==='Fan').map(s=>({value:s.Id,label:`${s.Device} · ${s.Name}`}))]}/></Form.Item></Form>
        <Typography.Text type="secondary">硬件通道：<Typography.Text code copyable>{channel.Id}</Typography.Text></Typography.Text>
      </Flex>}]}/>
      {error&&<Alert type="error" showIcon title={error}/>}
    </Flex>
  </Drawer>;
}
