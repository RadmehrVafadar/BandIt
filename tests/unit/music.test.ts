import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR_STEPS, STEP_SECONDS, barBoundary, bounceHeight, patterns, updateQueue } from '../../src/music.ts';
import type { Change } from '../../src/music.ts';

test('the next unscheduled bar lands on the 100 BPM grid', () => {
  assert.deepEqual([0, 1, 15, 16, 17, 32].map(barBoundary), [0, 16, 16, 16, 32, 32]);
  assert.equal(BAR_STEPS * STEP_SECONDS, 2.4);
});

test('roles have distinct, ordered rhythms and melody changes pitch', () => {
  const beats = Object.values(patterns).map(pattern => pattern.map(([step, level], index) => {
    assert.ok(step >= 0 && step < BAR_STEPS);
    assert.ok(level > 0 && level <= 1);
    if (index > 0) assert.ok(step > pattern[index - 1][0]);
    return step;
  }));
  assert.equal(new Set(beats.map(steps => steps.join(','))).size, 6);
  assert.ok(new Set(patterns.melody.map(([, , pitch]) => pitch)).size >= 3);
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

test('bounce reaches the floor at each hit and returns to its original height between hits', () => {
  assert.equal(bounceHeight('shaker', 14, 16), 1);
  assert.equal(bounceHeight('shaker', 17, 16), 0.75);
  assert.equal(bounceHeight('shaker', 18, 16), 0);
  assert.equal(bounceHeight('shaker', 19, 16), 1);
  assert.equal(bounceHeight('shaker', 20, 16), 0);
  assert.equal(bounceHeight('shaker', 32, 16), 1);
  assert.equal(bounceHeight('shaker', 34, 16), 0);
  assert.equal(bounceHeight('kick', 16, 16), 0);
  assert.equal(bounceHeight('melody', 3, 4), 1);
});
