import assert from 'node:assert/strict';
import test from 'node:test';
import { isKeyboardNavigation } from '../src/platform/inputModality.ts';

test('navigation and activation keys restore keyboard hints while modifiers and shortcuts preserve the prior mode', () => {
  const input = (key: string, extra = {}) => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...extra,
  });
  for (const key of ['Tab', 'ArrowDown', 'Home', 'PageDown', 'Enter', ' ', 'Escape'])
    assert.equal(isKeyboardNavigation(input(key)), true);
  for (const key of ['Control', 'Alt', 'Shift', 'Meta', 'a'])
    assert.equal(isKeyboardNavigation(input(key)), false);
  for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }])
    assert.equal(isKeyboardNavigation(input('ArrowDown', extra)), false);
});
