import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createObject, doodleSuggestion } from '../../src/objects.ts';

function render(label: string) {
  return createObject(doodleSuggestion(label), { x: 0.5, y: 0.5 }).sample;
}

test('every model label produces a distinct, audible, mix-safe sample', () => {
  const labels = readFileSync(new URL('../../public/doodlenet/class_names.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);
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
