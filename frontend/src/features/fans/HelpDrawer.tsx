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
              title: '确认风扇用途',
              content:
                '在概览打开“配置与预览”，按实际接线确认 CPU、机箱风扇和水泵。未确认的通道暂不调节。',
            },
            {
              title: '核对后应用',
              content:
                '逐组查看温度来源、最低输出、平滑时间和曲线。默认以日常安静为起点，显卡保留原设置；预览后点击“应用方案”才会生效。',
            },
            {
              title: '调整单组风扇',
              content:
                '在“风扇设置”中可以单独调节。输出百分比不代表 RPM，请以实际转速和温度检查效果。恢复原设置会停止接管。',
            },
          ]}
        />
        <Alert
          type="info"
          showIcon
          title="同一组可能包含多个风扇"
          description="分组取决于硬件提供的接口。接在同一接口上的风扇无法分别调节。"
        />
        <Paragraph>
          最小化后窗口保留在任务栏，风扇继续调节。关闭窗口默认进入托盘，可在“设置”中改为退出。双击托盘图标可打开窗口；右键选择“恢复原设置并退出”可结束运行。
        </Paragraph>
        <Paragraph type="secondary">
          读数停止时，点击“重新连接”检查风扇服务。需要重启时会先等旧服务退出，再等待新读数；已保存配置会保留，连接后请核对风扇状态再应用。
        </Paragraph>
        <Paragraph type="secondary">
          退出时会尝试恢复已接管风扇的原设置，恢复失败时应用会保持运行。与应用断开连接后，风扇服务也会尝试恢复；强制结束服务、驱动故障或断电可能导致无法恢复。
        </Paragraph>
      </Flex>
    </Drawer>
  );
}
