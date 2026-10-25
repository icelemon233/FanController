import assert from 'node:assert/strict';
import test from 'node:test';
import { createSidebarState } from '../src/components/sidebarState.ts';
import type { Scheduler } from '../src/platform/scheduler.ts';

function clock() {
  let time = 0;
  let next = 0;
  const pending = new Map<number, { at: number; run: () => void }>();
  const scheduler: Scheduler = {
    now: () => time,
    after(run, delay) {
      const id = ++next;
      pending.set(id, { at: time + delay, run });
      return id;
    },
    cancel: (id) => {
      pending.delete(id as number);
    },
  };
  return {
    scheduler,
    tick(delta: number) {
      time += delta;
      for (const [id, task] of pending) {
        if (task.at <= time) {
          pending.delete(id);
          task.run();
        }
      }
    },
  };
}

test('unpinned navigation waits for pointer exit, cancels stale hides and never changes pin choice', () => {
  const time = clock();
  const nav = createSidebarState(false, false, 150, time.scheduler);
  nav.hold('pointer', true);
  assert.equal(nav.getSnapshot().expanded, true);
  nav.hold('pointer', false);
  time.tick(149);
  assert.equal(nav.getSnapshot().expanded, true);
  nav.hold('pointer', true);
  time.tick(1);
  assert.equal(nav.getSnapshot().expanded, true);
  nav.hold('pointer', false);
  time.tick(150);
  assert.deepEqual(nav.getSnapshot(), { pinned: false, narrow: false, expanded: false });
});

test('keyboard focus, open menus and active drags each keep the overlay until their own release', () => {
  const time = clock();
  const nav = createSidebarState(false, false, 150, time.scheduler);
  for (const hold of ['keyboard', 'menu', 'drag'] as const) {
    nav.hold(hold, true);
    nav.hold('pointer', true);
    nav.hold('pointer', false);
    time.tick(500);
    assert.equal(nav.getSnapshot().expanded, true);
    nav.hold(hold, false);
    time.tick(150);
    assert.equal(nav.getSnapshot().expanded, false);
  }
});

test('unrelated repeated key observations outside navigation do not postpone an existing hide', () => {
  const time = clock();
  const nav = createSidebarState(false, false, 150, time.scheduler);
  nav.hold('pointer', true);
  nav.hold('pointer', false);
  time.tick(100);
  nav.hold('keyboard', false);
  time.tick(50);
  assert.equal(nav.getSnapshot().expanded, false);
});

test('unpinning retains the current pointer hold while a mouse focus reset permits collapse', () => {
  const time = clock();
  const nav = createSidebarState(true, false, 150, time.scheduler);
  nav.hold('pointer', true);
  nav.hold('keyboard', true);
  nav.setPinned(false);
  nav.hold('keyboard', false);
  assert.equal(nav.getSnapshot().expanded, true);
  nav.hold('pointer', false);
  time.tick(150);
  assert.equal(nav.getSnapshot().expanded, false);
  nav.setPinned(true);
  time.tick(500);
  assert.equal(nav.getSnapshot().expanded, true);
});

test('narrow navigation uses its drawer without overwriting the desktop pin preference', () => {
  const time = clock();
  const nav = createSidebarState(true, false, 150, time.scheduler);
  nav.setNarrow(true);
  nav.hold('pointer', true);
  assert.deepEqual(nav.getSnapshot(), { pinned: true, narrow: true, expanded: false });
  nav.setNarrow(false);
  assert.equal(nav.getSnapshot().expanded, true);
  nav.dispose();
  time.tick(500);
});
