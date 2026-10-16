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
  return <Drawer className="fan-drawer" title={<Space><SlidersOutlined/>风扇设置</Space>} size={660} open={open} onClose={onClose} extra={<Tag color={channel.Owned?'blue':'default'}>{channel.Owned?'调节中':'未接管'}</Tag>}
    footer={<Flex justify="space-between" align="center" gap={16}><Typography.Text type="secondary">点击“应用设置”后生效</Typography.Text><Space><Button onClick={onClose}>取消</Button><Button data-testid="apply-channel" type="primary" icon={<CheckOutlined/>} loading={busy} disabled={Boolean(error)||disabled} onClick={apply}>应用设置</Button></Space></Flex>}>
    <Flex vertical gap={20}>
      <div><Typography.Title level={4} style={{margin:'0 0 4px'}}>{channel.Name}</Typography.Title><Typography.Text type="secondary">{channel.Device}</Typography.Text></div>
      {disabled&&<Alert type="info" showIcon title={recommendation?.Reason??'暂无有效温度读数'} description="当前无法调节这组风扇。可选择“恢复原设置”并应用。"/>}
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="显示名称"><Input value={draft.Name} maxLength={60} onChange={e=>patch({Name:e.target.value})}/></Form.Item>
        <Form.Item label="控制方式"><Radio.Group value={draft.Mode} onChange={e=>patch({Mode:e.target.value})} optionType="button" buttonStyle="solid" options={[{label:'随温度调节',value:2,disabled:recommendation?.Role==='Pump'},{label:'固定输出',value:1,disabled:recommendation?.Role==='Pump'},{label:'恢复原设置',value:0}]}/></Form.Item>
        {draft.Mode===2&&<><Alert type="info" showIcon title={manualSource?'使用自选温度来源':recommendation?.SourceLabel??'自动匹配温度来源'} description={manualSource?'可在“曲线与更多设置”中更换温度来源。':undefined}/>
          <Form.Item label="曲线预设" style={{marginTop:20}}><Space wrap>{(['静音','均衡','强冷'] as const).map(mode=><Button key={mode} onClick={()=>patch({Points:preset(mode)})}>{mode}</Button>)}</Space></Form.Item></>}
        {draft.Mode===1&&<Form.Item label={<Space>固定输出<Tag color="blue">{draft.Manual}%</Tag></Space>}><Slider min={0} max={100} value={draft.Manual} onChange={Manual=>patch({Manual})}/><Typography.Text type="secondary">输出受最低值和硬件范围限制，实际转速以读数为准。</Typography.Text></Form.Item>}
        {draft.Mode===0&&<Alert type="info" showIcon title="应用后恢复原设置" description="cinna-fanCon 将停止调节这组风扇。"/>}
        <Form.Item label="跟随主页模式" style={{marginTop:24}}><Space><Switch aria-label="跟随主页模式" checked={!draft.Excluded} disabled={recommendation?.Role==='Pump'} onChange={checked=>patch({Excluded:!checked})}/><Typography.Text type="secondary">关闭并应用后恢复原设置，切换主页模式时会跳过这组风扇。</Typography.Text></Space></Form.Item>
      </Form>
      <Collapse items={[{key:'details',label:'曲线与更多设置',children:<Flex vertical gap={20}>
        {draft.Mode===2&&<><Space><Switch aria-label="手动选择温度来源" checked={manualSource} onChange={setManualSource}/><Typography.Text>手动选择温度来源</Typography.Text></Space>
          {manualSource&&<Select value={draft.Source} onChange={Source=>patch({Source})} options={[
            {value:'group/cpu',label:'CPU 最高温度'},{value:'group/gpu',label:'GPU 温度（优先核心）'},{value:'group/mix',label:'CPU 与 GPU 的较高温度（两者均需可用）'},
            ...snapshot.Snapshot.Sensors.filter(s=>s.Kind==='Temperature').map(s=>({value:s.Id,label:`${s.Device} · ${s.Name}`})),
          ]}/>}
          <CurveEditor points={draft.Points} minimum={draft.Minimum} onChange={Points=>patch({Points})}/></>}
        <Form layout="vertical"><Form.Item label="最低输出"><InputNumber value={draft.Minimum} min={20} max={100} precision={0} suffix="%" onChange={Minimum=>{if(Minimum!==null)patch({Minimum});}}/><Typography.Paragraph type="secondary" style={{margin:'8px 0 0'}}>请使用已确认风扇能稳定运转的最低值。主页模式的最低输出为 30%，已保存的更高值会保留。</Typography.Paragraph></Form.Item>
        <Form.Item label="转速传感器"><Select value={draft.RpmId??''} onChange={RpmId=>patch({RpmId})} options={[{value:'',label:'不显示转速'},...snapshot.Snapshot.Sensors.filter(s=>s.Kind==='Fan').map(s=>({value:s.Id,label:`${s.Device} · ${s.Name}`}))]}/></Form.Item></Form>
        <Typography.Text type="secondary">通道标识：<Typography.Text code copyable>{channel.Id}</Typography.Text></Typography.Text>
      </Flex>}]}/>
      {error&&<Alert type="error" showIcon title={error}/>}
    </Flex>
  </Drawer>;
}
