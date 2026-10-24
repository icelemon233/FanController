import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { resolveTheme, type ThemeMode, type ThemePreference } from '../platform/appearance.ts';
import type { ChoicePreference } from '../platform/preferences.ts';
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
  onResolvedTheme,
  children,
}: {
  preference: ChoicePreference<ThemePreference>;
  onResolvedTheme: (mode: ThemeMode, preference: ThemePreference) => void;
  children: (
    theme: ThemeMode,
    preference: ThemePreference,
    choose: (value: ThemePreference) => void,
  ) => ReactNode;
}) {
  const [initial] = useState(() => preference.read());
  const [choice, setChoice] = useState(initial.value);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const mode = resolveTheme(choice, systemDark);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [issue, setIssue] = useState(initial.issue);
  const selected = useMemo(() => createAppTheme(mode, reducedMotion), [mode, reducedMotion]);
  const variables = selected.variables;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => onResolvedTheme(mode, choice), [mode, choice, onResolvedTheme]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    const root = document.documentElement.style;
    const previous = Object.keys(variables).map(
      (key) => [key, root.getPropertyValue(key)] as const,
    );
    for (const [key, value] of Object.entries(variables)) root.setProperty(key, value);
    return () => {
      for (const [key, value] of previous)
        value ? root.setProperty(key, value) : root.removeProperty(key);
    };
  }, [mode, variables]);
  const choose = (next: ThemePreference) => {
    setChoice(next);
    setIssue(preference.write(next));
  };
  return (
    <ConfigProvider locale={zhCN} theme={selected.config}>
      <App>
        <ThemeWarning issue={issue} />
        {children(mode, choice, choose)}
      </App>
    </ConfigProvider>
  );
}
