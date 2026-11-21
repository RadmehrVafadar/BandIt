import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import labels from '../../src/doodle-labels.json' with { type: 'json' };
import { createObject, doodleSuggestion } from '../../src/objects.ts';

function render(label: string) {
  return createObject(doodleSuggestion(label), { x: 0.5, y: 0.5 }).sample;
}

test('every model label produces a distinct, audible, mix-safe sample', () => {
  const seen = new Map<string, string>();
  for (const label of labels) {
    const { samples, rate } = render(label);
    assert.ok(samples.length > 0.04 * rate && samples.length < rate, label);
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    assert.ok(peak > 0.15 && peak <= 1, label);
    assert.ok(samples[0] === 0 && samples.at(-1) === 0, label);
    const fingerprint = createHash('sha256').update(samples).digest('hex');
    assert.ok(!seen.has(fingerprint), label + ' duplicates ' + seen.get(fingerprint));
    seen.set(fingerprint, label);
  }
});

test('new categories get their own repeatable sounds automatically', () => {
  const first = render('music_box').samples;
  assert.ok(first.some(value => Math.abs(value) > 0.15));
  assert.deepEqual(render('music_box').samples, first);
  const other = render('snow_globe').samples;
  assert.ok(other.some((value, i) => value !== first[i]));
});

test('the built-in horse rhythm has two distinct hoof strikes at their natural pitch', () => {
  const { samples, rate, preserveRecording } = render('horse');
  assert.equal(preserveRecording, true);
  const peak = (from: number, to: number) => samples.subarray(Math.round(from * rate), Math.round(to * rate))
    .reduce((loudest, value) => Math.max(loudest, Math.abs(value)), 0);
  assert.ok(peak(0, .035) > .18);
  assert.ok(peak(.06, .085) < .04);
  assert.ok(peak(.09, .13) > .12);
});
