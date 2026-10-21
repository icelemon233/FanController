import type { CoolingMode, FanProfile, Reply, Snapshot } from '../model.ts';

export type FanCommand =
  | { Action: 'ready' | 'reconnect' }
  | { Action: 'release' | 'rescan' | 'enableMotherboard' }
  | { Action: 'smart'; Mode: CoolingMode }
  | { Action: 'plan'; Profiles: FanProfile[] }
  | { Action: 'apply'; Profile: FanProfile };

export type FanEvent =
  | Snapshot
  | { Type: 'notice'; Message: string; Success: boolean }
  | { Type: 'service-error'; Message: string }
  | { Type: 'protocol-error'; Message: string };

export interface FanGateway {
  subscribe(listener: (event: FanEvent) => void): () => void;
  request(command: FanCommand): Promise<Reply>;
  dispose(): void;
}
