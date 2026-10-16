export interface Scheduler {
  now(): number;
  after(callback: () => void, milliseconds: number): unknown;
  cancel(handle: unknown): void;
}

export const systemScheduler: Scheduler = {
  now: Date.now,
  after: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
