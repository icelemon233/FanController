import { App } from 'antd';
import { createContext, type ReactNode, useContext, useEffect, useSyncExternalStore } from 'react';
import type { FanController } from './controller.ts';

const FanContext = createContext<FanController | null>(null);

export function FanControlProvider({
  controller,
  children,
}: {
  controller: FanController;
  children: ReactNode;
}) {
  const { message, notification } = App.useApp();
  useEffect(() => {
    const off = controller.onFeedback((event) => {
      if (event.notice) {
        notification[event.type === 'error' ? 'error' : 'info']({
          key: 'fan-service-notice',
          title: event.type === 'error' ? '操作未完成' : '风扇服务',
          description: event.message,
          placement: 'bottomRight',
          duration: event.type === 'error' ? 0 : 4.5,
        });
      } else
        message.open({
          key: 'fan-operation',
          type: event.type,
          content: event.message,
          duration: event.type === 'error' ? 3 : 2,
        });
    });
    return off;
  }, [controller, message, notification]);
  useEffect(() => {
    void controller.start();
    return controller.stop;
  }, [controller]);
  return <FanContext.Provider value={controller}>{children}</FanContext.Provider>;
}

export function useFanControl() {
  const controller = useContext(FanContext);
  if (!controller) throw new Error('风扇功能尚未初始化。');
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { state, controller };
}
