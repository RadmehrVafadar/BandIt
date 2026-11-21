import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR_STEPS, STEP_SECONDS, barBoundary, bounceHeight, PHRASE, arrange, phrase, score, updateQueue } from '../../src/music.ts';
import type { Change, Role } from '../../src/music.ts';

test('the next unscheduled bar lands on the 100 BPM grid', () => {
  assert.deepEqual([0, 1, 15, 16, 17, 32].map(barBoundary), [0, 16, 16, 16, 32, 32]);
  assert.equal(BAR_STEPS * STEP_SECONDS, 2.4);
});

test('cancel a join or removal by keeping the current slot assignment', () => {
  const slots = ['mug', null];
  const pending = new Map<number, Change>();
  updateQueue(slots, pending, 1, 'keys', 9);
  updateQueue(slots, pending, 0, null, 9);
  assert.deepEqual([...pending], [[1, { id: 'keys', at: 16 }], [0, { id: null, at: 16 }]]);
  updateQueue(slots, pending, 1, null, 10);
  updateQueue(slots, pending, 0, 'mug', 10);
  assert.equal(pending.size, 0);
});

test('the bell quartet interlocks and its hook answers in C minor', () => {
  const bells = Array.from({ length: 4 }, (_, i) => ({ id: String(i), role: 'bell' as const }));
  const solo = arrange(bells.slice(0, 1));
  assert.equal(solo.get('0'), 'hook');
  const duet = arrange(bells.slice(0, 2), solo);
  assert.equal(duet.get('0'), 'hook');
  assert.equal(duet.get('1'), 'pulse');
  const band = arrange(bells, duet);
  assert.equal(new Set(band.values()).size, 4);
  assert.deepEqual(arrange(bells.slice(1), band).get('1'), 'pulse');
  const steps = Object.values(score).flatMap(events => events.map(([step]) => step));
  assert.equal(new Set(steps).size, steps.length);
  assert.deepEqual(new Set(score.hook.map(([, , note]) => note)), new Set([0, 3, 7]));
});

test('every combination of source roles has unique parts and an ensemble pulse', () => {
  const roles: Role[] = ['kick', 'snare', 'shaker', 'melody', 'bell', 'cup'];
  function check(lineup: Role[]) {
    const parts = arrange(lineup.map((role, i) => ({ id: String(i), role })));
    assert.equal(new Set(parts.values()).size, lineup.length);
    if (lineup.length > 1) assert.ok([...parts.values()].includes('pulse'));
    if (lineup.length < 4) for (const role of roles) check([...lineup, role]);
  }
  check([]);
});

test('solo and ensemble bounces follow both bars including entrance and wrap', () => {
  for (const part of Object.keys(score) as (keyof typeof score)[]) {
    for (const solo of [false, true]) {
      const events = phrase(part, solo);
      if (solo) assert.equal(events[0][0], 0);
      for (const [step] of events) {
        assert.equal(bounceHeight(events, step + PHRASE, 0), 0);
      }
      assert.equal(bounceHeight(events, -4, 0), 1);
    }
  }
  assert.equal(bounceHeight(score.motion, 17, 16), .75);
  assert.equal(bounceHeight(score.motion, 20, 16), 1);
});