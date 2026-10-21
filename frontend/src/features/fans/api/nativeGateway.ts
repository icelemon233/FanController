import { type Scheduler, systemScheduler } from '../../../platform/scheduler.ts';
import type { WebViewPort } from '../../../platform/webview.ts';
import type { Reply } from '../model.ts';
import type { FanEvent, FanGateway } from './gateway.ts';
import { parseHostEvent, protocolErrorMessage } from './protocol.ts';

export function createNativeGateway(
  port: WebViewPort,
  scheduler: Scheduler = systemScheduler,
): FanGateway {
  const listeners = new Set<(event: FanEvent) => void>();
  const pending = new Map<
    string,
    { resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: unknown }
  >();
  let counter = 0;
  const session = crypto.randomUUID();
  let disposed = false;
  const publish = (event: FanEvent) => {
    for (const listener of listeners) listener(event);
  };
  const receive = ({ data }: { data: unknown }) => {
    if (disposed) return;
    try {
      const event = parseHostEvent(data);
      if (!event) return;
      if (event.Type === 'reply') {
        const request = pending.get(event.Id);
        if (request) {
          scheduler.cancel(request.timer);
          pending.delete(event.Id);
          request.resolve(event);
        }
      } else {
        publish(event);
        if (event.Type === 'service-error') {
          for (const request of pending.values()) {
            scheduler.cancel(request.timer);
            request.reject(new Error(event.Message));
          }
          pending.clear();
        }
      }
    } catch {
      publish({ Type: 'protocol-error', Message: protocolErrorMessage });
    }
  };
  port.addEventListener('message', receive);
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    request(command) {
      if (disposed) return Promise.reject(new Error('风扇连接已关闭，请重新连接。'));
      const Id = `ui-${session}-${++counter}`;
      return new Promise((resolve, reject) => {
        const timer = scheduler.after(
          () => {
            pending.delete(Id);
            reject(new Error('尚未收到操作结果，请查看风扇状态后再试'));
          },
          command.Action === 'enableMotherboard' || command.Action === 'reconnect' ? 180000 : 20000,
        );
        pending.set(Id, { resolve, reject, timer });
        try {
          port.postMessage({ Type: 'command', Id, ...command });
        } catch {
          scheduler.cancel(timer);
          pending.delete(Id);
          reject(new Error('无法发送风扇操作，请重新连接。'));
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      port.removeEventListener('message', receive);
      for (const request of pending.values()) {
        scheduler.cancel(request.timer);
        request.reject(new Error('风扇连接已关闭，请重新连接。'));
      }
      pending.clear();
      listeners.clear();
    },
  };
}
