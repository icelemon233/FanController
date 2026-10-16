import { type Scheduler, systemScheduler } from '../../../platform/scheduler.ts';
import { type FanProfile, isCoolingMode, preset, type Reply, validateProfile } from '../model.ts';
import { createDemoSnapshot } from './demoData.ts';
import type { FanCommand, FanEvent, FanGateway } from './gateway.ts';

export function createDemoGateway(scheduler: Scheduler = systemScheduler): FanGateway {
  const demo = createDemoSnapshot(new Date(scheduler.now()).toISOString());
  const listeners = new Set<(event: FanEvent) => void>();
  const jobs = new Map<unknown, (error: Error) => void>();
  let polling = false;
  let disposed = false;
  let poll: unknown;
  const publish = () => {
    demo.Snapshot.Time = new Date(scheduler.now()).toISOString();
    for (const sensor of demo.Snapshot.Sensors) sensor.Time = demo.Snapshot.Time;
    for (const listener of listeners) listener(structuredClone(demo));
  };
  const tick = () => {
    if (disposed) return;
    publish();
    poll = scheduler.after(tick, 1000);
  };
  const apply = (profile: FanProfile) => {
    const channel = demo.Snapshot.Channels.find((item) => item.Id === profile.Id);
    if (!channel) throw new Error('未找到这组风扇，请重新检测');
    const error = validateProfile(profile);
    if (error) throw new Error(error);
    channel.Mode = profile.Excluded ? 0 : profile.Mode;
    channel.Owned = channel.Mode !== 0;
    channel.Target = channel.Owned
      ? Math.max(profile.Minimum, profile.Mode === 1 ? profile.Manual : 55)
      : null;
    channel.Status = channel.Owned ? (channel.Mode === 1 ? '固定输出' : '随温度调节') : '未接管';
    demo.Profiles = [
      ...demo.Profiles.filter((item) => item.Id !== profile.Id),
      structuredClone({ ...profile, Mode: channel.Mode }),
    ];
    const recommendation = demo.Recommendations.find((item) => item.Id === profile.Id);
    if (recommendation) {
      recommendation.Eligible = !profile.Excluded;
      recommendation.Reason = profile.Excluded ? '已关闭“跟随主页模式”' : null;
    }
  };
  const execute = (command: FanCommand): Reply => {
    const reply: Reply = { Type: 'reply', Id: 'demo', Success: true, Message: '' };
    switch (command.Action) {
      case 'ready':
        if (!polling) {
          polling = true;
          poll = scheduler.after(tick, 1000);
        }
        break;
      case 'smart': {
        if (!isCoolingMode(command.Mode)) throw new Error('风扇模式无效，请重新选择。');
        let count = 0;
        for (const channel of demo.Snapshot.Channels) {
          const recommendation = demo.Recommendations.find((item) => item.Id === channel.Id);
          if (!recommendation?.Eligible) continue;
          const saved = demo.Profiles.find((item) => item.Id === channel.Id);
          apply({
            Id: channel.Id,
            Name: saved?.Name ?? channel.Name,
            Mode: 2,
            Source: recommendation.Source,
            RpmId: saved?.RpmId ?? channel.DefaultRpmId,
            Minimum: Math.max(30, saved?.Minimum ?? 30),
            Manual: 50,
            Points: preset(command.Mode),
          });
          count++;
        }
        demo.Snapshot.CoolingMode = count > 0 ? command.Mode : null;
        reply.Success = count > 0;
        reply.Message =
          count > 0
            ? `已将 ${count} 组风扇设为${command.Mode}模式`
            : '没有可自动调节的风扇，请查看设备状态。';
        reply.Applied = count;
        break;
      }
      case 'release':
      case 'rescan':
        for (const channel of demo.Snapshot.Channels)
          Object.assign(channel, { Owned: false, Target: null, Mode: 0, Status: '未接管' });
        demo.Snapshot.CoolingMode = null;
        reply.Message = command.Action === 'release' ? '已恢复风扇原设置' : '演示设备检测完成';
        break;
      case 'apply':
        apply(command.Profile);
        demo.Snapshot.CoolingMode = demo.Snapshot.Channels.some((channel) => channel.Owned)
          ? '自定义'
          : null;
        reply.Message = '设置已应用';
        break;
      case 'enableMotherboard':
        reply.Message = '演示模式使用模拟风扇，无需安装硬件组件';
        break;
      default:
        throw new Error('不支持此风扇操作。');
    }
    publish();
    return reply;
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    request(command) {
      if (disposed) return Promise.reject(new Error('演示连接已关闭。'));
      return new Promise((resolve, reject) => {
        const timer = scheduler.after(() => {
          jobs.delete(timer);
          try {
            resolve(execute(command));
          } catch (error) {
            reject(error);
          }
        }, 180);
        jobs.set(timer, reject);
      });
    },
    dispose() {
      disposed = true;
      scheduler.cancel(poll);
      for (const [timer, reject] of jobs) {
        scheduler.cancel(timer);
        reject(new Error('演示连接已关闭。'));
      }
      jobs.clear();
      listeners.clear();
    },
  };
}
