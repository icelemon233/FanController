import { Flex, Table, Tag, Typography, theme } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { NumberInput as InputNumber } from '../../components/NumberInput.tsx';
import type { CurvePoint } from './model.ts';

export default function CurveEditor({
  points,
  minimum,
  onChange,
}: {
  points: CurvePoint[];
  minimum: number;
  onChange: (points: CurvePoint[]) => void;
}) {
  const { token } = theme.useToken();
  const svg = useRef<SVGSVGElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setWidth(Math.max(240, element.clientWidth - 8));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);
  const drag = useRef<number | null>(null);
  const height = 200,
    left = 38,
    right = 18,
    top = 16,
    bottom = 32;
  const x = (t: number) => left + ((t - 20) / 90) * (width - left - right);
  const y = (d: number) => height - bottom - (d / 100) * (height - top - bottom);
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.Temperature)},${y(Math.max(minimum, p.Duty))}`)
    .join(' ');
  const first = points[0],
    last = points.at(-1);
  const update = (i: number, key: keyof CurvePoint, value: number | null) => {
    if (value === null) return;
    onChange(points.map((p, j) => (j === i ? { ...p, [key]: value } : p)));
  };
  return (
    <Flex vertical gap={12}>
      <div
        ref={container}
        className="curve-canvas"
        style={{ background: token.colorFillQuaternary, borderColor: token.colorBorderSecondary }}
      >
        <svg
          ref={svg}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="风扇输出曲线，拖动节点可调整温度和输出"
          onPointerMove={(event) => {
            if (drag.current === null || !svg.current) return;
            const i = drag.current;
            if (!points[i]) return;
            const previous = points[i - 1],
              next = points[i + 1];
            const box = svg.current.getBoundingClientRect();
            const px = ((event.clientX - box.left) / box.width) * width,
              py = ((event.clientY - box.top) / box.height) * height;
            const t = Math.max(
              previous ? previous.Temperature + 1 : 20,
              Math.min(
                next ? next.Temperature - 1 : 110,
                Math.round(20 + ((px - left) / (width - left - right)) * 90),
              ),
            );
            const d = Math.max(
              previous ? previous.Duty : 0,
              Math.min(
                next ? next.Duty : 100,
                Math.round(((height - bottom - py) / (height - top - bottom)) * 100),
              ),
            );
            onChange(points.map((p, j) => (j === i ? { Temperature: t, Duty: d } : p)));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          {[0, 25, 50, 75, 100].map((d) => (
            <g key={d}>
              <line
                x1={left}
                y1={y(d)}
                x2={width - right}
                y2={y(d)}
                stroke={token.colorBorderSecondary}
              />
              <text
                x={left - 9}
                y={y(d) + 4}
                fill={token.colorTextTertiary}
                textAnchor="end"
                fontSize="12"
              >
                {d}
              </text>
            </g>
          ))}
          {(width < 420 ? [20, 50, 80, 110] : [20, 35, 50, 65, 80, 95, 110]).map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 10}
              fill={token.colorTextTertiary}
              textAnchor="middle"
              fontSize="12"
            >
              {t}°
            </text>
          ))}
          <line
            x1={left}
            y1={y(minimum)}
            x2={width - right}
            y2={y(minimum)}
            stroke={token.colorPrimaryBorder}
            strokeDasharray="4 4"
          />
          {first && last && (
            <>
              <path
                d={`${line} L${x(last.Temperature)},${y(0)} L${x(first.Temperature)},${y(0)} Z`}
                fill={token.colorPrimaryBg}
              />
              <path
                d={line}
                fill="none"
                stroke={token.colorPrimary}
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {points.map((p, i) => (
                // 节点按固定序号保持身份，拖动改变温度时不能重建节点并丢失指针捕获。
                <circle
                  key={i}
                  cx={x(p.Temperature)}
                  cy={y(Math.max(minimum, p.Duty))}
                  r={6}
                  fill={token.colorBgContainer}
                  stroke={token.colorPrimary}
                  strokeWidth="2.5"
                  style={{ cursor: 'grab', touchAction: 'none' }}
                  onPointerDown={(event) => {
                    drag.current = i;
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                />
              ))}
            </>
          )}
        </svg>
      </div>
      <Flex justify="space-between" align="center">
        <Typography.Text type="secondary">拖动节点或修改下表数值</Typography.Text>
        <Tag variant="filled">最低输出 {minimum}%</Tag>
      </Flex>
      <Table
        scroll={{ x: 300 }}
        size="small"
        pagination={false}
        rowKey="index"
        dataSource={points.map((p, index) => ({ ...p, index }))}
        columns={[
          { title: '节点', dataIndex: 'index', width: 70, render: (i: number) => i + 1 },
          {
            title: '温度',
            dataIndex: 'Temperature',
            render: (value: number, row: CurvePoint & { index: number }) => (
              <InputNumber
                aria-label={`节点 ${row.index + 1} 的温度`}
                value={value}
                min={20}
                max={110}
                precision={0}
                suffix="°C"
                onChange={(v) => update(row.index, 'Temperature', v)}
              />
            ),
          },
          {
            title: '风扇输出',
            dataIndex: 'Duty',
            render: (value: number, row: CurvePoint & { index: number }) => (
              <InputNumber
                aria-label={`节点 ${row.index + 1} 的输出`}
                value={value}
                min={0}
                max={100}
                precision={0}
                suffix="%"
                onChange={(v) => update(row.index, 'Duty', v)}
              />
            ),
          },
        ]}
      />
    </Flex>
  );
}
