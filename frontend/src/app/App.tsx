import { useState } from 'react';
import { FanControlProvider } from '../features/fans/FanControlProvider.tsx';
import { AppBoundary } from './AppBoundary.tsx';
import AppShell from './AppShell.tsx';
import { AppTheme } from './AppTheme.tsx';
import { createAppRuntime } from './runtime.ts';
import '../styles/app.css';

export default function App() {
  const [runtime] = useState(createAppRuntime);
  return (
    <AppTheme preference={runtime.theme}>
      {(mode, toggle) => (
        <AppBoundary windows={runtime.windows}>
          <FanControlProvider controller={runtime.fans}>
            <AppShell mode={mode} onTheme={toggle} windows={runtime.windows} />
          </FanControlProvider>
        </AppBoundary>
      )}
    </AppTheme>
  );
}
