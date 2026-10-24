import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Flex, Segmented, Select, Typography } from 'antd';
import version from '../../../version.json';
import type { CloseBehavior, ThemePreference } from '../platform/appearance.ts';
import type { WindowControls } from './runtime.ts';

export default function AppSettings({
  themePreference,
  onTheme,
  closeBehavior,
  onCloseBehavior,
  windows,
  busy,
  onHelp,
}: {
  themePreference: ThemePreference;
  onTheme: (value: ThemePreference) => void;
  closeBehavior: CloseBehavior;
  onCloseBehavior: (value: CloseBehavior) => void;
  windows: WindowControls;
  busy: boolean;
  onHelp: () => void;
}) {
  return (
    <div className="settings-page">
      <section className="settings-section" aria-labelledby="appearance-heading">
        <Typography.Title id="appearance-heading" level={4}>
          外观
        </Typography.Title>
        <div className="setting-row">
          <Typography.Text id="theme-label">主题</Typography.Text>
          <Segmented<ThemePreference>
            aria-labelledby="theme-label"
            value={themePreference}
            onChange={onTheme}
            options={[
              {
                value: 'light',
                icon: <SunOutlined aria-hidden="true" />,
                label: <span data-testid="theme-light">浅色</span>,
              },
              {
                value: 'dark',
                icon: <MoonOutlined aria-hidden="true" />,
                label: <span data-testid="theme-dark">深色</span>,
              },
              {
                value: 'system',
                icon: <DesktopOutlined aria-hidden="true" />,
                label: <span data-testid="theme-system">跟随系统</span>,
              },
            ]}
          />
        </div>
      </section>
      {windows.desktop && (
        <section className="settings-section" aria-labelledby="window-heading">
          <Typography.Title id="window-heading" level={4}>
            窗口与退出
          </Typography.Title>
          <div className="setting-row">
            <div>
              <Typography.Text id="close-label">关闭窗口时</Typography.Text>
              <Typography.Paragraph type="secondary">
                最小化保留在任务栏。退出前会恢复已接管风扇的原设置。
              </Typography.Paragraph>
            </div>
            <Select<CloseBehavior>
              aria-labelledby="close-label"
              value={closeBehavior}
              onChange={onCloseBehavior}
              options={[
                { value: 'tray', label: '进入托盘，继续调节' },
                { value: 'exit', label: '退出应用' },
              ]}
            />
          </div>
          <div className="setting-row">
            <div>
              <Typography.Text>退出应用</Typography.Text>
              <Typography.Paragraph type="secondary">
                恢复失败时应用会保持运行，可检查提示后重试。
              </Typography.Paragraph>
            </div>
            <Button danger disabled={busy} onClick={() => windows.act('exit')}>
              恢复原设置并退出
            </Button>
          </div>
        </section>
      )}
      <section className="settings-section" aria-labelledby="about-heading">
        <Typography.Title id="about-heading" level={4}>
          关于
        </Typography.Title>
        <Flex justify="space-between" align="center" wrap gap={16}>
          <div>
            <Typography.Text strong>FanController</Typography.Text>
            <Typography.Paragraph type="secondary">
              {version.version} 预览版 · 开发者 Cinna
            </Typography.Paragraph>
          </div>
          <Button onClick={onHelp}>使用帮助</Button>
        </Flex>
      </section>
    </div>
  );
}
