import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoSnapshot } from '../src/features/fans/api/demoData.ts';
import { createDemoGateway } from '../src/features/fans/api/demoGateway.ts';
import type { FanCommand } from '../src/features/fans/api/gateway.ts';
import { createPlanDraft, planProfiles } from '../src/features/fans/coolingPlan.ts';
import { preset, type Snapshot } from '../src/features/fans/model.ts';
import { FakeScheduler } from './helpers.ts';

test('explicit demo sessions preserve exclusions and calibrated floors, and dispose all activity', async () => {
  const scheduler = new FakeScheduler(),
    gateway = createDemoGateway(scheduler);
  let frame: Snapshot | undefined;
  gateway.subscribe((event) => {
    if (event.Type === 'snapshot') frame = event;
  });
  const execute = (command: FanCommand) => {
    const pending = gateway.request(command);
    scheduler.advance(180);
    return pending;
  };
  await execute({ Action: 'ready' });
  assert.equal(frame?.Snapshot.Demo, true);
  await execute({
    Action: 'apply',
    Profile: {
      Id: 'demo/0',
      Name: 'CPU',
      Mode: 0,
      Source: 'group/cpu',
      RpmId: null,
      Minimum: 65,
      Manual: 50,
      Points: preset('静音'),
      Excluded: true,
    },
  });
  await execute({ Action: 'smart', Mode: '强冷' });
  assert.equal(frame?.Snapshot.Channels.filter((channel) => channel.Owned).length, 2);
  assert.equal(frame?.Profiles.find((profile) => profile.Id === 'demo/0')?.Minimum, 65);
  await execute({ Action: 'rescan' });
  assert.equal(
    frame?.Snapshot.Channels.some((channel) => channel.Owned),
    false,
  );
  gateway.dispose();
  assert.equal(scheduler.tasks.size, 0);
  await assert.rejects(gateway.request({ Action: 'ready' }));
});

test('explicit demo applies reviewed curves and validates the whole batch before any change', async () => {
  const scheduler = new FakeScheduler(),
    gateway = createDemoGateway(scheduler);
  let frame = createDemoSnapshot();
  gateway.subscribe((event) => {
    if (event.Type === 'snapshot') frame = event;
  });
  const execute = (command: FanCommand) => {
    const pending = gateway.request(command);
    scheduler.advance(180);
    return pending;
  };
  await execute({ Action: 'ready' });
  const profiles = planProfiles(createPlanDraft(frame));
  const invalid = structuredClone(profiles),
    trailing = invalid.at(-1);
  assert.ok(trailing);
  trailing.Id = 'removed-channel';
  await assert.rejects(execute({ Action: 'plan', Profiles: invalid }), /通道已变化/);
  assert.equal(
    frame.Snapshot.Channels.some((channel) => channel.Owned),
    false,
  );
  const first = profiles[0];
  assert.ok(first);
  first.Minimum = 46;
  await execute({ Action: 'plan', Profiles: profiles });
  assert.equal(frame.Snapshot.Channels.filter((channel) => channel.Owned).length, 3);
  assert.equal(frame.Snapshot.Channels[0]?.Target, 46);
  assert.deepEqual(frame.Snapshot.Channels[0]?.ActiveProfile?.Points, first.Points);
  assert.equal(frame.Snapshot.Channels[0]?.ActiveProfile?.RiseSeconds, 3);
  assert.equal(frame.Snapshot.Channels[3]?.Owned, false);
  gateway.dispose();
});
