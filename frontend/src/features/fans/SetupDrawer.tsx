import { Alert, Button, Drawer, Flex, Steps, Typography } from 'antd';
import { useFanControl } from './FanControlProvider.tsx';

const { Paragraph } = Typography;
export default function SetupDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, controller } = useFanControl();
  const frame = state.snapshot?.Snapshot,
    busy = state.busy;
  return (
    <Drawer
      title="启用主板访问"
      open={open}
      onClose={() => onClose()}
      size={480}
      footer={
        <Button
          type="primary"
          block
          size="large"
          loading={busy === 'enableMotherboard'}
          onClick={async () => {
            if (await controller.enableMotherboard()) onClose();
          }}
        >
          开始设置
        </Button>
      }
    >
      <Flex vertical gap={24}>
        <Paragraph>
          读取 CPU
          温度和控制主板风扇可能需要硬件组件及管理员权限。设置完成后，应用会重新检测受支持的 CPU
          和机箱风扇。
        </Paragraph>
        <Steps
          current={frame?.PawnIoInstalled ? 1 : 0}
          orientation="vertical"
          items={[
            {
              title: '安装硬件组件',
              content: '未安装 PawnIO 时，应用会下载官方安装器。请按安装器提示完成安装。',
            },
            { title: '授权主板访问', content: '确认 Windows 授权提示，允许风扇服务访问主板。' },
            {
              title: '配置调节方案',
              content: '检测完成后回到概览，确认风扇用途并预览参数，再点击“应用方案”。',
            },
          ]}
        />
        <Alert
          type="info"
          showIcon
          title="设置期间保持应用打开"
          description="安装和授权完成后，界面会自动连接风扇服务。已检测到的显卡风扇可直接使用。"
        />
      </Flex>
    </Drawer>
  );
}
