import { type Scheduler, systemScheduler } from '../platform/scheduler.ts';

type Hold = 'pointer' | 'keyboard' | 'menu' | 'drag';

export function createSidebarState(
  pinned: boolean,
  narrow: boolean,
  delay: number,
  scheduler: Scheduler = systemScheduler,
) {
  const holds = new Set<Hold>();
  const listeners = new Set<() => void>();
  let timer: unknown;
  let transient = false;
  let snapshot = { pinned, narrow, expanded: pinned && !narrow };
  const publish = () => {
    const expanded = !narrow && (pinned || transient);
    if (snapshot.pinned === pinned && snapshot.narrow === narrow && snapshot.expanded === expanded)
      return;
    snapshot = { pinned, narrow, expanded };
    for (const listener of listeners) listener();
  };
  const cancel = () => {
    if (timer !== undefined) scheduler.cancel(timer);
    timer = undefined;
  };
  const reconcile = () => {
    cancel();
    if (narrow || pinned) {
      transient = false;
      publish();
    } else if (holds.size) {
      transient = true;
      publish();
    } else {
      publish();
      timer = scheduler.after(() => {
        timer = undefined;
        transient = false;
        publish();
      }, delay);
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPinned(value: boolean) {
      pinned = value;
      reconcile();
    },
    setNarrow(value: boolean) {
      narrow = value;
      reconcile();
    },
    hold(reason: Hold, value: boolean) {
      if (holds.has(reason) === value) return;
      if (value) holds.add(reason);
      else holds.delete(reason);
      reconcile();
    },
    dispose() {
      cancel();
      holds.clear();
      listeners.clear();
    },
  };
}
