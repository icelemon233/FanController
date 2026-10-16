import { createGatewayFactory } from '../features/fans/api/createGateway.ts';
import { createFanController } from '../features/fans/controller.ts';
import { isCoolingMode } from '../features/fans/model.ts';
import { createChoicePreference } from '../platform/preferences.ts';
import { createWindowControls, getWebViewPort } from '../platform/webview.ts';

export type ThemeMode = 'dark' | 'light';
const isThemeMode = (value: unknown): value is ThemeMode => value === 'dark' || value === 'light';

export function createAppRuntime() {
  const port = getWebViewPort();
  const storage = () => window.localStorage;
  return {
    fans: createFanController(
      createGatewayFactory(port, import.meta.env.DEV || import.meta.env.MODE === 'demo'),
      createChoicePreference(storage, 'cinna-fancon-mode', isCoolingMode, '均衡'),
    ),
    theme: createChoicePreference(storage, 'cinna-fancon-theme', isThemeMode, 'dark'),
    windows: { ...createWindowControls(port), reload: () => window.location.reload() },
  };
}
export type WindowControls = ReturnType<typeof createAppRuntime>['windows'];
