import { Alert, Button } from 'antd';
import { useFanControl } from './FanControlProvider.tsx';

export function ConnectionNotice() {
  const { state, controller } = useFanControl();
  if (state.connection.kind === 'ready' || state.connection.kind === 'connecting') return null;
  return (
    <Alert
      showIcon
      type={state.connection.kind === 'failed' ? 'error' : 'warning'}
      title={state.connection.kind === 'failed' ? '风扇服务连接失败' : '未收到风扇服务的最新读数'}
      description={
        state.connection.kind === 'failed'
          ? state.connection.message
          : '当前无法确认风扇状态，调整功能已暂停。服务仍在运行时会继续控制；与应用断开连接时会尝试恢复原设置。'
      }
      action={
        <Button
          disabled={Boolean(state.busy)}
          onClick={() => {
            void controller.reconnect();
          }}
        >
          重新连接
        </Button>
      }
    />
  );
}
