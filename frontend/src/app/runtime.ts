import { createGatewayFactory } from '../features/fans/api/createGateway.ts';
import { createFanController } from '../features/fans/controller.ts';
import { isCoolingMode } from '../features/fans/model.ts';
import {
  isCloseBehavior,
  isNavigationPreference,
  isThemePreference,
} from '../platform/appearance.ts';
import { createChoicePreference } from '../platform/preferences.ts';
import { createWindowControls, getWebViewPort } from '../platform/webview.ts';

export type { ThemeMode } from '../platform/appearance.ts';

export function createAppRuntime() {
  const port = getWebViewPort();
  const storage = () => window.localStorage;
  return {
    fans: createFanController(
      createGatewayFactory(port, import.meta.env.DEV || import.meta.env.MODE === 'demo'),
      createChoicePreference(storage, 'cinna-fancon-mode', isCoolingMode, '均衡'),
    ),
    theme: createChoicePreference(storage, 'cinna-fancon-theme', isThemePreference, 'system'),
    closeBehavior: createChoicePreference(storage, 'cinna-fancon-close', isCloseBehavior, 'tray'),
    navigation: createChoicePreference(
      storage,
      'cinna-fancon-navigation',
      isNavigationPreference,
      'expanded',
    ),
    windows: { ...createWindowControls(port), reload: () => window.location.reload() },
  };
}
export type WindowControls = ReturnType<typeof createAppRuntime>['windows'];
