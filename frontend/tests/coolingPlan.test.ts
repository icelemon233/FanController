import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoSnapshot } from '../src/features/fans/api/demoData.ts';
import {
  createPlanDraft,
  curveLabel,
  planError,
  planProfiles,
  quietProfile,
} from '../src/features/fans/coolingPlan.ts';
import { profileFor, readSourceTemperature, validateProfile } from '../src/features/fans/model.ts';

test('quiet-first draft separates CPU/case curves and leaves GPU automatic without changing telemetry', () => {
  const snapshot = createDemoSnapshot();
  const original = structuredClone(snapshot);
  const entries = createPlanDraft(snapshot);
  assert.deepEqual(
    entries.map((entry) => entry.included),
    [true, true, true, false],
  );
  assert.deepEqual(
    entries.map((entry) => entry.profile.Source),
    ['group/cpu', 'group/mix', 'group/mix', 'group/gpu'],
  );
  assert.equal(entries[0]?.profile.RiseSeconds, 3);
  assert.equal(entries[1]?.profile.FallSeconds, 30);
  assert.notDeepEqual(entries[0]?.profile.Points, entries[1]?.profile.Points);
  assert.equal(planProfiles(entries)[3]?.Mode, 0);
  assert.deepEqual(snapshot, original);
});

test('unknown ports and pumps require explicit identification; detected pumps cannot be relabelled into a plan', () => {
  const snapshot = createDemoSnapshot();
  const unknown = snapshot.Snapshot.Channels[1],
    pump = snapshot.Snapshot.Channels[2];
  const unknownRecommendation = snapshot.Recommendations[1],
    pumpRecommendation = snapshot.Recommendations[2];
  assert.ok(unknown && pump && unknownRecommendation && pumpRecommendation);
  unknown.Name = 'Fan #1';
  unknownRecommendation.Role = 'Unknown';
  pump.Name = 'AIO Pump';
  pumpRecommendation.Role = 'Pump';
  const entries = createPlanDraft(snapshot);
  assert.equal(entries[1]?.included, false);
  assert.equal(entries[2]?.included, false);
  const entry = entries[1];
  assert.ok(entry);
  entry.included = true;
  assert.match(planError(entries, snapshot) ?? '', /用途/);
  entry.profile.Role = 'Case';
  assert.equal(planError(entries, snapshot), null);
  const pumpEntry = entries[2];
  assert.ok(pumpEntry);
  pumpEntry.included = true;
  pumpEntry.profile.Role = 'Case';
  assert.match(planError(entries, snapshot) ?? '', /水泵/);
});

test('saved curves, stable minima, names, manual control and exclusions are retained', () => {
  const snapshot = createDemoSnapshot(),
    channel = snapshot.Snapshot.Channels[0];
  assert.ok(channel);
  const profile = {
    ...quietProfile(channel, snapshot),
    Minimum: 62,
    Name: '散热器',
    Mode: 1 as const,
    Manual: 68,
    Excluded: true,
  };
  snapshot.Profiles = [profile];
  const entries = createPlanDraft(snapshot),
    draft = entries[0];
  assert.ok(draft);
  assert.equal(draft.included, false);
  assert.equal(draft.profile.Minimum, 62);
  assert.equal(draft.profile.Mode, 1);
  draft.included = true;
  const submitted = planProfiles(entries);
  draft.profile.Manual = 80;
  assert.equal(submitted[0]?.Manual, 68);
  assert.equal(profile.Manual, 68);
  assert.equal(curveLabel(submitted[0] ?? profile), '固定输出 68%');
});

test('active profiles take precedence over saved records when persistence fails', () => {
  const snapshot = createDemoSnapshot(),
    channel = snapshot.Snapshot.Channels[0];
  assert.ok(channel);
  const old = quietProfile(channel, snapshot);
  snapshot.Profiles = [old];
  channel.Owned = true;
  channel.Mode = 1;
  channel.ActiveProfile = { ...old, Mode: 1, Manual: 73, Name: '正在使用的设置', Minimum: 42 };
  const draft = createPlanDraft(snapshot)[0];
  assert.ok(draft);
  assert.equal(draft.profile.Manual, 73);
  assert.equal(profileFor(channel, snapshot).Name, '正在使用的设置');
  assert.equal(snapshot.Profiles[0]?.Manual, old.Manual);
});

test('unselected owned fans are explicitly restored, never silently left controlled', () => {
  const snapshot = createDemoSnapshot(),
    channel = snapshot.Snapshot.Channels[0];
  assert.ok(channel);
  channel.Owned = true;
  const draft = createPlanDraft(snapshot),
    entry = draft[0];
  assert.ok(entry);
  entry.included = false;
  const profile = planProfiles(draft)[0];
  assert.equal(profile?.Mode, 0);
  assert.equal(profile?.Excluded, true);
});

test('CPU-only plans work and missing custom, mixed or stale sources block preview', () => {
  const snapshot = createDemoSnapshot();
  snapshot.Snapshot.Sensors = snapshot.Snapshot.Sensors.filter((sensor) => sensor.Group !== 'GPU');
  const draft = createPlanDraft(snapshot),
    entry = draft[1];
  assert.ok(entry);
  assert.equal(entry.profile.Source, 'group/cpu');
  assert.equal(planError(draft, snapshot), null);
  entry.profile.Source = 'group/mix';
  assert.match(planError(draft, snapshot) ?? '', /不可用/);
  entry.profile.Source = 'group/unknown';
  assert.match(planError(draft, snapshot) ?? '', /不可用/);
  const sensor = snapshot.Snapshot.Sensors.find((item) => item.Group === 'CPU');
  assert.ok(sensor);
  entry.profile.Source = sensor.Id;
  sensor.Time = new Date(Date.parse(snapshot.Snapshot.Time) - 5000).toISOString();
  assert.equal(readSourceTemperature(snapshot.Snapshot, sensor.Id), null);
  assert.match(planError(draft, snapshot) ?? '', /温度/);
});

test('removed or duplicate channels and invalid response times cannot be submitted', () => {
  const snapshot = createDemoSnapshot(),
    entries = createPlanDraft(snapshot),
    first = entries[0];
  assert.ok(first);
  assert.match(planError([...entries, first], snapshot) ?? '', /重复/);
  first.profile.RiseSeconds = Number.NaN;
  assert.match(validateProfile(first.profile) ?? '', /平滑/);
  first.profile.RiseSeconds = 3;
  first.profile.FallSeconds = 121;
  assert.match(validateProfile(first.profile) ?? '', /平滑/);
  snapshot.Snapshot.Channels.shift();
  assert.match(planError(entries, snapshot) ?? '', /通道已变化/);
});

test('reviewed curve values include the effective minimum and make no RPM estimate', () => {
  const snapshot = createDemoSnapshot(),
    channel = snapshot.Snapshot.Channels[1];
  assert.ok(channel);
  const profile = quietProfile(channel, snapshot);
  profile.Minimum = 45;
  assert.match(curveLabel(profile), /30°C → 45%/);
  assert.doesNotMatch(curveLabel(profile), /RPM/);
});
