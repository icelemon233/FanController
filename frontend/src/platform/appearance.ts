export type ThemeMode = 'dark' | 'light';
export type ThemePreference = ThemeMode | 'system';
export type CloseBehavior = 'tray' | 'exit';
export type NavigationPreference = 'expanded' | 'collapsed';

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'dark' || value === 'light' || value === 'system';
export const isCloseBehavior = (value: unknown): value is CloseBehavior =>
  value === 'tray' || value === 'exit';
export const isNavigationPreference = (value: unknown): value is NavigationPreference =>
  value === 'expanded' || value === 'collapsed';
export const resolveTheme = (preference: ThemePreference, systemDark: boolean): ThemeMode =>
  preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
