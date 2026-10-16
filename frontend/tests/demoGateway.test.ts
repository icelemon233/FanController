import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoGateway } from '../src/features/fans/api/demoGateway.ts';
import type { FanCommand } from '../src/features/fans/api/gateway.ts';
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
  assert.equal(frame?.Snapshot.Channels.filter((channel) => channel.Owned).length, 3);
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
