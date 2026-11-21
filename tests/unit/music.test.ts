import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR_STEPS, STEP_SECONDS, barBoundary, bounceHeight, PHRASE, arrange, phrase, score, updateQueue } from '../../src/music.ts';
import type { Change, Role } from '../../src/music.ts';
import { horseCallSteps } from '../../src/horse.ts';

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
});

test('the bass and hook outline the same four chords through the turnaround', () => {
  const chords = [[0, 3, 7], [8, 0, 3], [3, 7, 10], [7, 10, 2]];
  assert.equal(PHRASE, chords.length * BAR_STEPS);
  for (const [bar, chord] of chords.entries()) {
    const start = bar * BAR_STEPS;
    const bass = score.pulse.find(([step]) => step === start);
    assert.ok(bass);
    assert.equal(((bass[2] ?? 0) + 12) % 12, chord[0]);
    const melody = score.hook.filter(([step]) => step >= start && step < start + BAR_STEPS);
    assert.ok(melody.length >= 2);
    for (const [, , note] of melody) assert.ok(chord.includes((note! + 12) % 12));
  }
});

test('a single object lands on each downbeat, including after the band drops out', () => {
  for (const part of Object.keys(score) as (keyof typeof score)[]) {
    const events = phrase(part, true);
    const steps = events.map(([step]) => step);
    assert.deepEqual(steps, [...new Set(steps)].sort((a, b) => a - b));
    for (let downbeat = 0; downbeat < PHRASE; downbeat += BAR_STEPS) {
      assert.ok(steps.includes(downbeat), part + ' missing downbeat ' + downbeat);
      assert.equal(bounceHeight(events, downbeat, downbeat), 0);
    }
  }
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

test('solo and ensemble bounces follow the phrase including entrance and wrap', () => {
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

test('horses leave room for the band and take turns through the loop boundary', () => {
  const solo = phrase('hook', true);
  assert.deepEqual([...horseCallSteps(solo, 0, 1, 1)], [0, 16, 32, 48]);
  assert.deepEqual([...horseCallSteps(score.hook, 0, 1, 4)], [3, 35]);
  for (const count of [2, 3, 4]) {
    const players = Array.from({ length: count }, (_, i) => ({ id: String(i), role: 'melody' as const }));
    const parts = arrange(players);
    const calls = [...parts.values()].flatMap((part, i) => {
      const turns = [...horseCallSteps(score[part], i, count, count)];
      assert.ok(turns.length > 0 && turns.length < score[part].length);
      return turns;
    }).sort((a, b) => a - b);
    assert.deepEqual(calls.map(step => Math.floor(step / BAR_STEPS)), [0, 1, 2, 3]);
    calls.forEach((step, i) => {
      const next = calls[i + 1] ?? calls[0] + PHRASE;
      assert.ok((next - step) * STEP_SECONDS >= 1.7);
    });
  }
});
