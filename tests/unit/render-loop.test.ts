import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAccompaniment } from '../../src/accompaniment.ts';
import { LOOP_SECONDS, loopVoice } from '../../src/loop-score.ts';
import { BAR_STEPS, STEP_SECONDS } from '../../src/music.ts';
import { objectSample } from '../../src/objects.ts';
import { renderLoop } from '../../src/render-loop.ts';

test('the bass leaves the downbeat open and the strings swell only in the back half', () => {
  const bars = renderAccompaniment();
  assert.deepEqual(bars.map(bar => [Boolean(bar.bass), Boolean(bar.strings)]),
    [[false, false], [true, false], [true, true], [true, true]]);
  for (const { bass, strings } of bars) {
    for (const part of [bass, strings]) {
      if (!part) continue;
      const { samples, rate } = part;
      assert.equal(samples.length / rate, BAR_STEPS * STEP_SECONDS);
      assert.ok(samples.subarray(0, Math.round(rate * STEP_SECONDS)).every(value => value === 0));
      assert.equal(samples.at(-1), 0);
      const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      assert.ok(peak > .01 && peak < (part === bass ? .2 : .08), 'backing peak ' + peak);
    }
  }
});

test('all four fallback stems are audible ten-second loops with headroom over the accompaniment', () => {
  const mix = new Float32Array(24000 * LOOP_SECONDS);
  for (const name of Object.values(loopVoice)) {
    const { samples, rate } = renderLoop(name, objectSample(name));
    assert.equal(samples.length / rate, 10);
    assert.ok(samples.some(sample => Math.abs(sample) > .05), name);
    assert.ok(Math.abs(samples[0] - samples.at(-1)!) < .02, name + ' loop seam');
    samples.forEach((value, index) => { mix[index] += value / 1.24; });
  }
  for (const [bar, { bass, strings }] of renderAccompaniment().entries()) {
    for (const part of [bass, strings]) {
      if (!part) continue;
      const start = bar * part.samples.length;
      part.samples.forEach((value, index) => { mix[start + index] += value / 1.24; });
    }
  }
  const peak = mix.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  assert.ok(peak > .2 && peak < 1, 'peak ' + peak);
});
