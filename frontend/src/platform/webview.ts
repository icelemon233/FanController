export interface WebViewPort {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export type WindowAction = 'minimize' | 'maximize' | 'close' | 'drag';

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
  };
}
