import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHRASE, STEP_SECONDS, score } from '../../src/music.ts';
import type { Part } from '../../src/music.ts';
import { objectSample } from '../../src/objects.ts';
import { partSample, stablePitch } from '../../src/part-sample.ts';

test('a bell hook rings in C and noise uses the tuned body', () => {
  const bell = objectSample('bell');
  assert.ok(Math.abs(stablePitch(bell) - 659.25) < 3);
  assert.ok(Math.abs(stablePitch(partSample(bell, 'hook')) - 523.25) < 3);
  const keys = objectSample('keys');
  assert.equal(stablePitch(keys), 0);
  assert.ok(Math.abs(stablePitch(partSample(keys, 'hook')) - 261.63) < 3);
});

test('four identical source sounds leave mix headroom through the loop boundary', () => {
  for (const kind of ['bell', 'whistle', 'drum', 'keys', 'cup', 'pencil'] as const) {
    const source = objectSample(kind);
    const mix = new Float32Array(Math.round(PHRASE * STEP_SECONDS * source.rate));
    for (const part of Object.keys(score) as Part[]) {
      const { samples } = partSample(source, part);
      assert.ok(samples.some(value => Math.abs(value) > .025));
      assert.equal(Math.abs(samples.at(-1)!), 0);
      for (const [step, level, pitch = 0] of score[part]) {
        const start = Math.round(step * STEP_SECONDS * source.rate);
        const speed = 2 ** (pitch / 12);
        for (let i = 0; i * speed < samples.length; i++) {
          mix[(start + i) % mix.length] += level * samples[Math.floor(i * speed)];
        }
      }
    }
    const peak = mix.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    assert.ok(peak > .2 && peak < .9, kind + ' ensemble peak ' + peak);
  }
});
