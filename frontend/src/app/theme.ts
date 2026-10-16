import { type ThemeConfig, theme } from 'antd';
import type { ThemeMode } from './runtime.ts';

const navigation = {
  ground: '#0a0d14',
  ink: '#e9edf3',
  muted: '#a6afbf',
  accent: '#5a9bfc',
  selected: '#1e304c',
  selectedInk: '#d9e7ff',
  hover: '#151d2a',
};
const fontFamily = '"Segoe UI", "Microsoft YaHei UI", sans-serif';

export function createAppTheme(mode: ThemeMode) {
  const dark = mode === 'dark';
  const palette = dark
    ? {
        accent: '#5a9bfc',
        ground: '#0a0d14',
        surface: '#131824',
        elevated: '#1b2230',
        ink: '#e9edf3',
        muted: '#a6afbf',
        border: '#293345',
      }
    : {
        accent: '#246bd1',
        ground: '#edf0f5',
        surface: '#ffffff',
        elevated: '#ffffff',
        ink: '#1b2533',
        muted: '#586577',
        border: '#dce2eb',
      };
  const config: ThemeConfig = {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    cssVar: { key: 'cinna-fancon' },
    token: {
      colorPrimary: palette.accent,
      colorInfo: palette.accent,
      colorBgLayout: palette.ground,
      colorBgContainer: palette.surface,
      colorBgElevated: palette.elevated,
      colorText: palette.ink,
      colorTextSecondary: palette.muted,
      colorTextTertiary: palette.muted,
      colorTextDescription: palette.muted,
      colorBorderSecondary: palette.border,
      borderRadius: 8,
      borderRadiusLG: 8,
      fontFamily,
      fontSize: 14,
      boxShadow: 'none',
      boxShadowSecondary: dark ? '0 16px 48px rgba(0,0,0,.4)' : '0 16px 48px rgba(27,37,51,.12)',
    },
    components: {
      Card: { paddingLG: 22, headerFontSize: 18 },
      Button: {
        controlHeight: 38,
        primaryColor: dark ? navigation.ground : '#ffffff',
        primaryShadow: 'none',
        defaultShadow: 'none',
      },
      Menu: {
        itemHeight: 46,
        itemMarginBlock: 8,
        itemBorderRadius: 8,
        darkItemBg: 'transparent',
        darkItemColor: navigation.muted,
        darkItemSelectedBg: navigation.selected,
        darkItemSelectedColor: navigation.selectedInk,
        darkItemHoverBg: navigation.hover,
      },
      Statistic: { contentFontSize: 52 },
      Table: { cellPaddingBlock: 18 },
    },
  };
  const token = theme.getDesignToken(config);
  return {
    config,
    variables: {
      '--fd-ink': token.colorText,
      '--fd-muted': token.colorTextSecondary,
      '--fd-border': token.colorBorderSecondary,
      '--fd-primary': token.colorPrimary,
      '--fd-primary-bg': token.colorPrimaryBg,
      '--fd-fill': token.colorFillQuaternary,
      '--fd-container': token.colorBgContainer,
      '--fd-layout': token.colorBgLayout,
      '--fd-nav-bg': navigation.ground,
      '--fd-nav-ink': navigation.ink,
      '--fd-nav-muted': navigation.muted,
      '--fd-nav-accent': navigation.accent,
      '--fd-font-family': fontFamily,
      '--fd-selection': '#b4d2ff',
      '--fd-selection-ink': '#12223a',
      '--fd-window-close': '#bc3545',
      '--fd-on-close': '#ffffff',
    },
  };
}
