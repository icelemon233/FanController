import { dateValue, type Reply, type Snapshot } from '../model.ts';
import type { FanEvent } from './gateway.ts';

type RecordValue = Record<string, unknown>;
type Check = (value: unknown) => boolean;
const object = (value: unknown): value is RecordValue =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text: Check = (value) => typeof value === 'string';
const optionalText: Check = (value) => value == null || text(value);
const flag: Check = (value) => typeof value === 'boolean';
const number: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const nullableNumber: Check = (value) => value === null || number(value);
const date: Check = (value) => typeof value === 'string' && Number.isFinite(dateValue(value));
const mode: Check = (value) => value === 0 || value === 1 || value === 2;
const list =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check);
const shape =
  (fields: Record<string, Check>): Check =>
  (value) =>
    object(value) && Object.entries(fields).every(([key, check]) => check(value[key]));

const sensor = shape({
  Id: text,
  Name: text,
  Device: text,
  Group: text,
  Kind: text,
  Value: nullableNumber,
  Time: date,
});
const channel = shape({
  Id: text,
  Name: text,
  Device: text,
  Group: text,
  DefaultRpmId: optionalText,
  Status: text,
  Mode: mode,
  Target: nullableNumber,
  Owned: flag,
  Error: optionalText,
  ActiveProfile: (value) => value == null || profile(value),
});
const profile = shape({
  Id: text,
  Name: optionalText,
  Mode: mode,
  Source: optionalText,
  RpmId: optionalText,
  Minimum: number,
  Manual: number,
  Points: (value) => value === null || list(shape({ Temperature: number, Duty: number }))(value),
  Excluded: (value) => value == null || flag(value),
  Role: (value) =>
    value == null || ['CPU', 'GPU', 'Case', 'Pump', 'Unknown'].includes(String(value)),
  RiseSeconds: (value) => value == null || number(value),
  FallSeconds: (value) => value == null || number(value),
});
const recommendation = shape({
  Id: text,
  Role: (value) => ['CPU', 'GPU', 'Case', 'Pump', 'Unknown'].includes(String(value)),
  Source: text,
  SourceLabel: text,
  Eligible: flag,
  Reason: optionalText,
});
const frame = shape({
  Channels: list(channel),
  Sensors: list(sensor),
  Notices: list(text),
  Administrator: flag,
  PawnIoInstalled: flag,
  Demo: flag,
  Time: date,
  Board: optionalText,
  Cpu: optionalText,
  Gpu: optionalText,
  CoolingMode: optionalText,
});
const snapshot = shape({
  Snapshot: frame,
  Profiles: list(profile),
  Recommendations: list(recommendation),
});

export const protocolErrorMessage = '风扇服务返回的数据格式异常，调整功能已暂停。请重新连接。';

export function parseHostEvent(value: unknown): FanEvent | Reply | undefined {
  if (!object(value) || typeof value.Type !== 'string') throw new Error(protocolErrorMessage);
  if (value.Type === 'snapshot' && snapshot(value)) {
    const parsed = structuredClone(value) as unknown as Snapshot;
    parsed.Snapshot.Board ??= null;
    parsed.Snapshot.Cpu ??= null;
    parsed.Snapshot.Gpu ??= null;
    for (const saved of [
      ...parsed.Profiles,
      ...parsed.Snapshot.Channels.flatMap((item) =>
        item.ActiveProfile ? [item.ActiveProfile] : [],
      ),
    ]) {
      saved.Name ??= '';
      saved.Source ??= '';
      saved.Points ??= [];
    }
    for (const item of parsed.Snapshot.Channels) {
      if (
        item.ActiveProfile &&
        (item.ActiveProfile.Id !== item.Id || item.ActiveProfile.Mode !== item.Mode)
      )
        throw new Error(protocolErrorMessage);
    }
    return parsed;
  }
  if (value.Type === 'service-error' && text(value.Message)) {
    return { Type: 'service-error', Message: String(value.Message) };
  }
  if (value.Type === 'notice' && text(value.Message) && flag(value.Success)) {
    return { Type: 'notice', Message: String(value.Message), Success: Boolean(value.Success) };
  }
  if (
    value.Type === 'reply' &&
    text(value.Id) &&
    flag(value.Success) &&
    optionalText(value.Message) &&
    optionalText(value.PersistenceError) &&
    (value.Applied === undefined || number(value.Applied)) &&
    (value.Skipped === undefined || number(value.Skipped))
  ) {
    return {
      Type: 'reply',
      Id: String(value.Id),
      Success: Boolean(value.Success),
      Message: String(value.Message ?? ''),
      PersistenceError: value.PersistenceError == null ? null : String(value.PersistenceError),
      ...(typeof value.Applied === 'number' ? { Applied: value.Applied } : {}),
      ...(typeof value.Skipped === 'number' ? { Skipped: value.Skipped } : {}),
    };
  }
  if (value.Type === 'window' && typeof value.Maximized === 'boolean') return undefined;
  if (
    value.Type === 'caption-hover' &&
    ['none', 'minimize', 'maximize', 'close'].includes(String(value.Message))
  )
    return undefined;
  if (
    value.Type === 'window-state' &&
    (value.Message === 'normal' || value.Message === 'maximized')
  )
    return undefined;
  throw new Error(protocolErrorMessage);
}
