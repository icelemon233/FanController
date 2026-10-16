import type { WebViewPort } from '../../../platform/webview.ts';
import type { FanGateway } from './gateway.ts';
import { createNativeGateway } from './nativeGateway.ts';

export function createGatewayFactory(
  port: WebViewPort | undefined,
  allowBrowserDemo: boolean,
): () => Promise<FanGateway> {
  return async () => {
    if (port) return createNativeGateway(port);
    if (
      allowBrowserDemo &&
      (typeof __FANCON_BROWSER_DEMO__ === 'undefined' || __FANCON_BROWSER_DEMO__)
    ) {
      const { createDemoGateway } = await import('./demoGateway.ts');
      return createDemoGateway();
    }
    throw new Error('未检测到 Windows 原生桥接。请从 cinna-fanCon 桌面应用打开此界面。');
  };
}
