import type { ChoicePreference } from '../../platform/preferences.ts';
import { type Scheduler, systemScheduler } from '../../platform/scheduler.ts';
import type { FanCommand, FanEvent, FanGateway } from './api/gateway.ts';
import {
  type CoolingMode,
  dateValue,
  type FanProfile,
  isCoolingMode,
  readTemperature,
  type Snapshot,
  validateProfile,
} from './model.ts';

export type FanOperation = Exclude<FanCommand['Action'], 'ready' | 'reconnect'>;
export type ConnectionState =
  | { kind: 'connecting' | 'reconnecting' | 'ready' | 'stale' }
  | { kind: 'failed'; message: string };
export interface FanState {
  connection: ConnectionState;
  snapshot?: Snapshot;
  history: { cpu: (number | null)[]; gpu: (number | null)[] };
  selectedMode: CoolingMode;
  busy: FanOperation | null;
}
export interface Feedback {
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  notice?: boolean;
}

export function createFanController(
  createGateway: () => Promise<FanGateway>,
  preference: ChoicePreference<CoolingMode>,
  scheduler: Scheduler = systemScheduler,
) {
  const loaded = preference.read();
  let state: FanState = {
    connection: { kind: 'connecting' },
    history: { cpu: [], gpu: [] },
    selectedMode: loaded.value,
    busy: null,
  };
  let generation = 0;
  let running = false;
  let gateway: FanGateway | undefined;
  let unsubscribe: (() => void) | undefined;
  let monitor: unknown;
  let lastReceived = 0;
  let reconnectTask: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const feedback = new Set<(event: Feedback) => void>();
  const update = (patch: Partial<FanState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const report = (event: Feedback) => {
    for (const listener of feedback) listener(event);
  };
  const saveMode = (selectedMode: CoolingMode) => {
    update({ selectedMode });
    const issue = preference.write(selectedMode);
    if (issue) report({ type: 'warning', message: issue });
  };
  const synchronizeMode = () => {
    const mode = state.snapshot?.Snapshot.CoolingMode;
    if (isCoolingMode(mode) && state.busy !== 'smart' && state.selectedMode !== mode)
      update({ selectedMode: mode });
  };
  const receive = (event: FanEvent) => {
    if (event.Type === 'snapshot') {
      const now = scheduler.now();
      const timestamp = dateValue(event.Snapshot.Time);
      const fresh = now - timestamp <= 6000 && now - timestamp >= -1000;
      lastReceived = Math.min(now, timestamp);
      update({
        connection: { kind: fresh ? 'ready' : 'stale' },
        snapshot: event,
        history: fresh
          ? {
              cpu: [...state.history.cpu, readTemperature(event.Snapshot, 'CPU')].slice(-60),
              gpu: [...state.history.gpu, readTemperature(event.Snapshot, 'GPU')].slice(-60),
            }
          : state.history,
      });
      synchronizeMode();
    } else if (event.Type === 'protocol-error' || event.Type === 'service-error')
      update({ connection: { kind: 'failed', message: event.Message } });
    else report({ type: event.Success ? 'info' : 'error', message: event.Message, notice: true });
  };
  const stop = () => {
    running = false;
    generation++;
    scheduler.cancel(monitor);
    unsubscribe?.();
    unsubscribe = undefined;
    gateway?.dispose();
    gateway = undefined;
    reconnectTask = undefined;
    update({ busy: null, connection: { kind: 'connecting' } });
  };
  const start = async (handshake: 'ready' | 'reconnect' = 'ready') => {
    if (running) return;
    running = true;
    const current = ++generation;
    lastReceived = scheduler.now();
    update({ connection: { kind: handshake === 'reconnect' ? 'reconnecting' : 'connecting' } });
    try {
      const client = await createGateway();
      if (!running || current !== generation) {
        client.dispose();
        return;
      }
      gateway = client;
      unsubscribe = client.subscribe((event) => {
        if (current === generation && running) receive(event);
      });
      const tick = () => {
        if (!running || current !== generation) return;
        if (
          scheduler.now() - lastReceived > 6000 &&
          state.connection.kind !== 'failed' &&
          state.connection.kind !== 'stale' &&
          state.connection.kind !== 'reconnecting'
        )
          update({ connection: { kind: 'stale' } });
        monitor = scheduler.after(tick, 1000);
      };
      monitor = scheduler.after(tick, 1000);
      if (loaded.issue) report({ type: 'warning', message: loaded.issue });
      const reply = await client.request({ Action: handshake });
      if (!reply.Success) throw new Error(reply.Message || '风扇服务尚未就绪，请重新连接。');
    } catch (error) {
      if (!running || current !== generation) return;
      update({
        connection: {
          kind: 'failed',
          message: error instanceof Error ? error.message : '连接风扇服务失败，请重试。',
        },
      });
    }
  };
  const run = async (
    command: Exclude<FanCommand, { Action: 'ready' | 'reconnect' }>,
  ): Promise<boolean> => {
    if (state.busy || state.connection.kind !== 'ready' || !gateway) return false;
    const current = generation;
    update({ busy: command.Action });
    try {
      const reply = await gateway.request(command);
      if (!running || generation !== current) return false;
      report({
        type: !reply.Success || reply.PersistenceError ? 'warning' : 'success',
        message: reply.Message || (reply.Success ? '操作完成' : '操作失败，请重试'),
      });
      if (reply.Success && command.Action === 'smart') saveMode(command.Mode);
      return reply.Success && !reply.PersistenceError;
    } catch (error) {
      if (running && generation === current)
        report({
          type: 'error',
          message: error instanceof Error ? error.message : '操作失败，请重试',
        });
      return false;
    } finally {
      if (running && generation === current) {
        update({ busy: null });
        synchronizeMode();
      }
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onFeedback(listener: (event: Feedback) => void) {
      feedback.add(listener);
      return () => {
        feedback.delete(listener);
      };
    },
    start,
    stop,
    reconnect() {
      if (reconnectTask) return reconnectTask;
      stop();
      const task = start('reconnect').finally(() => {
        if (reconnectTask === task) reconnectTask = undefined;
      });
      reconnectTask = task;
      return task;
    },
    selectMode(mode: CoolingMode) {
      if (state.busy || state.connection.kind !== 'ready') return Promise.resolve(false);
      saveMode(mode);
      return Promise.resolve(true);
    },
    applyPlan(profiles: FanProfile[]) {
      const prepared = structuredClone(profiles);
      for (const profile of prepared) {
        const error = validateProfile(profile);
        if (error) {
          report({ type: 'warning', message: error });
          return Promise.resolve(false);
        }
      }
      return run({ Action: 'plan', Profiles: prepared });
    },
    startSelectedMode: () => run({ Action: 'smart', Mode: state.selectedMode }),
    release: () => run({ Action: 'release' }),
    rescan: () => run({ Action: 'rescan' }),
    enableMotherboard: () => run({ Action: 'enableMotherboard' }),
    applyProfile(profile: FanProfile) {
      const prepared = structuredClone(profile);
      if (prepared.Excluded) prepared.Mode = 0;
      const error = validateProfile(prepared);
      if (error) {
        report({ type: 'warning', message: error });
        return Promise.resolve(false);
      }
      return run({ Action: 'apply', Profile: prepared });
    },
  };
}

export type FanController = ReturnType<typeof createFanController>;
