import { Alert, Button } from 'antd';
import { useFanControl } from './FanControlProvider.tsx';

export function ConnectionNotice() {
  const { state, controller } = useFanControl();
  if (state.connection.kind === 'ready' || state.connection.kind === 'connecting') return null;
  const reconnecting = state.connection.kind === 'reconnecting';
  return (
    <Alert
      showIcon
      data-testid="connection-notice"
      type={reconnecting ? 'info' : state.connection.kind === 'failed' ? 'error' : 'warning'}
      title={
        reconnecting
          ? '正在重新连接风扇服务'
          : state.connection.kind === 'failed'
            ? '风扇服务连接失败'
            : '未收到风扇服务的最新读数'
      }
      description={
        reconnecting
          ? '正在检查服务并等待新读数。若需要重启服务，会先等待旧服务恢复和退出；完成前无法调整风扇。'
          : state.connection.kind === 'failed'
            ? state.connection.message
            : '当前显示的是上次记录，无法确认风扇此刻的状态。重新连接会检查服务，并在需要时安全重启；不会自动重新应用设置。'
      }
      action={
        <Button
          data-testid="reconnect-worker"
          loading={reconnecting}
          disabled={Boolean(state.busy) || reconnecting}
          onClick={() => {
            void controller.reconnect();
          }}
        >
          {reconnecting ? '正在重新连接' : '重新连接'}
        </Button>
      }
    />
  );
}
