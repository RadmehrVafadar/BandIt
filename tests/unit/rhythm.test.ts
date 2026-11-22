import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAR_STEPS, STEP_SECONDS, bounceHeight } from '../../src/music.ts';
import { RhythmTake } from '../../src/rhythm.ts';

test('the first strike opens exactly one bar and replay snaps each distinct hit to the grid', () => {
  const take = new RhythmTake('cup');
  assert.equal(take.finished(1000), false);
  const start = 1010;
  for (const step of [0, .3, 3.51, 4.1, 14.9, 15.95]) {
    assert.equal(take.addHit(start + step * STEP_SECONDS), true);
  }
  assert.equal(take.startedAt, start);
  assert.deepEqual(take.hits, [[0, 1], [4, 1], [15, 1]]);
  assert.equal(take.addHit(start + BAR_STEPS * STEP_SECONDS), false);
  assert.equal(take.finished(start + BAR_STEPS * STEP_SECONDS), true);
  for (const step of [0, 4, 15]) assert.equal(bounceHeight(take.hits, BAR_STEPS + step, 0, BAR_STEPS), 0);
});
