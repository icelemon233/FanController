import { Button, Select, Typography } from 'antd';
import { ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import version from '../../../version.json';
import type { CloseBehavior, ThemePreference } from '../platform/appearance.ts';
import type { WindowControls } from './runtime.ts';

function ThemeSymbol({ preference }: { preference: ThemePreference }) {
  const Icon = preference === 'system' ? Monitor : preference === 'light' ? Sun : Moon;
  return <Icon aria-hidden="true" />;
}

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
          <label id="theme-label" htmlFor="app-theme">
            主题
          </label>
          <Select<ThemePreference>
            id="app-theme"
            data-testid="theme-select"
            aria-labelledby="theme-label"
            value={themePreference}
            onChange={onTheme}
            prefix={<ThemeSymbol preference={themePreference} />}
            suffixIcon={<ChevronDown aria-hidden="true" />}
            optionRender={({ data }) => (
              <span className="theme-option" data-testid={`theme-${data.value}`}>
                <ThemeSymbol
                  preference={
                    data.value === 'light' || data.value === 'dark' ? data.value : 'system'
                  }
                />
                {data.label}
              </span>
            )}
            options={[
              { value: 'system', label: '跟随系统' },
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
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
            <label id="close-label" htmlFor="app-close-behavior">
              关闭窗口时
            </label>
            <Select<CloseBehavior>
              id="app-close-behavior"
              data-testid="close-select"
              aria-labelledby="close-label"
              value={closeBehavior}
              onChange={onCloseBehavior}
              suffixIcon={<ChevronDown aria-hidden="true" />}
              options={[
                { value: 'tray', label: '进入托盘' },
                { value: 'exit', label: '退出应用' },
              ]}
            />
            <Typography.Paragraph type="secondary">
              最小化保留在任务栏。退出前会恢复已接管风扇的原设置。
            </Typography.Paragraph>
          </div>
          <div className="setting-row">
            <Typography.Text className="setting-label">退出应用</Typography.Text>
            <Button danger disabled={busy} onClick={() => windows.act('exit')}>
              恢复原设置并退出
            </Button>
            <Typography.Paragraph type="secondary">
              恢复失败时应用会保持运行，可检查提示后重试。
            </Typography.Paragraph>
          </div>
        </section>
      )}
      <section className="settings-section" aria-labelledby="about-heading">
        <Typography.Title id="about-heading" level={4}>
          关于
        </Typography.Title>
        <div className="about-details">
          <div>
            <Typography.Text>FanController</Typography.Text>
            <Typography.Paragraph type="secondary">
              {version.version} 预览版 · 开发者 Cinna
            </Typography.Paragraph>
          </div>
          <Button onClick={onHelp}>使用帮助</Button>
        </div>
      </section>
    </div>
  );
}
