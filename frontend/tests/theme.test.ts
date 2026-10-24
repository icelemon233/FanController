import assert from 'node:assert/strict';
import test from 'node:test';
import { theme } from 'antd';
import { createAppTheme } from '../src/app/theme.ts';

function luminance(color: string) {
  assert.match(color, /^#[0-9a-f]{6}$/i);
  const channels = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(color.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels.reduce(
    (sum, channel, index) => sum + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
    0,
  );
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

for (const mode of ['light', 'dark'] as const) {
  test(`${mode} theme keeps status text readable after Ant Design derives its tokens`, () => {
    const token = theme.getDesignToken(createAppTheme(mode).config);
    for (const status of ['Info', 'Success', 'Warning', 'Error'] as const) {
      const background = token[`color${status}Bg`];
      for (const foreground of [token[`color${status}`], token[`color${status}Text`]]) {
        assert.ok(contrast(foreground, background) >= 4.5, `${mode} ${status} text contrast`);
      }
    }
    assert.ok(contrast(token.colorText, token.colorBgLayout) >= 4.5);
    assert.ok(contrast(token.colorTextSecondary, token.colorBgLayout) >= 4.5);
    assert.ok(contrast(token.colorBorder, token.colorBgContainer) >= 3);
  });
}
