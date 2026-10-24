import type { CloseBehavior, ThemeMode, ThemePreference } from './appearance.ts';

export interface WebViewPort {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export type WindowAction = 'minimize' | 'maximize' | 'close' | 'exit' | 'drag';

export function getWebViewPort(): WebViewPort | undefined {
  const chrome: unknown = Reflect.get(window, 'chrome');
  if (!chrome || typeof chrome !== 'object') return undefined;
  const port: unknown = Reflect.get(chrome, 'webview');
  if (!port || typeof port !== 'object') return undefined;
  if (
    typeof Reflect.get(port, 'postMessage') !== 'function' ||
    typeof Reflect.get(port, 'addEventListener') !== 'function' ||
    typeof Reflect.get(port, 'removeEventListener') !== 'function'
  )
    return undefined;
  return port as WebViewPort;
}

export function createWindowControls(port: WebViewPort | undefined) {
  return {
    desktop: Boolean(port),
    act(action: WindowAction) {
      port?.postMessage({ Type: 'command', Id: '', Action: action });
    },
    setTheme(mode: ThemeMode, preference: ThemePreference = mode) {
      port?.postMessage({ Type: 'command', Action: 'theme', Message: mode, Mode: preference });
    },
    setCloseBehavior(behavior: CloseBehavior) {
      port?.postMessage({ Type: 'command', Action: 'closeBehavior', Message: behavior });
    },
    subscribeWindowState(listener: (maximized: boolean) => void) {
      const receive = ({ data }: { data: unknown }) => {
        if (!data || typeof data !== 'object') return;
        if (Reflect.get(data, 'Type') !== 'window-state') return;
        const value: unknown = Reflect.get(data, 'Message');
        if (value === 'maximized' || value === 'normal') listener(value === 'maximized');
      };
      port?.addEventListener('message', receive);
      return () => port?.removeEventListener('message', receive);
    },
  };
}
