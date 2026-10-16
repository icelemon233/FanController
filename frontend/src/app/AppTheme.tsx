import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ChoicePreference } from '../platform/preferences.ts';
import type { ThemeMode } from './runtime.ts';
import { createAppTheme } from './theme.ts';

function ThemeWarning({ issue }: { issue?: string }) {
  const { message } = App.useApp();
  useEffect(() => {
    if (issue) void message.warning(issue);
  }, [issue, message]);
  return null;
}

export function AppTheme({
  preference,
  children,
}: {
  preference: ChoicePreference<ThemeMode>;
  children: (theme: ThemeMode, toggle: () => void) => ReactNode;
}) {
  const [initial] = useState(() => preference.read());
  const [mode, setMode] = useState(initial.value);
  const [issue, setIssue] = useState(initial.issue);
  const selected = useMemo(() => createAppTheme(mode), [mode]);
  const variables = selected.variables;
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    const previous = Object.keys(variables).map(
      (key) => [key, root.getPropertyValue(key)] as const,
    );
    for (const [key, value] of Object.entries(variables)) root.setProperty(key, value);
    return () => {
      for (const [key, value] of previous)
        value ? root.setProperty(key, value) : root.removeProperty(key);
    };
  }, [variables]);
  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    setIssue(preference.write(next));
  };
  return (
    <ConfigProvider locale={zhCN} theme={selected.config}>
      <App>
        <ThemeWarning issue={issue} />
        {children(mode, toggle)}
      </App>
    </ConfigProvider>
  );
}
