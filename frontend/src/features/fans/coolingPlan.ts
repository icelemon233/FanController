import {
  type Channel,
  type FanProfile,
  type FanRole,
  profileFor,
  readSourceTemperature,
  readTemperature,
  type Snapshot,
  validateProfile,
} from './model.ts';

export interface PlanEntry {
  profile: FanProfile;
  included: boolean;
}

export const roleLabels: Record<FanRole, string> = {
  CPU: 'CPU 散热风扇',
  Case: '机箱风扇',
  GPU: '显卡风扇',
  Pump: '水泵',
  Unknown: '待确认用途',
};

export function roleFor(channel: Channel, snapshot: Snapshot): FanRole {
  if (channel.Group === 'GPU') return 'GPU';
  if (/pump|水泵/i.test(channel.Name)) return 'Pump';
  if (channel.Owned && channel.ActiveProfile?.Role) return channel.ActiveProfile.Role;
  return snapshot.Recommendations.find((item) => item.Id === channel.Id)?.Role ?? 'Unknown';
}

// These are editable starting curves, not manufacturer-certified settings or RPM targets.
export function quietProfile(
  channel: Channel,
  snapshot: Snapshot,
  role = roleFor(channel, snapshot),
): FanProfile {
  const profile = profileFor(channel, snapshot);
  const temperatures =
    role === 'GPU'
      ? [30, 50, 60, 70, 80]
      : role === 'CPU'
        ? [30, 50, 65, 75, 85]
        : [30, 55, 65, 75, 85];
  const duties =
    role === 'GPU'
      ? [35, 35, 45, 65, 100]
      : role === 'CPU'
        ? [40, 40, 55, 75, 100]
        : [30, 30, 45, 65, 100];
  return {
    ...profile,
    Role: role,
    Mode: 2,
    Excluded: false,
    Source:
      role === 'GPU'
        ? 'group/gpu'
        : role === 'Case' && readTemperature(snapshot.Snapshot, 'GPU') !== null
          ? 'group/mix'
          : 'group/cpu',
    RiseSeconds: role === 'CPU' ? 3 : role === 'GPU' ? 2 : 5,
    FallSeconds: role === 'CPU' ? 20 : role === 'GPU' ? 15 : 30,
    Points: temperatures.map((Temperature, index) => ({ Temperature, Duty: duties[index] ?? 100 })),
  };
}

export function createPlanDraft(snapshot: Snapshot): PlanEntry[] {
  return snapshot.Snapshot.Channels.map((channel) => {
    const role = roleFor(channel, snapshot);
    const saved =
      channel.Owned && channel.ActiveProfile
        ? channel.ActiveProfile
        : snapshot.Profiles.find((item) => item.Id === channel.Id);
    const profile =
      saved && saved.Mode !== 0
        ? {
            ...structuredClone(saved),
            Role: role,
            RiseSeconds: saved.RiseSeconds ?? 0,
            FallSeconds: saved.FallSeconds ?? 0,
          }
        : quietProfile(channel, snapshot, role);
    const known = role === 'CPU' || role === 'Case' || role === 'GPU';
    return {
      profile,
      included:
        known &&
        !saved?.Excluded &&
        (channel.Owned ||
          (role !== 'GPU' && !channel.Error && readTemperature(snapshot.Snapshot, 'CPU') !== null)),
    };
  });
}

export function sourceLabel(source: string, snapshot: Snapshot): string {
  if (source === 'group/cpu') return 'CPU 最高温度';
  if (source === 'group/gpu') return 'GPU 温度（优先核心）';
  if (source === 'group/mix') return 'CPU / GPU 较高温度';
  const sensor = snapshot.Snapshot.Sensors.find((item) => item.Id === source);
  return sensor ? `${sensor.Device} · ${sensor.Name}` : '温度来源已失效';
}

export function curveLabel(profile: FanProfile): string {
  if (profile.Mode === 0) return '恢复原设置';
  if (profile.Mode === 1) return `固定输出 ${Math.max(profile.Minimum, profile.Manual)}%`;
  return profile.Points.map(
    (point) => `${point.Temperature}°C → ${Math.max(profile.Minimum, point.Duty)}%`,
  ).join(' · ');
}

export function planProfiles(entries: PlanEntry[]): FanProfile[] {
  return entries.map(({ profile, included }) => ({
    ...structuredClone(profile),
    Mode: included ? profile.Mode : 0,
    Excluded: !included,
  }));
}

export function planError(entries: PlanEntry[], snapshot: Snapshot): string | null {
  if (!entries.length) return '未检测到可配置的风扇';
  if (
    entries.length > 64 ||
    new Set(entries.map((entry) => entry.profile.Id)).size !== entries.length
  )
    return '通道数量过多或存在重复，请重新检测';
  for (const entry of entries) {
    const channel = snapshot.Snapshot.Channels.find((item) => item.Id === entry.profile.Id);
    if (!channel) return '风扇通道已变化，请关闭后重新配置方案';
    const profile = {
      ...entry.profile,
      Mode: entry.included ? entry.profile.Mode : 0,
    } as FanProfile;
    const invalid = validateProfile(profile);
    if (invalid) return `${profile.Name}：${invalid}`;
    if (!entry.included || profile.Mode === 0) continue;
    if (
      !profile.Role ||
      profile.Role === 'Unknown' ||
      profile.Role === 'Pump' ||
      /pump|水泵/i.test(channel.Name)
    )
      return `${profile.Name}：请先确认风扇用途，水泵保留原设置`;
    if (channel.Error) return `${profile.Name}：存在控制异常，请先恢复原设置`;
    if (readTemperature(snapshot.Snapshot, channel.Group === 'GPU' ? 'GPU' : 'CPU') === null)
      return `${profile.Name}：缺少必要温度`;
    if (profile.Mode === 2 && readSourceTemperature(snapshot.Snapshot, profile.Source) === null)
      return `${profile.Name}：所选温度来源不可用`;
  }
  return null;
}
