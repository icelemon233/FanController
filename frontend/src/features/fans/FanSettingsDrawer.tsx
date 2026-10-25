import {
  Alert,
  Button,
  Collapse,
  Drawer,
  Flex,
  Form,
  Input,
  Radio,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { Check, SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';
import { NumberInput as InputNumber } from '../../components/NumberInput.tsx';
import { useDraftClose } from '../../components/useDraftClose.ts';
import CurveEditor from './CurveEditor.tsx';
import { quietProfile, roleFor, roleLabels } from './coolingPlan.ts';
import type { Channel, FanProfile, FanRole, Snapshot } from './model.ts';
import { profileFor, readTemperature, validateProfile } from './model.ts';

export default function FanSettingsDrawer({
  channel,
  snapshot,
  busy,
  connected,
  onClose,
  onApply,
}: {
  channel: Channel;
  snapshot: Snapshot;
  connected: boolean;
  busy: boolean;
  onClose: () => void;
  onApply: (profile: FanProfile) => Promise<boolean>;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState<FanProfile>(() => ({
    ...(snapshot.Profiles.some((item) => item.Id === channel.Id)
      ? profileFor(channel, snapshot)
      : quietProfile(channel, snapshot)),
    Role: roleFor(channel, snapshot),
  }));
  const [manualSource, setManualSource] = useState(
    () => draft.Source !== snapshot.Recommendations.find((item) => item.Id === channel.Id)?.Source,
  );
  const closeDraft = useDraftClose({ draft, manualSource }, busy, onClose);
  const recommendation = snapshot.Recommendations.find((r) => r.Id === channel.Id);
  const role = draft.Role ?? 'Unknown';
  const automaticSource = quietProfile(channel, snapshot, role).Source;
  const unavailable =
    role === 'Unknown' ||
    role === 'Pump' ||
    /pump|水泵/i.test(channel.Name) ||
    Boolean(channel.Error) ||
    readTemperature(snapshot.Snapshot, channel.Group === 'GPU' ? 'GPU' : 'CPU') === null;
  const patch = (value: Partial<FanProfile>) => setDraft((p) => ({ ...p, ...value }));
  const error = validateProfile(draft);
  const disabled = draft.Mode !== 0 && !draft.Excluded && unavailable;
  const apply = async () => {
    const value = structuredClone(draft);
    if (!manualSource) value.Source = automaticSource;
    if (value.Excluded) value.Mode = 0;
    await onApply(value);
  };
  return (
    <Drawer
      className="fan-drawer"
      title={
        <Space>
          <SlidersHorizontal aria-hidden="true" />
          风扇设置
        </Space>
      }
      size={660}
      open
      onClose={closeDraft}
      keyboard={!busy}
      mask={{ closable: !busy }}
      extra={
        <Tag color={channel.Owned ? 'processing' : 'default'}>
          {channel.Owned ? '调节中' : '未接管'}
        </Tag>
      }
      footer={
        <Flex justify="space-between" align="center" gap={16}>
          <Typography.Text type="secondary">点击“应用设置”后生效</Typography.Text>
          <Space>
            <Button disabled={busy} onClick={closeDraft}>
              取消
            </Button>
            <Button
              data-testid="apply-channel"
              type="primary"
              icon={<Check aria-hidden="true" />}
              loading={busy}
              disabled={Boolean(error) || disabled || busy || !connected}
              onClick={apply}
            >
              应用设置
            </Button>
          </Space>
        </Flex>
      }
    >
      <Flex vertical gap={20}>
        <div>
          <Typography.Title level={4} style={{ margin: '0 0 4px' }}>
            {channel.Name}
          </Typography.Title>
          <Typography.Text type="secondary">{channel.Device}</Typography.Text>
        </div>
        {disabled && (
          <Alert
            type="info"
            showIcon
            title={recommendation?.Reason ?? '暂无有效温度读数'}
            description="当前无法调节这组风扇。可选择“恢复原设置”并应用。"
          />
        )}
        <Form layout="vertical" requiredMark={false} disabled={busy}>
          <Form.Item label="显示名称" htmlFor={`${fieldId}-name`}>
            <Input
              id={`${fieldId}-name`}
              aria-label="风扇显示名称"
              value={draft.Name}
              maxLength={60}
              onChange={(e) => patch({ Name: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="风扇用途" htmlFor={`${fieldId}-role`}>
            <Select
              id={`${fieldId}-role`}
              aria-label="风扇用途"
              value={role}
              disabled={busy || channel.Group === 'GPU' || /pump|水泵/i.test(channel.Name)}
              options={(channel.Group === 'GPU'
                ? ['GPU']
                : /pump|水泵/i.test(channel.Name)
                  ? ['Pump']
                  : (['Unknown', 'CPU', 'Case', 'Pump'] as const)
              ).map((value) => ({ value, label: roleLabels[value as FanRole] }))}
              onChange={(Role: FanRole) =>
                patch({ Role, Source: quietProfile(channel, snapshot, Role).Source })
              }
            />
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              按实际接线确认用途。Fan # 只是通道名称，可能未接风扇或连接水泵。
            </Typography.Paragraph>
          </Form.Item>
          <Form.Item label="控制方式">
            <Radio.Group
              aria-label="单组控制方式"
              value={draft.Mode}
              onChange={(e) => patch({ Mode: e.target.value })}
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: '随温度调节', value: 2, disabled: role === 'Pump' || role === 'Unknown' },
                { label: '固定输出', value: 1, disabled: role === 'Pump' || role === 'Unknown' },
                { label: '恢复原设置', value: 0 },
              ]}
            />
          </Form.Item>
          {draft.Mode === 2 && (
            <>
              <Alert
                type="info"
                showIcon
                title={
                  manualSource
                    ? '使用自选温度来源'
                    : automaticSource === 'group/mix'
                      ? 'CPU / GPU 较高温度'
                      : automaticSource === 'group/gpu'
                        ? 'GPU 温度（优先核心）'
                        : 'CPU 最高温度'
                }
                description={manualSource ? '可在“曲线与更多设置”中更换温度来源。' : undefined}
              />
              <Form.Item label="曲线起点" style={{ marginTop: 20 }}>
                <Button
                  disabled={role === 'Unknown' || role === 'Pump'}
                  onClick={() =>
                    patch({
                      ...quietProfile(channel, snapshot, role),
                      Name: draft.Name,
                      Minimum: draft.Minimum,
                      RpmId: draft.RpmId,
                      Excluded: draft.Excluded,
                    })
                  }
                >
                  使用安静起点
                </Button>
              </Form.Item>
            </>
          )}
          {draft.Mode === 1 && (
            <Form.Item
              label={
                <Space>
                  固定输出<Tag color="processing">{draft.Manual}%</Tag>
                </Space>
              }
            >
              <Slider
                ariaLabelForHandle="固定输出百分比"
                min={0}
                max={100}
                value={draft.Manual}
                onChange={(Manual) => patch({ Manual })}
              />
              <Typography.Text type="secondary">
                输出受最低值和硬件范围限制，实际转速以读数为准。
              </Typography.Text>
            </Form.Item>
          )}
          {draft.Mode === 0 && (
            <Alert
              type="info"
              showIcon
              title="应用后恢复原设置"
              description="FanController 将停止调节这组风扇。"
            />
          )}
          <Form.Item label="参与方案默认选择" style={{ marginTop: 24 }}>
            <Space>
              <Switch
                aria-label="参与方案默认选择"
                checked={!draft.Excluded}
                disabled={busy || role === 'Pump' || role === 'Unknown'}
                onChange={(checked) => patch({ Excluded: !checked })}
              />
              <Typography.Text type="secondary">
                关闭并应用后恢复原设置，下次配置方案时默认不勾选这组风扇。
              </Typography.Text>
            </Space>
          </Form.Item>
        </Form>
        <Collapse
          defaultActiveKey={['details']}
          items={[
            {
              key: 'details',
              label: '曲线与更多设置',
              children: (
                <Flex vertical gap={20}>
                  {draft.Mode === 2 && (
                    <>
                      <Space>
                        <Switch
                          aria-label="手动选择温度来源"
                          disabled={busy}
                          checked={manualSource}
                          onChange={setManualSource}
                        />
                        <Typography.Text>手动选择温度来源</Typography.Text>
                      </Space>
                      {manualSource && (
                        <Select
                          aria-label="单组温度来源"
                          disabled={busy}
                          value={draft.Source}
                          onChange={(Source) => patch({ Source })}
                          options={[
                            { value: 'group/cpu', label: 'CPU 最高温度' },
                            { value: 'group/gpu', label: 'GPU 温度（优先核心）' },
                            { value: 'group/mix', label: 'CPU 与 GPU 的较高温度（两者均需可用）' },
                            ...snapshot.Snapshot.Sensors.filter(
                              (s) => s.Kind === 'Temperature',
                            ).map((s) => ({ value: s.Id, label: `${s.Device} · ${s.Name}` })),
                          ]}
                        />
                      )}
                      <fieldset className="curve-fieldset" disabled={busy}>
                        <CurveEditor
                          points={draft.Points}
                          minimum={draft.Minimum}
                          onChange={(Points) => {
                            if (!busy) patch({ Points });
                          }}
                        />
                      </fieldset>
                    </>
                  )}
                  <Form layout="vertical" disabled={busy}>
                    <Form.Item label="最低输出" htmlFor={`${fieldId}-minimum`}>
                      <InputNumber
                        id={`${fieldId}-minimum`}
                        aria-label="单组最低输出"
                        value={draft.Minimum}
                        min={20}
                        max={100}
                        precision={0}
                        suffix="%"
                        onChange={(Minimum) => {
                          if (Minimum !== null) patch({ Minimum });
                        }}
                      />
                      <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                        请使用已确认风扇能稳定运转的最低值。百分比不能直接换算成
                        RPM，实际转速以读数为准。
                      </Typography.Paragraph>
                    </Form.Item>
                    {draft.Mode === 2 && (
                      <Flex gap={20} wrap>
                        <Form.Item label="升温平滑">
                          <InputNumber
                            aria-label="单组升温平滑"
                            min={0}
                            max={30}
                            suffix="秒"
                            value={draft.RiseSeconds ?? 0}
                            onChange={(RiseSeconds) => patch({ RiseSeconds })}
                          />
                        </Form.Item>
                        <Form.Item label="降温平滑">
                          <InputNumber
                            aria-label="单组降温平滑"
                            min={0}
                            max={120}
                            suffix="秒"
                            value={draft.FallSeconds ?? 0}
                            onChange={(FallSeconds) => patch({ FallSeconds })}
                          />
                        </Form.Item>
                      </Flex>
                    )}
                    <Form.Item label="转速传感器" htmlFor={`${fieldId}-rpm`}>
                      <Select
                        id={`${fieldId}-rpm`}
                        aria-label="单组转速传感器"
                        value={draft.RpmId ?? ''}
                        onChange={(RpmId) => patch({ RpmId })}
                        options={[
                          { value: '', label: '不显示转速' },
                          ...snapshot.Snapshot.Sensors.filter((s) => s.Kind === 'Fan').map((s) => ({
                            value: s.Id,
                            label: `${s.Device} · ${s.Name}`,
                          })),
                        ]}
                      />
                    </Form.Item>
                  </Form>
                  <Typography.Text type="secondary">
                    通道标识：
                    <Typography.Text code copyable>
                      {channel.Id}
                    </Typography.Text>
                  </Typography.Text>
                </Flex>
              ),
            },
          ]}
        />
        {error && <Alert type="error" showIcon title={error} />}
      </Flex>
    </Drawer>
  );
}
