import {
  ControlOutlined,
  DesktopOutlined,
  FundProjectionScreenOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Button, Card, Descriptions, Flex, Space, Statistic, Tag, Typography, theme } from 'antd';
import { lazy, Suspense, useRef, useState } from 'react';
import { FanIcon } from '../../components/FanIcon.tsx';
import ActiveFanSettings from './ActiveFanSettings.tsx';
import { useFanControl } from './FanControlProvider.tsx';
import { gpuName, readTemperature, rpmFor, summarizeFans } from './model.ts';
import MiniTrend from './TemperatureTrend.tsx';

const { Text, Title } = Typography;
const CoolingPlanDrawer = lazy(() => import('./CoolingPlanDrawer.tsx'));

export default function FanOverview({ onDevices }: { onDevices: () => void }) {
  const { token } = theme.useToken();
  const { state, controller } = useFanControl();
  const [planSession, setPlanSession] = useState<number | null>(null);
  const sequence = useRef(0);
  const snapshot = state.snapshot;
  if (!snapshot) return null;
  const frame = snapshot.Snapshot;
  const { active, eligible, needsSetup } = summarizeFans(snapshot);
  const busy = state.busy,
    stale = state.connection.kind !== 'ready';
  const history = state.history;
  const cooling = frame.CoolingMode,
    channels = frame.Channels,
    fallbackGpu = gpuName(frame);
  const stats = [
    {
      key: 'CPU',
      label: 'CPU 温度',
      value: readTemperature(frame, 'CPU'),
      name: frame.Cpu,
      values: history.cpu,
      color: token.colorPrimary,
    },
    {
      key: 'GPU',
      label: 'GPU 温度',
      value: readTemperature(frame, 'GPU'),
      name: fallbackGpu,
      values: history.gpu,
      color: token.colorPrimary,
    },
  ];
  return (
    <>
      <div className="overview-board">
        <Card className="thermal-panel" styles={{ body: { padding: 0 } }}>
          <div className="thermal-readings">
            {stats.map((stat) => (
              <div key={stat.key} className="temperature-reading">
                <Flex className="temperature-head" justify="space-between" align="center">
                  <Text>{stat.label}</Text>
                  {stat.value !== null && (
                    <Tag
                      variant="filled"
                      color={stat.value >= 90 ? 'red' : stat.value >= 75 ? 'orange' : undefined}
                    >
                      {stat.value >= 90 ? '高温' : stat.value >= 75 ? '较热' : '正常'}
                    </Tag>
                  )}
                </Flex>
                <div className="stat-value-row">
                  <Statistic
                    value={stat.value ?? '—'}
                    precision={0}
                    suffix={
                      stat.value !== null ? <span className="temperature-unit">°C</span> : null
                    }
                  />
                  <MiniTrend values={stat.values} color={stat.color} />
                </div>
                <Text type="secondary" className="stat-subtitle" ellipsis>
                  {stat.value === null
                    ? stat.key === 'CPU' && needsSetup
                      ? '请先启用主板访问'
                      : '暂无有效温度读数'
                    : stat.name}
                </Text>
              </div>
            ))}
          </div>
        </Card>
        <Card className="control-status-panel">
          <Flex justify="space-between" align="center">
            <Text>已接管风扇</Text>
            <Tag color={active ? 'blue' : undefined} variant="filled">
              {active ? '调节中' : '未开启'}
            </Tag>
          </Flex>
          <div className="stat-value-row">
            <Statistic value={active} suffix={<span className="temperature-unit">组</span>} />
            <FanIcon
              spin={active > 0}
              style={{
                fontSize: 32,
                color: active ? token.colorPrimary : token.colorTextSecondary,
              }}
            />
          </div>
          <Flex justify="space-between" align="center" gap={12}>
            <Text type="secondary" className="stat-subtitle">
              {active
                ? cooling === '自定义'
                  ? '使用自定义设置'
                  : `${cooling ?? '已应用方案'}`
                : `${eligible} 组可自动调节`}
            </Text>
            <Button type="text" size="small" onClick={() => onDevices()}>
              查看风扇
            </Button>
          </Flex>
        </Card>
      </div>
      <Card className="cooling-card" styles={{ body: { padding: 24 } }}>
        <Flex className="cooling-heading" justify="space-between" align="center" gap={16}>
          <Title level={4}>风扇调节</Title>
          <Space wrap>
            {active > 0 && (
              <Button
                data-testid="release-all"
                disabled={Boolean(busy) || stale}
                loading={busy === 'release'}
                onClick={() => controller.release()}
              >
                恢复原设置
              </Button>
            )}
            <Button
              data-testid="configure-plan"
              type="primary"
              icon={<ControlOutlined />}
              disabled={Boolean(busy) || stale || !channels.length}
              onClick={() => setPlanSession(++sequence.current)}
            >
              配置与预览
            </Button>
          </Space>
        </Flex>
        {active > 0 ? (
          <ActiveFanSettings snapshot={snapshot} />
        ) : (
          <>
            <Title level={5} style={{ margin: '24px 0 16px' }}>
              日常安静起点
            </Title>
            <Descriptions
              column={{ xs: 1, sm: 1, md: 2 }}
              items={[
                { key: 'cpu', label: 'CPU 风扇', children: '50°C 以内 40%，升温后逐步提速' },
                { key: 'case', label: '机箱风扇', children: '55°C 以内 30%，减少频繁变速' },
                { key: 'gpu', label: '显卡风扇', children: '保留原设置，支持时低负载停转' },
                {
                  key: 'unknown',
                  label: '未确认通道 / 水泵',
                  children: '保留原设置，确认用途后再配置',
                },
              ]}
            />
            <Text type="secondary">
              曲线是可调整的起点，实际输出受各组最低值限制。先核对风扇和参数，再应用。
            </Text>
          </>
        )}
        <Flex className="protection-note" justify="space-between" gap={16} wrap>
          <Space>
            <SafetyCertificateOutlined />
            <Text type="secondary">高温或必要温度失效时，已接管风扇立即设为最高输出。</Text>
          </Space>
          <Button type="link" size="small" onClick={() => onDevices()}>
            查看单组设置
          </Button>
        </Flex>
      </Card>
      {planSession !== null && (
        <Suspense fallback={null}>
          <CoolingPlanDrawer
            key={planSession}
            snapshot={snapshot}
            busy={Boolean(busy)}
            connected={!stale}
            onApply={controller.applyPlan}
            onClose={() => setPlanSession((current) => (current === planSession ? null : current))}
          />
        </Suspense>
      )}
      <div className="section-heading">
        <Title level={5}>设备状态</Title>
      </div>
      <div className="device-list">
        {[
          {
            group: 'GPU',
            title: '显卡风扇',
            icon: <FundProjectionScreenOutlined />,
            device: fallbackGpu,
          },
          {
            group: '主板',
            title: 'CPU 与机箱风扇',
            icon: <DesktopOutlined />,
            device: frame?.Board,
          },
        ].map((device) => {
          const groupChannels = channels.filter((c) => c.Group === device.group);
          const managed = groupChannels.filter((c) => c.Owned).length;
          const rpms = snapshot
            ? groupChannels.map((c) => rpmFor(c, snapshot)).filter((r): r is number => r !== null)
            : [];
          return (
            <Card key={device.group} size="small" className="device-row">
              <div className="device-identity">
                <span className="device-icon">{device.icon}</span>
                <div>
                  <Text strong>{device.title}</Text>
                  <Text type="secondary" className="device-model" ellipsis>
                    {device.device ?? '未识别设备'}
                  </Text>
                </div>
              </div>
              <div className="device-state">
                <Tag color={managed ? 'blue' : undefined} variant="filled">
                  {managed
                    ? groupChannels.some((c) => c.Owned && c.Mode === 1)
                      ? '单组设置'
                      : '自动调节'
                    : groupChannels.length
                      ? '未接管'
                      : device.group === '主板' && needsSetup
                        ? '待授权'
                        : '无可控风扇'}
                </Tag>
                <Text type="secondary">
                  {groupChannels.length
                    ? `${groupChannels.length} 组可控，${managed} 组已接管`
                    : device.group === '主板' && needsSetup
                      ? '请先启用主板访问'
                      : '未检测到可控接口'}
                </Text>
              </div>
              <Text className="device-rpm">
                {rpms.length
                  ? rpms.length === 1 && rpms[0] !== undefined
                    ? `${Math.round(rpms[0]).toLocaleString()} RPM`
                    : `${Math.round(Math.min(...rpms))}–${Math.round(Math.max(...rpms))} RPM`
                  : '暂无转速'}
              </Text>
              <Button type="text" onClick={() => onDevices()}>
                查看
              </Button>
            </Card>
          );
        })}
      </div>
    </>
  );
}
