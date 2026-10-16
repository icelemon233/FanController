import type { CoolingMode, FanProfile, Reply, Snapshot } from '../model.ts';

export type FanCommand =
  | { Action: 'ready' }
  | { Action: 'release' | 'rescan' | 'enableMotherboard' }
  | { Action: 'smart'; Mode: CoolingMode }
  | { Action: 'apply'; Profile: FanProfile };

export type FanEvent =
  | Snapshot
  | { Type: 'notice'; Message: string; Success: boolean }
  | { Type: 'protocol-error'; Message: string };

export interface FanGateway {
  subscribe(listener: (event: FanEvent) => void): () => void;
  request(command: FanCommand): Promise<Reply>;
  dispose(): void;
}
