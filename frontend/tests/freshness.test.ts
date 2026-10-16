import assert from 'node:assert/strict';
import test from 'node:test';
import { createGatewayFactory } from '../src/features/fans/api/createGateway.ts';
import { createDemoSnapshot } from '../src/features/fans/api/demoData.ts';
import { createFanController } from '../src/features/fans/controller.ts';
import { FakeGateway, FakePort, FakeScheduler, memoryModePreference } from './helpers.ts';

test('replayed old telemetry does not make a disconnected worker ready again', async () => {
  const gateway = new FakeGateway(),
    scheduler = new FakeScheduler();
  const controller = createFanController(async () => gateway, memoryModePreference(), scheduler);
  await controller.start();
  const first = createDemoSnapshot(new Date(scheduler.now()).toISOString());
  gateway.publish(first);
  scheduler.advance(10000);
  gateway.publish(first);
  assert.equal(controller.getSnapshot().connection.kind, 'stale');
  assert.equal(await controller.startSelectedMode(), false);
  assert.equal(controller.getSnapshot().history.cpu.length, 1);
  gateway.publish(createDemoSnapshot(new Date(scheduler.now()).toISOString()));
  assert.equal(controller.getSnapshot().connection.kind, 'ready');
  controller.stop();
});

test('an available native port always wins over the browser-demo option', async () => {
  const port = new FakePort();
  const gateway = await createGatewayFactory(port, true)();
  assert.equal(port.listeners.size, 1);
  gateway.dispose();
  assert.equal(port.listeners.size, 0);
});
