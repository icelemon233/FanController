import { Alert, Button, Flex } from 'antd';
import { Component, type ReactNode } from 'react';
import type { WindowControls } from './runtime.ts';

export class AppBoundary extends Component<
  { children: ReactNode; windows: WindowControls },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Flex vertical gap={20} style={{ padding: 32 }}>
        <Alert
          type="error"
          showIcon
          title="界面加载失败"
          description="可以重新加载界面。风扇的恢复与退出由原生应用处理。"
        />
        <Flex gap={12}>
          <Button type="primary" onClick={this.props.windows.reload}>
            重新加载界面
          </Button>
          {this.props.windows.desktop && (
            <Button onClick={() => this.props.windows.act('close')}>恢复原设置并退出</Button>
          )}
        </Flex>
      </Flex>
    );
  }
}
