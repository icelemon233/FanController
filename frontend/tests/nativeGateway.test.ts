import assert from 'node:assert/strict';
import test from 'node:test';
import { createGatewayFactory } from '../src/features/fans/api/createGateway.ts';
import { createDemoSnapshot } from '../src/features/fans/api/demoData.ts';
import type { FanEvent } from '../src/features/fans/api/gateway.ts';
import { createNativeGateway } from '../src/features/fans/api/nativeGateway.ts';
import { parseHostEvent } from '../src/features/fans/api/protocol.ts';
import { FakePort, FakeScheduler } from './helpers.ts';

test('native replies correlate by request identity and preserve save failures', async () => {
  const port = new FakePort(),
    scheduler = new FakeScheduler();
  const gateway = createNativeGateway(port, scheduler);
  const pending = gateway.request({ Action: 'release' });
  port.emit({
    Type: 'reply',
    Id: port.requestId(0),
    Success: true,
    Message: '未保存',
    PersistenceError: '只读磁盘',
  });
  assert.equal((await pending).PersistenceError, '只读磁盘');
  assert.equal(scheduler.tasks.size, 0);
  gateway.dispose();
});

test('request timeout and disposal release their timers and event listener', async () => {
  const port = new FakePort(),
    scheduler = new FakeScheduler();
  const gateway = createNativeGateway(port, scheduler);
  const timeout = assert.rejects(gateway.request({ Action: 'release' }), /尚未收到操作结果/);
  scheduler.advance(20000);
  await timeout;
  const canceled = assert.rejects(gateway.request({ Action: 'enableMotherboard' }), /连接已关闭/);
  gateway.dispose();
  await canceled;
  assert.equal(scheduler.tasks.size, 0);
  assert.equal(port.listeners.size, 0);
});

test('a delayed reply from a disposed client cannot complete a new handshake', async () => {
  const port = new FakePort(),
    scheduler = new FakeScheduler();
  const first = createNativeGateway(port, scheduler);
  const canceled = assert.rejects(first.request({ Action: 'release' }));
  const oldId = port.requestId(0);
  first.dispose();
  await canceled;
  const second = createNativeGateway(port, scheduler);
  let settled = false;
  const ready = second.request({ Action: 'ready' }).then((result) => {
    settled = true;
    return result;
  });
  const newId = port.requestId(1);
  assert.notEqual(oldId, newId);
  port.emit({ Type: 'reply', Id: oldId, Success: true, Message: '旧请求' });
  await Promise.resolve();
  assert.equal(settled, false);
  port.emit({ Type: 'reply', Id: newId, Success: true, Message: '已连接' });
  assert.equal((await ready).Message, '已连接');
  second.dispose();
});

test('malformed telemetry becomes a protocol error rather than usable state', () => {
  const port = new FakePort(),
    gateway = createNativeGateway(port, new FakeScheduler());
  const events: FanEvent[] = [];
  gateway.subscribe((event) => events.push(event));
  const invalid = createDemoSnapshot();
  const channel = invalid.Snapshot.Channels[0];
  assert.ok(channel);
  channel.Owned = 'true' as unknown as boolean;
  port.emit(invalid);
  assert.equal(events.at(-1)?.Type, 'protocol-error');
  gateway.dispose();
});

test('the wire boundary accepts .NET dates, isolates input and normalizes nullable metadata', () => {
  const input = createDemoSnapshot('/Date(1792100000000)/');
  input.Snapshot.Cpu = null;
  const parsed = parseHostEvent(input);
  assert.equal(parsed?.Type, 'snapshot');
  input.Snapshot.Channels.length = 0;
  if (parsed?.Type !== 'snapshot') throw new Error('Expected telemetry');
  assert.equal(parsed.Snapshot.Channels.length, 4);
  assert.equal(parsed.Snapshot.Cpu, null);
  assert.throws(() => parseHostEvent({ Type: 'reply', Id: 'x', Success: 'yes' }));
});

test('desktop production never falls back to a browser demo when the bridge is missing', async () => {
  await assert.rejects(createGatewayFactory(undefined, false)(), /未检测到 Windows 原生桥接/);
});
