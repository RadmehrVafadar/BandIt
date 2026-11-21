import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderAccompaniment } from '../../src/accompaniment.ts';
import { LOOP_SECONDS, loopVoice } from '../../src/loop-score.ts';
import type { LoopName } from '../../src/loop-score.ts';
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

function bundledLoop(name: LoopName) {
  const wav = readFileSync(new URL('../../public/loops/' + name + '.wav', import.meta.url));
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  return {
    rate: wav.readUInt32LE(24),
    samples: Float32Array.from({ length: wav.readUInt32LE(40) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2) / 32768),
  };
}

function fallbackLoop(name: LoopName) {
  return renderLoop(name, objectSample(name));
}

test('any combination of bundled, fallback and muted stems loops cleanly with headroom', () => {
  const stems = Object.values(loopVoice).map(name => {
    const versions = [bundledLoop(name), fallbackLoop(name)];
    for (const { samples, rate } of versions) {
      assert.equal(rate, 24000);
      assert.equal(samples.length / rate, LOOP_SECONDS);
      assert.ok(samples.some(sample => Math.abs(sample) > .05), name);
      assert.ok(Math.abs(samples[0] - samples.at(-1)!) < .02, name + ' loop seam');
    }
    return versions.map(version => version.samples);
  });
  // A file can fail independently. These sums bound every choice for all four slots.
  const accompaniment = renderAccompaniment();
  const barFrames = Math.round(24000 * BAR_STEPS * STEP_SECONDS);
  let peak = 0, peakWithBacking = 0;
  for (let i = 0; i < stems[0][0].length; i++) {
    let positive = 0, negative = 0;
    for (const [recorded, fallback] of stems) {
      positive += Math.max(0, recorded[i], fallback[i]);
      negative += Math.min(0, recorded[i], fallback[i]);
    }
    peak = Math.max(peak, positive, -negative);
    const { bass, strings } = accompaniment[Math.floor(i / barFrames)];
    const frame = i % barFrames;
    const bassLevel = bass?.samples[frame] ?? 0;
    const stringLevel = strings?.samples[frame] ?? 0;
    positive += Math.max(0, bassLevel) + Math.max(0, stringLevel);
    negative += Math.min(0, bassLevel) + Math.min(0, stringLevel);
    peakWithBacking = Math.max(peakWithBacking, positive, -negative);
  }
  assert.ok(peak < .90, 'maximum lineup peak ' + peak);
  assert.ok(peakWithBacking < 1, 'maximum lineup peak with backing ' + peakWithBacking);
});

for (const [source, load] of Object.entries({ bundled: bundledLoop, fallback: fallbackLoop })) {
  test(source + ' pulse has a bass pickup in the space between kicks', () => {
    const { samples, rate } = load('drum');
    const start = Math.round(6 * STEP_SECONDS * rate);
    const pickup = samples.subarray(start, start + Math.round(.09 * rate));
    const rms = Math.sqrt(pickup.reduce((sum, x) => sum + x * x, 0) / pickup.length);
    assert.ok(rms > .025, 'bass pickup RMS ' + rms);
  });
}

test('the shipped bell matches the editable score sample for sample after WAV encoding', () => {
  const recorded = bundledLoop('bell').samples;
  const rendered = fallbackLoop('bell').samples;
  assert.equal(recorded.length, rendered.length);
  assert.ok(recorded.every((value, i) => value === Math.round(rendered[i] * 32767) / 32768));
});
