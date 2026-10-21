import type { FanCommand, FanEvent, FanGateway } from '../src/features/fans/api/gateway.ts';
import type { CoolingMode, Reply } from '../src/features/fans/model.ts';
import type { ChoicePreference } from '../src/platform/preferences.ts';
import type { Scheduler } from '../src/platform/scheduler.ts';
import type { WebViewPort } from '../src/platform/webview.ts';

export class FakeScheduler implements Scheduler {
  time = Date.now();
  next = 0;
  tasks = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  after(callback: () => void, milliseconds: number) {
    const id = ++this.next;
    this.tasks.set(id, { at: this.time + milliseconds, callback });
    return id;
  }
  cancel(handle: unknown) {
    if (typeof handle === 'number') this.tasks.delete(handle);
  }
  advance(milliseconds: number) {
    const end = this.time + milliseconds;
    for (;;) {
      const next = [...this.tasks]
        .filter(([, task]) => task.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.tasks.delete(next[0]);
      this.time = next[1].at;
      next[1].callback();
    }
    this.time = end;
  }
}

export class FakePort implements WebViewPort {
  sent: unknown[] = [];
  listeners = new Set<(event: { data: unknown }) => void>();
  postMessage(value: unknown) {
    this.sent.push(value);
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void) {
    this.listeners.delete(listener);
  }
  emit(data: unknown) {
    for (const listener of this.listeners) listener({ data });
  }
  requestId(index: number) {
    const request = this.sent[index];
    if (
      !request ||
      typeof request !== 'object' ||
      !('Id' in request) ||
      typeof request.Id !== 'string'
    )
      throw new Error('Missing request id');
    return request.Id;
  }
}

export const reply = (patch: Partial<Reply> = {}): Reply => ({
  Type: 'reply',
  Id: 'fake',
  Success: true,
  Message: '设置已应用',
  ...patch,
});

export class FakeGateway implements FanGateway {
  listeners = new Set<(event: FanEvent) => void>();
  requests: FanCommand[] = [];
  waiting: { resolve: (value: Reply) => void; reject: (error: Error) => void }[] = [];
  disposed = false;
  autoReconnect = true;
  subscribe(listener: (event: FanEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  request(command: FanCommand) {
    this.requests.push(command);
    if (command.Action === 'ready' || (command.Action === 'reconnect' && this.autoReconnect))
      return Promise.resolve(reply());
    return new Promise<Reply>((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
  }
  publish(event: FanEvent) {
    for (const listener of this.listeners) listener(structuredClone(event));
  }
  complete(value: Reply) {
    const request = this.waiting.shift();
    if (!request) throw new Error('No waiting command');
    request.resolve(value);
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
    for (const request of this.waiting.splice(0)) request.reject(new Error('Connection disposed'));
  }
}

export function memoryModePreference(): ChoicePreference<CoolingMode> & { value: CoolingMode } {
  return {
    value: '均衡',
    read() {
      return { value: this.value };
    },
    write(value) {
      this.value = value;
      return undefined;
    },
  };
}
