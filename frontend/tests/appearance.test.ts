import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHostEvent } from '../src/features/fans/api/protocol.ts';
import { isThemePreference, resolveTheme } from '../src/platform/appearance.ts';
import { createChoicePreference } from '../src/platform/preferences.ts';
import { createWindowControls, type WebViewPort } from '../src/platform/webview.ts';

test('new installations follow the system while saved light and dark choices survive upgrades', () => {
  const saved = new Map<string, string>();
  const preference = createChoicePreference(
    () => ({
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        saved.set(key, value);
      },
    }),
    'cinna-fancon-theme',
    isThemePreference,
    'system',
  );
  assert.equal(resolveTheme(preference.read().value, true), 'dark');
  assert.equal(resolveTheme(preference.read().value, false), 'light');
  saved.set('cinna-fancon-theme', 'dark');
  assert.equal(resolveTheme(preference.read().value, false), 'dark');
  saved.set('cinna-fancon-theme', 'light');
  assert.equal(resolveTheme(preference.read().value, true), 'light');
  preference.write('system');
  assert.equal(preference.read().value, 'system');
});

test('window preferences use the host boundary and state subscriptions reject unrelated messages', () => {
  const messages: unknown[] = [];
  const listeners = new Set<(event: { data: unknown }) => void>();
  const port: WebViewPort = {
    postMessage: (message) => {
      messages.push(message);
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };
  const controls = createWindowControls(port);
  const states: boolean[] = [];
  const unsubscribe = controls.subscribeWindowState((value) => {
    states.push(value);
  });
  for (const data of [
    null,
    {},
    { Type: 'snapshot', Message: 'maximized' },
    { Type: 'window-state', Message: 'invalid' },
    { Type: 'window-state', Message: 'maximized' },
    { Type: 'window-state', Message: 'normal' },
  ]) {
    for (const listener of listeners) listener({ data });
  }
  assert.deepEqual(states, [true, false]);
  assert.equal(parseHostEvent({ Type: 'window-state', Message: 'maximized' }), undefined);
  assert.equal(parseHostEvent({ Type: 'window-state', Message: 'normal' }), undefined);
  assert.throws(() => parseHostEvent({ Type: 'window-state', Message: 'broken' }));
  unsubscribe();
  assert.equal(listeners.size, 0);
  controls.setTheme('dark');
  controls.setCloseBehavior('exit');
  controls.act('minimize');
  assert.deepEqual(messages, [
    { Type: 'command', Action: 'theme', Message: 'dark', Mode: 'dark' },
    { Type: 'command', Action: 'closeBehavior', Message: 'exit' },
    { Type: 'command', Id: '', Action: 'minimize' },
  ]);
  const preview = createWindowControls(undefined);
  assert.equal(preview.desktop, false);
  assert.doesNotThrow(() => {
    preview.setTheme('light');
    preview.setCloseBehavior('tray');
  });
});
