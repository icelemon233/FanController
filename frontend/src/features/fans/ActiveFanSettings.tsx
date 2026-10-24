import { Alert, Flex, Table, Tag, Typography } from 'antd';
import { curveLabel, sourceLabel } from './coolingPlan.ts';
import { type Channel, channelName, rpmFor, type Snapshot } from './model.ts';

export default function ActiveFanSettings({
  snapshot,
  stale = false,
}: {
  snapshot: Snapshot;
  stale?: boolean;
}) {
  const active = snapshot.Snapshot.Channels.filter((channel) => channel.Owned);
  return (
    <Flex vertical gap={16}>
      <Table<Channel>
        scroll={{ x: 600 }}
        size="small"
        pagination={false}
        rowKey="Id"
        dataSource={active}
        expandable={{
          expandedRowRender: (channel) => {
            const profile = channel.ActiveProfile;
            return profile ? (
              <Flex vertical gap={8}>
                <Typography.Text className="curve-summary">{curveLabel(profile)}</Typography.Text>
                {profile.Mode === 2 && (
                  <Typography.Text type="secondary">
                    {profile.RiseSeconds == null && profile.FallSeconds == null
                      ? '旧版响应：升温直接响应，降温 3°C 后更新'
                      : `升温平滑 ${profile.RiseSeconds ?? 0} 秒 · 降温平滑 ${profile.FallSeconds ?? 0} 秒`}
                    · 输出下降每秒最多 3 个百分点
                  </Typography.Text>
                )}
                <Typography.Text type="secondary">通道 {channel.Id}</Typography.Text>
              </Flex>
            ) : (
              <Alert type="warning" title="设置记录暂不可用，请重新打开方案核对" />
            );
          },
        }}
        columns={[
          {
            title: stale ? '上次接管' : '正在调节',
            key: 'name',
            render: (_, channel) => (
              <Flex vertical gap={4}>
                <Typography.Text strong>{channelName(channel, snapshot)}</Typography.Text>
                <Tag
                  color={
                    stale
                      ? 'default'
                      : channel.Error
                        ? 'error'
                        : channel.Status.includes('保护')
                          ? 'warning'
                          : 'processing'
                  }
                >
                  {stale ? '状态未确认' : channel.Status}
                </Tag>
              </Flex>
            ),
          },
          {
            title: '当前输出 / 实测转速',
            key: 'live',
            render: (_, channel) => {
              const rpm = rpmFor(channel, snapshot);
              return (
                <Flex vertical gap={4}>
                  <Typography.Text>{stale ? '—' : `${channel.Target ?? '—'}%`}</Typography.Text>
                  <Typography.Text type="secondary">
                    {stale ? '读数已过期' : rpm === null ? '暂无转速' : `${Math.round(rpm)} RPM`}
                  </Typography.Text>
                </Flex>
              );
            },
          },
          {
            title: stale ? '上次应用参数' : '已应用参数',
            key: 'parameters',
            render: (_, channel) => {
              const profile = channel.ActiveProfile;
              return profile ? (
                <Flex vertical gap={4}>
                  <Typography.Text>
                    {profile.Mode === 1
                      ? `固定输出 ${profile.Manual}%`
                      : sourceLabel(profile.Source, snapshot)}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    最低 {profile.Minimum}% · 展开查看{profile.Mode === 2 ? '完整曲线' : '详情'}
                  </Typography.Text>
                </Flex>
              ) : (
                '当前参数不可用'
              );
            },
          },
        ]}
      />
      <Typography.Text type="secondary">
        {stale
          ? '当前硬件状态未确认，重新连接后会更新。'
          : `其余 ${snapshot.Snapshot.Channels.length - active.length} 组风扇使用原设置。`}
      </Typography.Text>
    </Flex>
  );
}
