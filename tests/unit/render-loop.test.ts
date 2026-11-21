import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOOP_SECONDS, loopVoice } from '../../src/loop-score.ts';
import { objectSample } from '../../src/objects.ts';
import { renderLoop } from '../../src/render-loop.ts';

test('all four fallback stems are audible ten-second loops with headroom in the full mix', () => {
  const mix = new Float32Array(24000 * LOOP_SECONDS);
  for (const name of Object.values(loopVoice)) {
    const { samples, rate } = renderLoop(name, objectSample(name));
    assert.equal(samples.length / rate, 10);
    assert.ok(samples.some(sample => Math.abs(sample) > .05), name);
    assert.ok(Math.abs(samples[0] - samples.at(-1)!) < .02, name + ' loop seam');
    samples.forEach((value, index) => { mix[index] += value / 1.24; });
  }
  const peak = mix.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  assert.ok(peak > .2 && peak < 1, 'peak ' + peak);
});
