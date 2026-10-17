export type CoolingMode = '静音' | '均衡' | '强冷';
export type FanRole = 'CPU' | 'GPU' | 'Case' | 'Pump' | 'Unknown';
export interface CurvePoint {
  Temperature: number;
  Duty: number;
}
export interface FanProfile {
  Id: string;
  Name: string;
  Mode: 0 | 1 | 2;
  Source: string;
  RpmId: string | null;
  Minimum: number;
  Manual: number;
  Points: CurvePoint[];
  Excluded?: boolean | null;
  Role?: FanRole | null;
  RiseSeconds?: number | null;
  FallSeconds?: number | null;
}
export interface Sensor {
  Id: string;
  Name: string;
  Device: string;
  Group: string;
  Kind: string;
  Value: number | null;
  Time: string;
}
export interface Channel {
  Id: string;
  Name: string;
  Device: string;
  Group: string;
  DefaultRpmId: string | null;
  Status: string;
  Mode: 0 | 1 | 2;
  Target: number | null;
  Owned: boolean;
  Error: string | null;
  ActiveProfile?: FanProfile | null;
}
export interface Frame {
  Channels: Channel[];
  Sensors: Sensor[];
  Notices: string[];
  Administrator: boolean;
  PawnIoInstalled: boolean;
  Demo: boolean;
  Time: string;
  Board: string | null;
  Cpu: string | null;
  Gpu: string | null;
  CoolingMode?: string | null;
}
export interface Recommendation {
  Id: string;
  Role: FanRole;
  Source: string;
  SourceLabel: string;
  Eligible: boolean;
  Reason: string | null;
}
export interface Snapshot {
  Type: 'snapshot';
  Snapshot: Frame;
  Profiles: FanProfile[];
  Recommendations: Recommendation[];
}
export interface Reply {
  Type: 'reply';
  Id: string;
  Success: boolean;
  Message: string;
  Applied?: number;
  Skipped?: number;
  PersistenceError?: string | null;
}

export function isCoolingMode(value: unknown): value is CoolingMode {
  return value === '静音' || value === '均衡' || value === '强冷';
}

