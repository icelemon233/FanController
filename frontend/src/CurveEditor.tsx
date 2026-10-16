import { useRef } from 'react';
import { Flex, InputNumber, Table, Tag, Typography, theme } from 'antd';
import type { CurvePoint } from './model';

export default function CurveEditor({ points, minimum, onChange }: {points: CurvePoint[]; minimum:number; onChange:(points:CurvePoint[])=>void}){
  const {token}=theme.useToken();const svg=useRef<SVGSVGElement>(null);const drag=useRef<number|null>(null);
  const width=620,height=210,left=38,right=18,top=16,bottom=32;
  const x=(t:number)=>left+(t-20)/90*(width-left-right);const y=(d:number)=>height-bottom-d/100*(height-top-bottom);
  const line=points.map((p,i)=>`${i===0?'M':'L'}${x(p.Temperature)},${y(Math.max(minimum,p.Duty))}`).join(' ');
  const update=(i:number,key:keyof CurvePoint,value:number|null)=>{if(value===null)return;onChange(points.map((p,j)=>j===i?{...p,[key]:value}:p));};
  return <Flex vertical gap={12}>
    <div className="curve-canvas" style={{background:token.colorFillQuaternary,borderColor:token.colorBorderSecondary}}>
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="风扇输出曲线，拖动节点可调整温度和输出"
        onPointerMove={event=>{
          if(drag.current===null||!svg.current)return;const i=drag.current;const box=svg.current.getBoundingClientRect();
          const px=(event.clientX-box.left)/box.width*width,py=(event.clientY-box.top)/box.height*height;
          const t=Math.max(i===0?20:points[i-1].Temperature+1,Math.min(i===points.length-1?110:points[i+1].Temperature-1,Math.round(20+(px-left)/(width-left-right)*90)));
          const d=Math.max(i===0?0:points[i-1].Duty,Math.min(i===points.length-1?100:points[i+1].Duty,Math.round((height-bottom-py)/(height-top-bottom)*100)));
          onChange(points.map((p,j)=>j===i?{Temperature:t,Duty:d}:p));
        }} onPointerUp={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
        {[0,25,50,75,100].map(d=><g key={d}><line x1={left} y1={y(d)} x2={width-right} y2={y(d)} stroke={token.colorBorderSecondary}/><text x={left-9} y={y(d)+4} fill={token.colorTextTertiary} textAnchor="end" fontSize="10">{d}</text></g>)}
        {[20,35,50,65,80,95,110].map(t=><text key={t} x={x(t)} y={height-10} fill={token.colorTextTertiary} textAnchor="middle" fontSize="10">{t}°</text>)}
        <line x1={left} y1={y(minimum)} x2={width-right} y2={y(minimum)} stroke={token.colorPrimaryBorder} strokeDasharray="4 4"/>
        {points.length>0&&<><path d={`${line} L${x(points.at(-1)!.Temperature)},${y(0)} L${x(points[0].Temperature)},${y(0)} Z`} fill={token.colorPrimaryBg}/><path d={line} fill="none" stroke={token.colorPrimary} strokeWidth="2.5" strokeLinejoin="round"/>
          {points.map((p,i)=><circle key={i} cx={x(p.Temperature)} cy={y(Math.max(minimum,p.Duty))} r={6} fill={token.colorBgContainer} stroke={token.colorPrimary} strokeWidth="2.5" style={{cursor:'grab',touchAction:'none'}} onPointerDown={event=>{drag.current=i;event.currentTarget.setPointerCapture(event.pointerId);}}/>)}</>}
      </svg>
    </div>
    <Flex justify="space-between" align="center"><Typography.Text type="secondary">拖动节点或修改下表数值</Typography.Text><Tag variant="filled">最低输出 {minimum}%</Tag></Flex>
    <Table size="small" pagination={false} rowKey="index" dataSource={points.map((p,index)=>({...p,index}))} columns={[
      {title:'节点',dataIndex:'index',width:70,render:(i:number)=>i+1},
      {title:'温度',dataIndex:'Temperature',render:(value:number,row:CurvePoint&{index:number})=><InputNumber aria-label={`节点 ${row.index+1} 的温度`} value={value} min={20} max={110} precision={0} suffix="°C" onChange={v=>update(row.index,'Temperature',v)}/>},
      {title:'风扇输出',dataIndex:'Duty',render:(value:number,row:CurvePoint&{index:number})=><InputNumber aria-label={`节点 ${row.index+1} 的输出`} value={value} min={0} max={100} precision={0} suffix="%" onChange={v=>update(row.index,'Duty',v)}/>},
    ]}/>
  </Flex>;
}
