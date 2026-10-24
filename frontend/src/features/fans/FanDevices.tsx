import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Table,
  Tag,
  Typography,
} from 'antd';
import { lazy, Suspense, useRef, useState } from 'react';
import { sourceLabel } from './coolingPlan.ts';
import { useFanControl } from './FanControlProvider.tsx';
import { type Channel, channelName, type FanProfile, gpuName, rpmFor } from './model.ts';

const FanSettingsDrawer = lazy(() => import('./FanSettingsDrawer.tsx'));
const { Text } = Typography;

export default function FanDevices() {
  const { state, controller } = useFanControl();
  const [editor, setEditor] = useState<{ id: string; session: number } | null>(null);
  const sequence = useRef(0);
  const snapshot = state.snapshot;
  if (!snapshot) return null;
  const frame = snapshot.Snapshot,
    channels = frame.Channels,
    fallbackGpu = gpuName(frame);
  const name = (channel: Channel) => channelName(channel, snapshot);
  const openChannel = (channel: Channel) =>
    setEditor({ id: channel.Id, session: ++sequence.current });
  const selected = channels.find((channel) => channel.Id === editor?.id);
  const stale = state.connection.kind !== 'ready';
  const closeEditor = () => setEditor(null);
  const apply = async (profile: FanProfile) => {
    const session = editor?.session;
    const success = await controller.applyProfile(profile);
    if (success) setEditor((current) => (current?.session === session ? null : current));
    return success;
  };
  return (
    <>
      <Card
        className="fan-table"
        title="可控风扇"
        extra={<Text type="secondary">共 {channels.length} 组</Text>}
        styles={{ body: { padding: 0 } }}
      >
        <Table<Channel>
          scroll={{ x: 720 }}
          rowKey="Id"
          pagination={false}
          dataSource={channels}
          locale={{ emptyText: <Empty description="未检测到可控风扇" /> }}
          columns={[
            {
              title: '风扇',
              key: 'name',
              render: (_, c) => (
                <Flex vertical gap={4}>
                  <Text strong>{name(c)}</Text>
                  <Text type="secondary">{c.Group === 'GPU' ? '显卡风扇' : '主板风扇'}</Text>
                </Flex>
              ),
            },
            {
              title: '当前状态',
              key: 'status',
              render: (_, c) => (
                <Tag
                  color={
                    stale
                      ? 'default'
                      : c.Error
                        ? 'error'
                        : c.Status.includes('保护')
                          ? 'warning'
                          : c.Owned
                            ? 'processing'
                            : 'default'
                  }
                >
                  {stale ? '状态未确认' : c.Error ? '控制异常' : c.Owned ? c.Status : '未接管'}
                </Tag>
              ),
            },
            {
              title: '转速',
              key: 'rpm',
              align: 'right',
              render: (_, c) => {
                const v = stale ? null : rpmFor(c, snapshot);
                return v === null ? (
                  <Text type="secondary">{stale ? '读数已过期' : '暂无读数'}</Text>
                ) : (
                  <Text className="tabular-number">{Math.round(v).toLocaleString()} RPM</Text>
                );
              },
            },
            {
              title: '用途 / 温度来源',
              key: 'source',
              render: (_, c) => {
                const r = snapshot.Recommendations.find((r) => r.Id === c.Id);
                return (
                  <Text type="secondary">
                    {c.Owned && c.ActiveProfile
                      ? sourceLabel(c.ActiveProfile.Source, snapshot)
                      : r?.Eligible
                        ? r.SourceLabel
                        : (r?.Reason ?? '请确认风扇用途')}
                  </Text>
                );
              },
            },
            {
              title: '',
              key: 'action',
              width: 80,
              render: (_, c) => (
                <Button
                  type="link"
                  data-testid={`configure-${c.Id}`}
                  aria-label={`设置${name(c)}`}
                  onClick={() => openChannel(c)}
                >
                  设置
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Collapse
        className="sensor-details"
        items={[
          {
            key: 'sensors',
            label: `传感器与检测详情（${frame.Sensors.length} 项）`,
            children: (
              <Flex vertical gap={16}>
                <Descriptions
                  size="small"
                  column={1}
                  items={[
                    { key: 'cpu', label: '处理器', children: frame.Cpu },
                    { key: 'gpu', label: '显卡', children: fallbackGpu },
                    { key: 'board', label: '主板', children: frame.Board },
                    {
                      key: 'access',
                      label: '主板访问',
                      children:
                        frame.PawnIoInstalled && frame.Administrator
                          ? '已启用'
                          : !frame.PawnIoInstalled
                            ? '未安装硬件组件'
                            : '未获得访问权限',
                    },
                  ]}
                />
                <Table
                  scroll={{ x: 560 }}
                  size="small"
                  rowKey="Id"
                  pagination={false}
                  dataSource={frame.Sensors}
                  columns={[
                    { title: '名称', dataIndex: 'Name' },
                    { title: '设备', dataIndex: 'Device', ellipsis: true },
                    {
                      title: stale ? '上次读数（已过期）' : '当前读数',
                      key: 'value',
                      render: (_, s) =>
                        s.Value === null
                          ? '—'
                          : `${s.Value.toFixed(s.Kind === 'Fan' ? 0 : 1)} ${s.Kind === 'Fan' ? 'RPM' : s.Kind === 'Temperature' ? '°C' : '%'}`,
                    },
                  ]}
                />
                {[...new Set(frame.Notices)].map((notice) => (
                  <Text type="secondary" key={notice}>
                    {notice}
                  </Text>
                ))}
              </Flex>
            ),
          },
        ]}
      />

      {editor && (
        <Suspense fallback={null}>
          {selected ? (
            <FanSettingsDrawer
              key={editor.session}
              channel={selected}
              snapshot={snapshot}
              busy={Boolean(state.busy)}
              connected={state.connection.kind === 'ready'}
              onClose={closeEditor}
              onApply={apply}
            />
          ) : (
            <Drawer title="风扇设置" open onClose={closeEditor}>
              <Alert
                type="warning"
                showIcon
                title="这组风扇已不可用"
                description="请关闭设置并重新检测设备。"
              />
            </Drawer>
          )}
        </Suspense>
      )}
    </>
  );
}