export function preset(mode: CoolingMode): CurvePoint[] {
  const duties =
    mode === '静音'
      ? [30, 30, 45, 70, 100]
      : mode === '强冷'
        ? [45, 55, 70, 90, 100]
        : [30, 40, 55, 75, 100];
  return [30, 45, 60, 75, 85].map((Temperature, i) => ({ Temperature, Duty: duties[i] ?? 100 }));
}
export function dateValue(value: string): number {
  const ms = /\/Date\((-?\d+)/.exec(value);
  return ms ? Number(ms[1]) : Date.parse(value);
}
export function readTemperature(frame: Frame | undefined, group: 'CPU' | 'GPU'): number | null {
  if (!frame) return null;
  const available = frame.Sensors.filter(
    (s) =>
      s.Kind === 'Temperature' &&
      s.Group === group &&
      s.Value !== null &&
      s.Value > 0 &&
      s.Value <= 150 &&
      Number.isFinite(s.Value) &&
      dateValue(frame.Time) - dateValue(s.Time) <= 3000 &&
      dateValue(frame.Time) - dateValue(s.Time) >= -1000,
  );
  const core =
    group === 'GPU'
      ? available.filter((s) => !/hotspot|hot spot|热点|junction|memory|vram/i.test(s.Name))
      : available;
  const values = (core.length ? core : available).flatMap((s) =>
    s.Value === null ? [] : [s.Value],
  );
  return values.length ? Math.max(...values) : null;
}
export function readSourceTemperature(frame: Frame, source: string): number | null {
  if (source === 'group/cpu') return readTemperature(frame, 'CPU');
  if (source === 'group/gpu') return readTemperature(frame, 'GPU');
  if (source === 'group/mix') {
    const cpu = readTemperature(frame, 'CPU'),
      gpu = readTemperature(frame, 'GPU');
    return cpu !== null && gpu !== null ? Math.max(cpu, gpu) : null;
  }
  const sensor = frame.Sensors.find((item) => item.Id === source && item.Kind === 'Temperature');
  if (
    !sensor ||
    sensor.Value === null ||
    sensor.Value <= 0 ||
    sensor.Value > 150 ||
    !Number.isFinite(sensor.Value) ||
    dateValue(frame.Time) - dateValue(sensor.Time) > 3000 ||
    dateValue(frame.Time) - dateValue(sensor.Time) < -1000
  )
    return null;
  return sensor.Value;
}
export function evaluateProfile(profile: FanProfile, temperature: number): number {
  if (profile.Mode === 1) return Math.max(profile.Minimum, profile.Manual);
  const first = profile.Points[0],
    last = profile.Points.at(-1);
  if (!first || !last) return 100;
  if (temperature <= first.Temperature) return Math.max(profile.Minimum, first.Duty);
  for (let i = 1; i < profile.Points.length; i++) {
    const point = profile.Points[i],
      previous = profile.Points[i - 1];
    if (point && previous && temperature <= point.Temperature)
      return Math.max(
        profile.Minimum,
        previous.Duty +
          ((point.Duty - previous.Duty) * (temperature - previous.Temperature)) /
            (point.Temperature - previous.Temperature),
      );
  }
  return Math.max(profile.Minimum, last.Duty);
}
export function profileFor(channel: Channel, snapshot: Snapshot): FanProfile {
  const saved =
    channel.Owned && channel.ActiveProfile
      ? channel.ActiveProfile
      : snapshot.Profiles.find((p) => p.Id === channel.Id);
  if (saved)
    return {
      ...structuredClone(saved),
      RiseSeconds: saved.RiseSeconds ?? 0,
      FallSeconds: saved.FallSeconds ?? 0,
    };
  return {
    Id: channel.Id,
    Name: channel.Name,
    Mode: 2,
    Source:
      snapshot.Recommendations.find((r) => r.Id === channel.Id)?.Source ??
      (channel.Group === 'GPU' ? 'group/gpu' : 'group/cpu'),
    RpmId: channel.DefaultRpmId,
    Minimum: 30,
    Manual: 50,
    Points: preset('均衡'),
  };
}
export function rpmFor(channel: Channel, snapshot: Snapshot): number | null {
  const profile =
    channel.Owned && channel.ActiveProfile
      ? channel.ActiveProfile
      : snapshot.Profiles.find((p) => p.Id === channel.Id);
  const id = profile?.RpmId ?? channel.DefaultRpmId;
  const sensor = snapshot.Snapshot.Sensors.find((s) => s.Id === id && s.Kind === 'Fan');
  if (
    !sensor ||
    dateValue(snapshot.Snapshot.Time) - dateValue(sensor.Time) > 3000 ||
    dateValue(snapshot.Snapshot.Time) - dateValue(sensor.Time) < -1000
  )
    return null;
  return sensor.Value;
}
export function validateProfile(profile: FanProfile): string | null {
  if (profile.Role != null && !['CPU', 'GPU', 'Case', 'Pump', 'Unknown'].includes(profile.Role))
    return '请选择有效的风扇用途';
  if (
    profile.RiseSeconds != null &&
    (!Number.isFinite(profile.RiseSeconds) || profile.RiseSeconds < 0 || profile.RiseSeconds > 30)
  )
    return '请将升温平滑设为 0–30 秒';
  if (
    profile.FallSeconds != null &&
    (!Number.isFinite(profile.FallSeconds) || profile.FallSeconds < 0 || profile.FallSeconds > 120)
  )
    return '请将降温平滑设为 0–120 秒';
  if (!Number.isFinite(profile.Minimum) || profile.Minimum < 20 || profile.Minimum > 100)
    return '请将最低输出设为 20–100%';
  if (![0, 1, 2].includes(profile.Mode)) return '控制方式无效，请重新选择';
  if (!Number.isFinite(profile.Manual) || profile.Manual < 0 || profile.Manual > 100)
    return '请将固定输出设为 0–100%';
  if (profile.Mode !== 2) return null;
  if (profile.Points.length < 2 || profile.Points.length > 12) return '曲线需包含 2–12 个节点';
  for (let i = 0; i < profile.Points.length; i++) {
    const p = profile.Points[i];
    if (
      !p ||
      !Number.isFinite(p.Temperature) ||
      !Number.isFinite(p.Duty) ||
      p.Temperature < 20 ||
      p.Temperature > 110 ||
      p.Duty < 0 ||
      p.Duty > 100
    )
      return '请将节点温度设为 20–110°C，输出设为 0–100%';
    const previous = profile.Points[i - 1];
    if (previous && (p.Temperature <= previous.Temperature || p.Duty < previous.Duty))
      return '后一节点的温度须更高，输出不能低于前一节点';
  }
  if (!profile.Source) return '请选择温度来源';
  return null;
}

export function channelName(channel: Channel, snapshot: Snapshot) {
  return (
    (channel.Owned ? channel.ActiveProfile?.Name : undefined) ||
    snapshot.Profiles.find((profile) => profile.Id === channel.Id)?.Name ||
    channel.Name
  );
}

export function gpuName(frame: Frame) {
  return frame.Sensors.find((sensor) => sensor.Group === 'GPU')?.Device ?? frame.Gpu;
}

export function summarizeFans(snapshot: Snapshot) {
  const frame = snapshot.Snapshot;
  return {
    active: frame.Channels.filter((channel) => channel.Owned).length,
    eligible: snapshot.Recommendations.filter((item) => item.Eligible).length,
    needsSetup: !frame.Demo && (!frame.Administrator || !frame.PawnIoInstalled),
    abnormal: frame.Channels.filter((channel) => channel.Error || channel.Status.includes('保护')),
  };
}
