import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR_STEPS, STEP_SECONDS, barBoundary, cleanSample, patterns, updateQueue } from '../../src/music.ts';
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
  assert.equal(new Set(beats.map(steps => steps.join(','))).size, 4);
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

test('sample cleaning trims both ends, normalizes, and fades to silence', () => {
  const raw = new Float32Array(1000);
  raw.fill(0.4, 300, 500);
  const cleaned = cleanSample([raw], 1000);
  assert.ok(cleaned);
  assert.equal(cleaned.samples.length, 216);
  assert.equal(cleaned.samples[0], 0);
  assert.equal(cleaned.samples.at(-1), 0);
  assert.ok(Math.abs(Math.max(...cleaned.samples) - 0.88) < 0.0001);
});

test('silent and very quiet takes return no sample', () => {
  assert.equal(cleanSample([new Float32Array(480)], 48000), null);
  assert.equal(cleanSample([new Float32Array(480).fill(0.008)], 48000), null);
});
