import {
  Alert,
  Button,
  Card,
  Collapse,
  Flex,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Typography,
} from 'antd';
import CurveEditor from './CurveEditor.tsx';
import type { PlanEntry } from './coolingPlan.ts';
import type { FanProfile, Snapshot } from './model.ts';

export default function PlanFanEditor({
  entry,
  snapshot,
  busy,
  onPatch,
  onUseQuiet,
}: {
  entry: PlanEntry;
  snapshot: Snapshot;
  busy: boolean;
  onPatch: (patch: Partial<FanProfile>) => void;
  onUseQuiet: () => void;
}) {
  const { profile, included } = entry;
  const editable = !busy && included;
  const known = profile.Role !== 'Unknown' && profile.Role !== 'Pump';
  return (
    <Card
      size="small"
      title={profile.Name}
      extra={
        <Button size="small" disabled={!editable} onClick={onUseQuiet}>
          使用安静起点
        </Button>
      }
    >
      <Flex vertical gap={16}>
        {!included && (
          <Alert
            type="info"
            showIcon
            title={
              profile.Role === 'Unknown'
                ? '先在左侧确认风扇用途'
                : profile.Role === 'Pump'
                  ? '水泵保留原设置'
                  : '勾选这组风扇后可编辑参数'
            }
          />
        )}
        {included && profile.Role === 'GPU' && (
          <Alert
            type="warning"
            showIcon
            title="接管显卡后将持续保持最低输出"
            description="需要保留低负载停转时，请取消勾选，让显卡驱动调节。"
          />
        )}
        {known && (
          <Form layout="vertical" requiredMark={false} disabled={!editable}>
            <Form.Item>
              <Radio.Group
                aria-label="方案控制方式"
                value={profile.Mode}
                onChange={(event) => onPatch({ Mode: event.target.value })}
                optionType="button"
                options={[
                  { value: 2, label: '温度曲线' },
                  { value: 1, label: '固定输出' },
                ]}
              />
            </Form.Item>
            {profile.Mode === 2 && (
              <Form.Item label="温度来源">
                <Select
                  aria-label="方案温度来源"
                  value={profile.Source}
                  onChange={(Source) => onPatch({ Source })}
                  options={[
                    { value: 'group/cpu', label: 'CPU 最高温度' },
                    { value: 'group/mix', label: 'CPU / GPU 较高温度（两者都需可用）' },
                    { value: 'group/gpu', label: 'GPU 温度（优先核心）' },
                    ...snapshot.Snapshot.Sensors.filter(
                      (sensor) => sensor.Kind === 'Temperature',
                    ).map((sensor) => ({
                      value: sensor.Id,
                      label: `${sensor.Device} · ${sensor.Name}`,
                    })),
                  ]}
                />
              </Form.Item>
            )}
            <div className="plan-fields">
              <Form.Item label="最低输出">
                <InputNumber
                  aria-label="方案最低输出"
                  min={20}
                  max={100}
                  precision={0}
                  suffix="%"
                  value={profile.Minimum}
                  onChange={(Minimum) => {
                    if (Minimum !== null) onPatch({ Minimum });
                  }}
                />
              </Form.Item>
              {profile.Mode === 1 && (
                <Form.Item label="固定输出">
                  <InputNumber
                    aria-label="方案固定输出"
                    min={0}
                    max={100}
                    precision={0}
                    suffix="%"
                    value={profile.Manual}
                    onChange={(Manual) => {
                      if (Manual !== null) onPatch({ Manual });
                    }}
                  />
                </Form.Item>
              )}
              {profile.Mode === 2 && (
                <>
                  <Form.Item label="升温平滑">
                    <InputNumber
                      aria-label="方案升温平滑"
                      min={0}
                      max={30}
                      precision={0}
                      suffix="秒"
                      value={profile.RiseSeconds ?? 0}
                      onChange={(RiseSeconds) => onPatch({ RiseSeconds })}
                    />
                  </Form.Item>
                  <Form.Item label="降温平滑">
                    <InputNumber
                      aria-label="方案降温平滑"
                      min={0}
                      max={120}
                      precision={0}
                      suffix="秒"
                      value={profile.FallSeconds ?? 0}
                      onChange={(FallSeconds) => onPatch({ FallSeconds })}
                    />
                  </Form.Item>
                </>
              )}
            </div>
            <Typography.Paragraph type="secondary">
              最低输出需能让风扇稳定运转。平滑减少频繁变速，高温保护立即生效。
            </Typography.Paragraph>
            {profile.Mode === 2 && (
              <fieldset className="curve-fieldset" disabled={!editable}>
                <CurveEditor
                  points={profile.Points}
                  minimum={profile.Minimum}
                  onChange={(Points) => {
                    if (editable) onPatch({ Points });
                  }}
                />
              </fieldset>
            )}
            <Collapse
              style={{ marginTop: 20 }}
              items={[
                {
                  key: 'more',
                  label: '名称、转速读数和响应说明',
                  children: (
                    <>
                      <Form.Item label="显示名称">
                        <Input
                          aria-label="方案风扇名称"
                          value={profile.Name}
                          maxLength={60}
                          onChange={(event) => onPatch({ Name: event.target.value })}
                        />
                      </Form.Item>
                      <Form.Item label="转速读数">
                        <Select
                          aria-label="方案转速传感器"
                          value={profile.RpmId ?? ''}
                          onChange={(RpmId) => onPatch({ RpmId })}
                          options={[
                            { value: '', label: '不显示转速' },
                            ...snapshot.Snapshot.Sensors.filter(
                              (sensor) => sensor.Kind === 'Fan',
                            ).map((sensor) => ({
                              value: sensor.Id,
                              label: `${sensor.Device} · ${sensor.Name}`,
                            })),
                          ]}
                        />
                      </Form.Item>
                      <Typography.Paragraph type="secondary">
                        平滑值越大，越能减少短暂温度波动引起的变速；0
                        秒直接响应温度。输出下降每秒最多 3 个百分点。设置的是输出百分比，RPM
                        以实际读数为准。
                      </Typography.Paragraph>
                      <Typography.Text type="secondary">通道 {profile.Id}</Typography.Text>
                    </>
                  ),
                },
              ]}
            />
          </Form>
        )}
      </Flex>
    </Card>
  );
}
