import { useEffect, useState } from 'react';
import { FanControlProvider } from '../features/fans/FanControlProvider.tsx';
import { AppBoundary } from './AppBoundary.tsx';
import AppShell from './AppShell.tsx';
import { AppTheme } from './AppTheme.tsx';
import { createAppRuntime } from './runtime.ts';
import '../styles/app.css';

export default function App() {
  const [runtime] = useState(createAppRuntime);
  useEffect(() => {
    const exit = () => runtime.windows.act('exit');
    window.addEventListener('fancontroller-exit-approved', exit);
    return () => window.removeEventListener('fancontroller-exit-approved', exit);
  }, [runtime]);
  return (
    <AppTheme preference={runtime.theme} onResolvedTheme={runtime.windows.setTheme}>
      {(mode, preference, choose) => (
        <AppBoundary windows={runtime.windows}>
          <FanControlProvider controller={runtime.fans}>
            <AppShell
              mode={mode}
              themePreference={preference}
              onTheme={choose}
              windows={runtime.windows}
              closePreference={runtime.closeBehavior}
              navigationPreference={runtime.navigation}
            />
          </FanControlProvider>
        </AppBoundary>
      )}
    </AppTheme>
  );
}
