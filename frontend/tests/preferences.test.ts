import assert from 'node:assert/strict';
import test from 'node:test';
import { createChoicePreference } from '../src/platform/preferences.ts';

const valid = (value: unknown): value is 'dark' | 'light' => value === 'dark' || value === 'light';
test('existing preference keys remain readable and invalid values are not overwritten on read', () => {
  const saved = new Map([
    ['cinna-fancon-theme', 'light'],
    ['unrelated', 'keep'],
  ]);
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
  };
  const preference = createChoicePreference(() => storage, 'cinna-fancon-theme', valid, 'dark');
  assert.equal(preference.read().value, 'light');
  saved.set('cinna-fancon-theme', 'future-format');
  assert.equal(preference.read().value, 'dark');
  assert.ok(preference.read().issue);
  assert.equal(saved.get('cinna-fancon-theme'), 'future-format');
  preference.write('light');
  assert.equal(saved.get('unrelated'), 'keep');
});

test('unavailable storage and quota failures are explicit and do not break the UI', () => {
  const preference = createChoicePreference(
    () => {
      throw new Error('denied');
    },
    'theme',
    valid,
    'dark',
  );
  assert.equal(preference.read().value, 'dark');
  assert.ok(preference.read().issue);
  assert.match(preference.write('light') ?? '', /未能保存/);
});
