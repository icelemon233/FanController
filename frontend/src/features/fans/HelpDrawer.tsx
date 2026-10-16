import { Alert, Drawer, Flex, Steps, Typography } from 'antd';

const { Paragraph } = Typography;
export default function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer title="使用帮助" open={open} onClose={() => onClose()} size={480}>
      <Flex vertical gap={24}>
        <Steps
          orientation="vertical"
          items={[
            {
              title: '选择风扇模式',
              content: '轻负载可选静音，日常使用可选均衡，持续高负载可选强冷。',
            },
            {
              title: '开启自动调节',
              content:
                'CPU 风扇使用 CPU 温度，显卡风扇优先使用 GPU 核心温度；机箱风扇在两者可用时取较高值，否则使用 CPU 温度。',
            },
            {
              title: '调整单组风扇',
              content:
                '在“风扇设置”中修改曲线或固定输出。关闭“跟随主页模式”并应用，可让该组恢复原设置。',
            },
          ]}
        />
        <Alert
          type="info"
          showIcon
          title="同一组可能包含多个风扇"
          description="分组取决于硬件提供的接口。接在同一接口上的风扇无法分别调节。"
        />
        <Paragraph type="secondary">
          退出时会尝试恢复已接管风扇的原设置，恢复失败时应用会保持运行。与应用断开连接后，风扇服务也会尝试恢复；强制结束服务、驱动故障或断电可能导致无法恢复。
        </Paragraph>
      </Flex>
    </Drawer>
  );
}
