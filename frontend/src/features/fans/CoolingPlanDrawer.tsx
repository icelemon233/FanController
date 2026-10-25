import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Drawer,
  Empty,
  Flex,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd';
import { Check, Eye, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useDraftClose } from '../../components/useDraftClose.ts';
import {
  createPlanDraft,
  curveLabel,
  type PlanEntry,
  planError,
  planProfiles,
  quietProfile,
  roleLabels,
  sourceLabel,
} from './coolingPlan.ts';
import { type FanProfile, type FanRole, rpmFor, type Snapshot } from './model.ts';
import PlanFanEditor from './PlanFanEditor.tsx';

const { Text, Paragraph, Title } = Typography;

export default function CoolingPlanDrawer({
  snapshot,
  busy,
  connected,
  onClose,
  onApply,
}: {
  snapshot: Snapshot;
  busy: boolean;
  connected: boolean;
  onClose: () => void;
  onApply: (profiles: FanProfile[]) => Promise<boolean>;
}) {
  const [entries, setEntries] = useState<PlanEntry[]>(() => createPlanDraft(snapshot));
  const [selectedId, setSelectedId] = useState(
    () => entries.find((entry) => entry.included)?.profile.Id ?? entries[0]?.profile.Id,
  );
  const [reviewed, setReviewed] = useState<FanProfile[] | null>(null);
  const closeDraft = useDraftClose(entries, busy, onClose);
  const selected = entries.find((entry) => entry.profile.Id === selectedId);
  const selectedChannel = snapshot.Snapshot.Channels.find((channel) => channel.Id === selectedId);
  const error = planError(entries, snapshot);
  const count = entries.filter((entry) => entry.included).length;
  const patch = (id: string, value: Partial<FanProfile>) =>
    setEntries((current) =>
      current.map((entry) =>
        entry.profile.Id === id ? { ...entry, profile: { ...entry.profile, ...value } } : entry,
      ),
    );
  const patchSelected = (value: Partial<FanProfile>) => {
    if (selectedId) patch(selectedId, value);
  };
  const changeRole = (entry: PlanEntry, role: FanRole) => {
    const channel = snapshot.Snapshot.Channels.find((item) => item.Id === entry.profile.Id);
    if (!channel) return;
    const quiet = quietProfile(channel, snapshot, role);
    setEntries((current) =>
      current.map((item) =>
        item.profile.Id === entry.profile.Id
          ? {
              profile: {
                ...quiet,
                Name: item.profile.Name,
                Minimum: item.profile.Minimum,
                RpmId: item.profile.RpmId,
              },
              included: role === 'CPU' || role === 'Case',
            }
          : item,
      ),
    );
    setSelectedId(entry.profile.Id);
  };
  const useQuiet = () => {
    if (!selected || !selectedChannel) return;
    patchSelected({
      ...quietProfile(selectedChannel, snapshot, selected.profile.Role ?? 'Unknown'),
      Name: selected.profile.Name,
      Minimum: selected.profile.Minimum,
      RpmId: selected.profile.RpmId,
    });
  };
  return (
    <Drawer
      title="调节方案"
      size={1120}
      className="plan-drawer"
      open
      onClose={closeDraft}
      keyboard={!busy}
      mask={{ closable: !busy }}
      footer={
        <Flex justify="space-between" align="center" gap={12} wrap>
          <Text type="secondary">
            {reviewed
              ? '应用下方列出的参数，未勾选的风扇恢复原设置。'
              : '编辑期间风扇继续使用当前设置。'}
          </Text>
          <Space>
            <Button disabled={busy} onClick={reviewed ? () => setReviewed(null) : closeDraft}>
              {reviewed ? '返回编辑' : '取消'}
            </Button>
            <Button
              type="primary"
              data-testid={reviewed ? 'apply-plan' : 'review-plan'}
              icon={reviewed ? <Check aria-hidden="true" /> : <Eye aria-hidden="true" />}
              loading={busy}
              disabled={busy || !connected || Boolean(error)}
              onClick={async () => {
                if (reviewed) {
                  if (await onApply(reviewed)) onClose();
                } else setReviewed(planProfiles(entries));
              }}
            >
              {reviewed ? '应用方案' : '预览应用内容'}
            </Button>
          </Space>
        </Flex>
      }
    >
      <Flex vertical gap={24}>
        <Steps
          size="small"
          current={reviewed ? 1 : 0}
          items={[{ title: '选择风扇与参数' }, { title: '核对后应用' }]}
        />
        {!connected && <Alert type="warning" showIcon title="硬件连接未就绪，恢复连接后才能应用" />}
        {error && <Alert type="warning" showIcon title={error} />}
        {reviewed ? (
          <Flex vertical gap={16} data-testid="plan-review">
            <Flex justify="space-between" align="center">
              <Title level={4} style={{ margin: 0 }}>
                将调节 {count} 组风扇
              </Title>
              <Tag>尚未应用</Tag>
            </Flex>
            {reviewed.map((profile) => {
              const channel = snapshot.Snapshot.Channels.find((item) => item.Id === profile.Id);
              const owned = Boolean(channel?.Owned);
              return (
                <Card
                  key={profile.Id}
                  size="small"
                  className="plan-review-row"
                  title={profile.Name}
                  extra={
                    <Tag color={profile.Mode !== 0 ? 'processing' : owned ? 'warning' : 'default'}>
                      {profile.Mode !== 0 ? '接管并调节' : owned ? '恢复原设置' : '保留原设置'}
                    </Tag>
                  }
                >
                  <Flex vertical gap={10}>
                    <Text type="secondary">
                      {roleLabels[profile.Role ?? 'Unknown']} · 通道 {profile.Id}
                    </Text>
                    {profile.Mode !== 0 ? (
                      <>
                        <Text>
                          {profile.Mode === 1 ? '固定输出' : sourceLabel(profile.Source, snapshot)}{' '}
                          · 最低输出 {profile.Minimum}%
                          {profile.Mode === 2
                            ? ` · 升温平滑 ${profile.RiseSeconds ?? 0} 秒 / 降温平滑 ${profile.FallSeconds ?? 0} 秒`
                            : ''}
                        </Text>
                        <Text className="curve-summary">{curveLabel(profile)}</Text>
                        <Text type="secondary">
                          转速读数：
                          {profile.RpmId
                            ? (snapshot.Snapshot.Sensors.find(
                                (sensor) => sensor.Id === profile.RpmId,
                              )?.Name ?? profile.RpmId)
                            : '不显示'}
                        </Text>
                      </>
                    ) : (
                      <Text type="secondary">
                        {owned
                          ? '停止 FanController 调节，恢复接管前的设置。'
                          : '保留当前硬件设置，仅保存用途和排除状态。'}
                      </Text>
                    )}
                  </Flex>
                </Card>
              );
            })}
            <Alert
              type="info"
              showIcon
              title="高温保护始终优先"
              description="CPU 达到 90°C、GPU 非热点温度达到 90°C或热点达到 105°C、必要温度失效时，已接管风扇立即设为最高输出。曲线设为 100% 的末节点同样立即生效。硬件可能进一步限制输出范围。"
            />
          </Flex>
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              title="以日常安静为起点"
              description="CPU 与机箱使用不同曲线；显卡默认保留原设置。Fan # 等通道需先确认用途，水泵保留原设置。已有参数会保留，可逐组修改。"
            />
            <div className="plan-workspace">
              <Flex vertical gap={12} className="plan-channel-list">
                <Flex justify="space-between" align="center">
                  <Text strong>参与调节的风扇</Text>
                  <Text type="secondary">
                    已选 {count} / {entries.length}
                  </Text>
                </Flex>
                {!entries.length && <Empty description="未检测到可控风扇" />}
                {entries.map((entry) => {
                  const channel = snapshot.Snapshot.Channels.find(
                    (item) => item.Id === entry.profile.Id,
                  );
                  if (!channel) return null;
                  const role = entry.profile.Role ?? 'Unknown';
                  const immutableRole = channel.Group === 'GPU' || /pump|水泵/i.test(channel.Name);
                  const rpm = rpmFor(channel, snapshot);
                  return (
                    <Card
                      key={entry.profile.Id}
                      size="small"
                      className={`plan-channel ${selectedId === entry.profile.Id ? 'plan-channel-selected' : ''}`}
                    >
                      <Flex vertical gap={12}>
                        <Flex justify="space-between" align="start" gap={12}>
                          <Checkbox
                            aria-label={`调节${entry.profile.Name}`}
                            data-testid={`plan-include-${entry.profile.Id}`}
                            checked={entry.included}
                            disabled={busy || role === 'Unknown' || role === 'Pump'}
                            onChange={(event) =>
                              setEntries((current) =>
                                current.map((item) =>
                                  item.profile.Id === entry.profile.Id
                                    ? { ...item, included: event.target.checked }
                                    : item,
                                ),
                              )
                            }
                          >
                            <Text strong>{entry.profile.Name}</Text>
                          </Checkbox>
                          <Button
                            type="text"
                            size="small"
                            icon={<Pencil aria-hidden="true" />}
                            aria-label={`编辑${entry.profile.Name}`}
                            data-testid={`plan-edit-${entry.profile.Id}`}
                            disabled={busy}
                            onClick={() => setSelectedId(entry.profile.Id)}
                          />
                        </Flex>
                        <Select
                          aria-label={`${entry.profile.Name}的用途`}
                          data-testid={`plan-role-${entry.profile.Id}`}
                          value={role}
                          disabled={busy || immutableRole}
                          onChange={(value: FanRole) => changeRole(entry, value)}
                          options={(immutableRole
                            ? [role]
                            : (['Unknown', 'CPU', 'Case', 'Pump'] as const)
                          ).map((value) => ({ value, label: roleLabels[value] }))}
                        />
                        <Flex justify="space-between" gap={8} wrap>
                          <Text className="tabular-number">
                            {rpm === null ? '暂无转速' : `${Math.round(rpm)} RPM`}
                          </Text>
                          <Text type="secondary">
                            {channel.Owned ? `当前输出 ${channel.Target ?? '—'}%` : '使用原设置'}
                          </Text>
                        </Flex>
                        <Text type="secondary" className="plan-channel-note">
                          {entry.included
                            ? `${sourceLabel(entry.profile.Source, snapshot)} · 最低 ${entry.profile.Minimum}%`
                            : channel.Owned
                              ? '应用方案后恢复原设置'
                              : role === 'Unknown'
                                ? '用途待确认，暂不调节'
                                : role === 'GPU'
                                  ? '驱动支持时可低负载停转'
                                  : '保持原设置'}
                        </Text>
                      </Flex>
                    </Card>
                  );
                })}
              </Flex>
              <div className="plan-parameters">
                {selected && selectedChannel ? (
                  <PlanFanEditor
                    key={selectedId}
                    entry={selected}
                    snapshot={snapshot}
                    busy={busy}
                    onPatch={patchSelected}
                    onUseQuiet={useQuiet}
                  />
                ) : (
                  <Empty description="选择一组风扇查看参数" />
                )}
              </div>
            </div>
            <Collapse
              items={[
                {
                  key: 'rpm',
                  label: '多少 RPM 合适？',
                  children: (
                    <Flex vertical gap={8}>
                      <Paragraph>
                        没有统一转速。常见 120 / 140 mm 机箱风扇可先在实测 700–900 RPM、塔式 CPU
                        散热风扇在 700–1100 RPM
                        附近试听。这些只用于低负载初调，风扇尺寸、型号、室温和散热器不同，合适范围也不同；小风扇、冷排风扇和水泵不能直接套用。
                      </Paragraph>
                      <Paragraph>
                        先确认最低输出下能稳定运转，再检查日常和持续负载温度。若噪声可接受、温度未接近硬件限制，就没有必要为了更低温度持续拉高转速。应用设置的是输出百分比，RPM
                        是传感器实测值，当前没有自动转速标定。
                      </Paragraph>
                      <Space wrap>
                        <Typography.Link
                          href="https://www.noctua.at/en/support/faqs/how-do-i-optimise-my-fan-settings"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Noctua 调节指南
                        </Typography.Link>
                        <Typography.Link
                          href="https://www.amd.com/en/resources/support-articles/faqs/DH3-020.html"
                          target="_blank"
                          rel="noreferrer"
                        >
                          AMD 显卡停转说明
                        </Typography.Link>
                      </Space>
                    </Flex>
                  ),
                },
              ]}
            />
          </>
        )}
      </Flex>
    </Drawer>
  );
}
