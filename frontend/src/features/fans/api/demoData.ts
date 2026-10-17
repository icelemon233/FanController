import type { Snapshot } from '../model.ts';

export function createDemoSnapshot(time = new Date().toISOString()): Snapshot {
  const frame: Snapshot = {
    Type: 'snapshot',
    Snapshot: {
      Demo: true,
      Administrator: true,
      PawnIoInstalled: true,
      Time: time,
      Board: 'Demo Motherboard',
      Cpu: 'Demo CPU',
      Gpu: 'Demo GPU',
      Notices: [],
      Channels: [],
      Sensors: [],
    },
    Profiles: [],
    Recommendations: [],
  };
  for (const item of [
    { Id: 'cpu', Name: 'CPU 核心', Group: 'CPU', Device: 'Demo CPU', Value: 48 },
    { Id: 'gpu', Name: 'GPU 核心', Group: 'GPU', Device: 'Demo GPU', Value: 54 },
    { Id: 'hotspot', Name: 'GPU 热点', Group: 'GPU', Device: 'Demo GPU', Value: 65 },
  ])
    frame.Snapshot.Sensors.push({ ...item, Kind: 'Temperature', Time: time });
  const names = ['CPU 散热风扇', '机箱进风', '机箱排风', '显卡风扇'];
  const rpms = [1120, 820, 940, 1510];
  names.forEach((Name, index) => {
    const Id = `demo/${index}`,
      Group = index === 3 ? 'GPU' : '主板';
    const Device = index === 3 ? 'Demo GPU' : 'Demo Motherboard';
    frame.Snapshot.Channels.push({
      Id,
      Name,
      Group,
      Device,
      DefaultRpmId: `${Id}/rpm`,
      Status: '未接管',
      Mode: 0,
      Target: null,
      Owned: false,
      Error: null,
    });
    frame.Snapshot.Sensors.push({
      Id: `${Id}/rpm`,
      Name,
      Group,
      Device,
      Kind: 'Fan',
      Value: rpms[index] ?? null,
      Time: time,
    });
    frame.Recommendations.push({
      Id,
      Role: index === 3 ? 'GPU' : index === 0 ? 'CPU' : 'Case',
      Source: index === 3 ? 'group/gpu' : index === 0 ? 'group/cpu' : 'group/mix',
      SourceLabel:
        index === 3
          ? 'GPU 温度（优先核心）'
          : index === 0
            ? 'CPU 最高温度'
            : 'CPU 与 GPU 的较高温度',
      Eligible: index !== 3,
      Reason: index === 3 ? '建议保留显卡原设置，支持时可在低负载停转' : null,
    });
  });
  return frame;
}
