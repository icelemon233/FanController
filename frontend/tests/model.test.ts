import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoSnapshot } from '../src/features/fans/api/demoData.ts';
import {
  preset,
  profileFor,
  readTemperature,
  rpmFor,
  validateProfile,
} from '../src/features/fans/model.ts';

test('temperature selection matches CPU maximum, GPU core priority and fallback', () => {
  const frame = createDemoSnapshot().Snapshot;
  assert.equal(readTemperature(frame, 'GPU'), 54);
  frame.Sensors = frame.Sensors.filter((sensor) => sensor.Id !== 'gpu');
  assert.equal(readTemperature(frame, 'GPU'), 65);
  frame.Sensors.push({
    Id: 'cpu2',
    Name: 'CPU Package',
    Device: 'Demo CPU',
    Group: 'CPU',
    Kind: 'Temperature',
    Value: 70,
    Time: frame.Time,
  });
  assert.equal(readTemperature(frame, 'CPU'), 70);
});

test('zero, stale and implausibly future temperatures are unavailable', () => {
  const frame = createDemoSnapshot('2026-10-17T00:00:00Z').Snapshot;
  const sensor = frame.Sensors.find((item) => item.Group === 'CPU');
  assert.ok(sensor);
  sensor.Value = 0;
  assert.equal(readTemperature(frame, 'CPU'), null);
  sensor.Value = 50;
  sensor.Time = '2026-10-16T23:59:56Z';
  assert.equal(readTemperature(frame, 'CPU'), null);
  sensor.Time = '2026-10-17T00:00:02Z';
  assert.equal(readTemperature(frame, 'CPU'), null);
});

test('profile drafts are detached and retain calibrated minimum, exclusion and RPM choices', () => {
  const snapshot = createDemoSnapshot();
  const channel = snapshot.Snapshot.Channels[0];
  assert.ok(channel);
  snapshot.Profiles.push({
    Id: channel.Id,
    Name: 'CPU',
    Mode: 0,
    Source: 'group/cpu',
    RpmId: '',
    Minimum: 65,
    Manual: 50,
    Points: preset('静音'),
    Excluded: true,
  });
  const draft = profileFor(channel, snapshot);
  draft.Name = '草稿';
  assert.equal(snapshot.Profiles[0]?.Name, 'CPU');
  assert.equal(draft.Minimum, 65);
  assert.equal(draft.Excluded, true);
  assert.equal(rpmFor(channel, snapshot), null);
});

test('form validation rejects unsafe ranges, descending curves and missing sources', () => {
  const snapshot = createDemoSnapshot(),
    channel = snapshot.Snapshot.Channels[0];
  assert.ok(channel);
  const draft = profileFor(channel, snapshot);
  assert.equal(validateProfile(draft), null);
  assert.match(validateProfile({ ...draft, Manual: Number.NaN }) ?? '', /固定输出/);
  assert.match(validateProfile({ ...draft, Minimum: 10 }) ?? '', /最低输出/);
  assert.match(validateProfile({ ...draft, Source: '' }) ?? '', /温度来源/);
  assert.match(
    validateProfile({
      ...draft,
      Points: [
        { Temperature: 40, Duty: 80 },
        { Temperature: 60, Duty: 40 },
      ],
    }) ?? '',
    /不能低于/,
  );
});
