import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoSnapshot } from '../src/features/fans/api/demoData.ts';
import type { FanGateway } from '../src/features/fans/api/gateway.ts';
import { createFanController, type Feedback } from '../src/features/fans/controller.ts';
import { createPlanDraft, planProfiles } from '../src/features/fans/coolingPlan.ts';
import { FakeGateway, FakeScheduler, memoryModePreference, reply } from './helpers.ts';

async function connected() {
  const gateway = new FakeGateway(),
    scheduler = new FakeScheduler(),
    preference = memoryModePreference();
  const controller = createFanController(async () => gateway, preference, scheduler);
  await controller.start();
  gateway.publish(createDemoSnapshot());
  return { controller, gateway, scheduler, preference };
}

test('batch application freezes the reviewed values and rejects duplicate submissions', async () => {
  const { controller, gateway } = await connected();
  const profiles = planProfiles(createPlanDraft(createDemoSnapshot()));
  const pending = controller.applyPlan(profiles);
  const submitted = gateway.requests.at(-1);
  assert.equal(submitted?.Action, 'plan');
  const first = profiles[0];
  assert.ok(first);
  first.Minimum = 80;
  if (submitted?.Action !== 'plan') throw new Error('Expected plan command');
  assert.equal(submitted.Profiles[0]?.Minimum, 30);
  assert.equal(submitted.Profiles[3]?.Mode, 0);
  assert.equal(await controller.applyPlan(profiles), false);
  gateway.complete(reply({ Success: false, Message: '一个通道已断开，请重新预览' }));
  assert.equal(await pending, false);
  assert.equal(controller.getSnapshot().busy, null);
  controller.stop();
});

test('rapid repeated control actions submit only one native command', async () => {
  const { controller, gateway } = await connected();
  const first = controller.startSelectedMode();
  assert.equal(await controller.startSelectedMode(), false);
  assert.equal(await controller.release(), false);
  assert.equal(gateway.requests.filter((command) => command.Action !== 'ready').length, 1);
  gateway.complete(reply());
  assert.equal(await first, true);
  controller.stop();
});

test('changing a draft choice never writes hardware, even while fans are controlled', async () => {
  const { controller, gateway, preference } = await connected();
  const frame = createDemoSnapshot();
  for (const channel of frame.Snapshot.Channels) channel.Owned = true;
  frame.Snapshot.CoolingMode = '均衡';
  gateway.publish(frame);
  assert.equal(await controller.selectMode('静音'), true);
  assert.equal(gateway.requests.length, 1);
  assert.equal(controller.getSnapshot().selectedMode, '静音');
  assert.equal(preference.value, '静音');
  controller.stop();
});

test('applied-but-unsaved settings report a warning and keep the editor submission unsuccessful', async () => {
  const { controller, gateway } = await connected();
  const events: Feedback[] = [];
  controller.onFeedback((event) => events.push(event));
  const pending = controller.startSelectedMode();
  gateway.complete(
    reply({ PersistenceError: '磁盘只读', Message: '设置已生效，但未能保存到此电脑' }),
  );
  assert.equal(await pending, false);
  assert.equal(events.at(-1)?.type, 'warning');
  controller.stop();
});

test('stale and invalid connections pause commands; valid telemetry recovers them', async () => {
  const { controller, gateway, scheduler } = await connected();
  scheduler.advance(7000);
  assert.equal(controller.getSnapshot().connection.kind, 'stale');
  assert.equal(await controller.release(), false);
  gateway.publish(createDemoSnapshot(new Date(scheduler.now()).toISOString()));
  assert.equal(controller.getSnapshot().connection.kind, 'ready');
  gateway.publish({ Type: 'protocol-error', Message: '数据异常' });
  assert.equal(controller.getSnapshot().connection.kind, 'failed');
  assert.equal(await controller.startSelectedMode(), false);
  gateway.publish(createDemoSnapshot(new Date(scheduler.now()).toISOString()));
  assert.equal(controller.getSnapshot().connection.kind, 'ready');
  controller.stop();
  assert.equal(scheduler.tasks.size, 0);
});

test('late initialization after unmount releases the transport and cannot publish state', async () => {
  let resolveGateway: ((value: FanGateway) => void) | undefined;
  const delayed = new Promise<FanGateway>((resolve) => {
    resolveGateway = resolve;
  });
  const scheduler = new FakeScheduler();
  const controller = createFanController(() => delayed, memoryModePreference(), scheduler);
  const start = controller.start();
  controller.stop();
  const gateway = new FakeGateway();
  assert.ok(resolveGateway);
  resolveGateway(gateway);
  await start;
  assert.equal(gateway.disposed, true);
  assert.equal(controller.getSnapshot().snapshot, undefined);
  assert.equal(scheduler.tasks.size, 0);
});

test('reconnect cancels old waits and ignores the old session', async () => {
  const first = new FakeGateway(),
    second = new FakeGateway();
  let calls = 0;
  const controller = createFanController(
    async () => (++calls === 1 ? first : second),
    memoryModePreference(),
    new FakeScheduler(),
  );
  await controller.start();
  first.publish(createDemoSnapshot());
  const old = controller.startSelectedMode();
  await controller.reconnect();
  second.publish(createDemoSnapshot());
  assert.equal(await old, false);
  assert.equal(controller.getSnapshot().busy, null);
  assert.equal(first.disposed, true);
  controller.stop();
});

test('invalid profiles never reach the native worker', async () => {
  const { controller, gateway } = await connected();
  assert.equal(
    await controller.applyProfile({
      Id: 'demo/0',
      Name: 'CPU',
      Mode: 1,
      Source: 'group/cpu',
      RpmId: null,
      Minimum: 10,
      Manual: 50,
      Points: [],
    }),
    false,
  );
  assert.equal(gateway.requests.length, 1);
  controller.stop();
});
