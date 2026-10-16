import {
  AudioMutedOutlined,
  CheckCircleOutlined,
  ControlOutlined,
  DesktopOutlined,
  FundProjectionScreenOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Card, Flex, Space, Statistic, Tag, Typography, theme } from 'antd';
import { FanIcon } from '../../components/FanIcon.tsx';
import { useFanControl } from './FanControlProvider.tsx';
import { type CoolingMode, gpuName, readTemperature, rpmFor, summarizeFans } from './model.ts';
import MiniTrend from './TemperatureTrend.tsx';

const { Text, Title } = Typography;
const modes = [
  {
    name: '静音' as const,
    icon: <AudioMutedOutlined />,
    description: '低温时保持较低输出',
    detail: '办公、网页浏览',
  },
  {
    name: '均衡' as const,
    icon: <ControlOutlined />,
    description: '温度升高时逐步提速',
    detail: '日常使用',
  },
  {
    name: '强冷' as const,
    icon: <ThunderboltOutlined />,
    description: '较早提高风扇输出',
    detail: '游戏、持续高负载',
  },
];

export default function FanOverview({ onDevices }: { onDevices: () => void }) {
  const { token } = theme.useToken();
  const { state, controller } = useFanControl();
  const snapshot = state.snapshot;
  if (!snapshot) return null;
  const frame = snapshot.Snapshot;
  const { active, eligible, needsSetup } = summarizeFans(snapshot);
  const busy = state.busy,
    stale = state.connection.kind !== 'ready';
  const selectedMode = state.selectedMode,
    history = state.history;
  const cooling = frame.CoolingMode,
    channels = frame.Channels,
    fallbackGpu = gpuName(frame);
  const chooseMode = (mode: CoolingMode) => {
    void controller.selectMode(mode);
  };
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
                  : `${cooling ?? selectedMode}模式`
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
          <div>
            <Title level={4}>风扇模式</Title>
            <Text type="secondary">
              {active
                ? cooling === '自定义'
                  ? '选择主页模式会替换参与风扇的单组设置。'
                  : '点击模式即可切换，风扇输出随温度变化。'
                : '选择模式后，点击“开启自动调节”。'}
            </Text>
          </div>
          <Space>
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
              data-testid="smart-start"
              type="primary"
              size="large"
              icon={active ? <ReloadOutlined /> : <PoweroffOutlined />}
              loading={busy === 'smart'}
              disabled={!frame || eligible === 0 || Boolean(busy) || stale}
              onClick={() => controller.startSelectedMode()}
            >
              {active ? '应用所选模式' : '开启自动调节'}
            </Button>
          </Space>
        </Flex>
        <div className="mode-grid">
          {modes.map((mode) => (
            <Button
              key={mode.name}
              data-testid={`mode-${mode.name}`}
              className={`mode-option ${selectedMode === mode.name ? 'mode-selected' : ''}`}
              disabled={Boolean(busy) || stale}
              onClick={() => chooseMode(mode.name)}
              aria-pressed={selectedMode === mode.name}
            >
              <div className="mode-option-content">
                <Flex gap={10} align="center">
                  <span className="mode-icon">{mode.icon}</span>
                  <Text strong>{mode.name}</Text>
                  {mode.name === '均衡' && <Text className="mode-default">默认</Text>}
                </Flex>
                <Text className="mode-description">{mode.description}</Text>
                <Text type="secondary" className="mode-detail">
                  {mode.detail}
                </Text>
              </div>
              {selectedMode === mode.name && <CheckCircleOutlined className="selected-check" />}
            </Button>
          ))}
        </div>
        <Flex className="protection-note" justify="space-between" gap={16} wrap>
          <Space>
            <SafetyCertificateOutlined />
            <Text type="secondary">已接管风扇遇到高温或必要温度缺失时，会设为最高输出。</Text>
          </Space>
          <Button type="link" size="small" onClick={() => onDevices()}>
            设置单组风扇
          </Button>
        </Flex>
      </Card>
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
