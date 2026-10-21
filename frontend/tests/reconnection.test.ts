import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoSnapshot } from '../src/features/fans/api/demoData.ts';
import { createNativeGateway } from '../src/features/fans/api/nativeGateway.ts';
import { createFanController } from '../src/features/fans/controller.ts';
import { FakeGateway, FakePort, FakeScheduler, memoryModePreference, reply } from './helpers.ts';

test('reconnect sends a service recovery request, shares repeated clicks and waits for fresh telemetry', async () => {
  const first = new FakeGateway();
  const second = new FakeGateway();
  second.autoReconnect = false;
  const scheduler = new FakeScheduler();
  let calls = 0;
  const controller = createFanController(
    async () => (++calls === 1 ? first : second),
    memoryModePreference(),
    scheduler,
  );
  await controller.start();
  const old = createDemoSnapshot(new Date(scheduler.now()).toISOString());
  first.publish(old);
  scheduler.advance(10000);
  const pending = controller.reconnect();
  assert.equal(controller.reconnect(), pending);
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.deepEqual(second.requests, [{ Action: 'reconnect' }]);
  assert.equal(controller.getSnapshot().connection.kind, 'reconnecting');
  assert.equal(await controller.release(), false);
  second.complete(reply());
  await pending;
  assert.notEqual(controller.getSnapshot().connection.kind, 'ready');
  second.publish(old);
  assert.equal(controller.getSnapshot().connection.kind, 'stale');
  second.publish(createDemoSnapshot(new Date(scheduler.now()).toISOString()));
  assert.equal(controller.getSnapshot().connection.kind, 'ready');
  assert.equal(second.requests.length, 1, 'recovery must not automatically reapply fan settings');
  controller.stop();
});

test('a failed service recovery stays visible and can be retried without replaying controls', async () => {
  const gateways = [new FakeGateway(), new FakeGateway(), new FakeGateway()];
  const failing = gateways[1];
  assert.ok(failing);
  failing.autoReconnect = false;
  let calls = 0;
  const controller = createFanController(async () => {
    const gateway = gateways[calls++];
    assert.ok(gateway);
    return gateway;
  }, memoryModePreference());
  await controller.start();
  const pending = controller.reconnect();
  await Promise.resolve();
  failing.complete(reply({ Success: false, Message: '旧服务尚未完成恢复和退出' }));
  await pending;
  assert.deepEqual(controller.getSnapshot().connection, {
    kind: 'failed',
    message: '旧服务尚未完成恢复和退出',
  });
  await controller.reconnect();
  assert.equal(calls, 3);
  assert.deepEqual(gateways[2]?.requests, [{ Action: 'reconnect' }]);
  controller.stop();
});

test('worker exit invalidates the connection immediately and rejects pending requests once', async () => {
  const port = new FakePort();
  const scheduler = new FakeScheduler();
  const gateway = createNativeGateway(port, scheduler);
  const controller = createFanController(async () => gateway, memoryModePreference(), scheduler);
  const start = controller.start();
  await Promise.resolve();
  port.emit(reply({ Id: port.requestId(0) }));
  await start;
  port.emit(createDemoSnapshot(new Date(scheduler.now()).toISOString()));
  const operation = controller.release();
  const message = '风扇服务意外退出，之前的风扇状态无法确认';
  port.emit({ Type: 'service-error', Message: message });
  assert.deepEqual(controller.getSnapshot().connection, { kind: 'failed', message });
  assert.equal(await operation, false);
  assert.equal(controller.getSnapshot().busy, null);
  assert.equal(await controller.applyPlan([]), false);
  controller.stop();
  assert.equal(scheduler.tasks.size, 0);
});
