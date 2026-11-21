import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR_STEPS, STEP_SECONDS, barBoundary, bounceHeight, PHRASE, arrange, updateQueue } from '../../src/music.ts';
import { chordRoots, loopScore, loopVoice, nativePart, signatureSteps } from '../../src/loop-score.ts';
import type { Change, Role } from '../../src/music.ts';
import { horseCallSteps } from '../../src/horse.ts';

test('the next unscheduled bar lands on the 96 BPM grid', () => {
  assert.deepEqual([0, 1, 15, 16, 17, 32].map(barBoundary), [0, 16, 16, 16, 32, 32]);
  assert.equal(BAR_STEPS * STEP_SECONDS, 2.5);
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

test('four bells own four different stems and keep the existing hook when possible', () => {
  const bells = Array.from({ length: 4 }, (_, i) => ({ id: String(i), role: 'bell' as const, nativePart: 'hook' as const }));
  const solo = arrange(bells.slice(0, 1));
  assert.equal(solo.get('0'), 'hook');
  const duet = arrange(bells.slice(0, 2), solo);
  assert.equal(duet.get('0'), 'hook');
  assert.equal(duet.get('1'), 'pulse');
  const band = arrange(bells, duet);
  assert.equal(new Set(band.values()).size, 4);
  assert.equal(arrange([...bells].reverse(), band).get('0'), 'hook');
});

test('the bass follows the four chord roots and long recordings get space between entrances', () => {
  assert.equal(PHRASE, chordRoots.length * BAR_STEPS);
  const accents = signatureSteps(loopScore.bell, 1.5);
  for (const [bar, root] of chordRoots.entries()) {
    const start = bar * BAR_STEPS;
    assert.equal(loopScore.drum.find(([step]) => step === start)?.[2], root);
    assert.equal([...accents].filter(step => step >= start && step < start + BAR_STEPS).length, 1);
  }
  assert.deepEqual([...signatureSteps(loopScore.keys, .12)], loopScore.keys.map(([step]) => step));
});

test('bundled instruments keep their sounds and a similar drawing or personal recording gets its own accent', () => {
  const keys = { id: 'keys', role: 'shaker' as const, nativePart: nativePart({ name: 'Keys', kind: 'keys' }) };
  const cup = { id: 'cup', role: 'cup' as const, nativePart: nativePart({ name: 'Cup', kind: 'cup' }) };
  const car = { id: 'car', role: 'kick' as const, nativePart: nativePart({ name: 'Car', kind: 'drum' }) };
  assert.equal(car.nativePart, undefined);
  assert.equal(nativePart({ name: 'Bell' }), undefined);
  assert.deepEqual(arrange([cup, keys]), new Map([['keys', 'motion'], ['cup', 'backbeat']]));
  assert.equal(arrange([car, keys, cup]).get('car'), 'pulse');
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

test('bounces land on the recorded accents including the entrance and wrap', () => {
  for (const events of Object.values(loopScore)) {
    for (const [step] of events) {
      assert.equal(bounceHeight(events, step + PHRASE, 0), 0);
    }
    assert.equal(bounceHeight(events, -4, 0), 1);
  }
  assert.equal(bounceHeight(loopScore.keys, 17, 16), .75);
  assert.equal(bounceHeight(loopScore.keys, 20, 16), 1);
});

test('horses leave room for the band and take turns through the loop boundary', () => {
  assert.deepEqual([...horseCallSteps(loopScore.bell, 0, 1, 1)], [0, 18, 32, 50]);
  assert.deepEqual([...horseCallSteps(loopScore.bell, 0, 1, 4)], [0, 32]);
  for (const count of [2, 3, 4]) {
    const players = Array.from({ length: count }, (_, i) => ({ id: String(i), role: 'melody' as const }));
    const parts = arrange(players);
    const calls = [...parts.values()].flatMap((part, i) => {
      const events = loopScore[loopVoice[part]];
      const turns = [...horseCallSteps(events, i, count, count)];
      assert.ok(turns.length > 0 && turns.length < events.length);
      return turns;
    }).sort((a, b) => a - b);
    assert.deepEqual(calls.map(step => Math.floor(step / BAR_STEPS)), [0, 1, 2, 3]);
    calls.forEach((step, i) => {
      const next = calls[i + 1] ?? calls[0] + PHRASE;
      assert.ok((next - step) * STEP_SECONDS >= 1.7);
    });
  }
});
