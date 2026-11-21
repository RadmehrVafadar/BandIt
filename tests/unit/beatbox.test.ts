import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBeatboxPack } from '../../src/beatbox.ts';

test('the four beatbox voices have distinct, audible one-shots with clean edges and headroom', () => {
  const voices = createBeatboxPack('/');
  assert.equal(new Set(voices.map(voice => voice.id)).size, 4);
  assert.equal(new Set(voices.map(voice => voice.role)).size, 4);
  const attacks = new Set<string>();
  for (const { name, sample } of voices) {
    const { samples, rate } = sample;
    assert.equal(sample.articulation, 'beatbox');
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value ** 2, 0) / samples.length);
    assert.ok(peak < 1 && rms > .035, name);
    assert.ok(samples[0] === 0 && samples.at(-1) === 0, name);
    attacks.add(samples.subarray(0, Math.round(.01 * rate)).join(','));
  }
  assert.equal(attacks.size, 4);
});
