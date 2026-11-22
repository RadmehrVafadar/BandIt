import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import labels from '../../src/doodle-labels.json' with { type: 'json' };
import { doodleSuggestion, drawingFile, objectSample, objects } from '../../src/objects.ts';
import { templateScores, type ObjectKind } from '../../src/sketch.ts';

const sketches: Record<string, [ObjectKind, number[][][]]> = {
  singleKey: ['keys', [[[0, 2], [4, 0], [8, 1], [10, 6], [8, 9], [3, 9], [0, 6], [0, 2]],
    [[8, 6], [22, 8], [21, 12], [18, 11], [17, 9], [15, 10], [14, 8], [8, 8]]]],
  ring: ['keys', [[[2, 6], [1, 3], [4, 0], [8, 0], [11, 3], [10, 7], [5, 9], [2, 6]],
    [[4, 8], [2, 15], [2, 18], [5, 18], [4, 15], [6, 13], [6, 8]],
    [[9, 7], [14, 11], [18, 17], [15, 19], [12, 16], [14, 15], [10, 13], [7, 8]]]],
  drum: ['drum', [[[0, 4], [3, 1], [10, 0], [18, 2], [21, 5], [16, 8], [5, 8], [0, 4]],
    [[0, 4], [2, 15], [8, 17], [15, 16], [20, 13], [21, 5]]]],
  bell: ['bell', [[[0, 16], [5, 12], [7, 4], [11, 1], [14, 3], [17, 12], [21, 16], [0, 16]],
    [[8, 17], [9, 20], [13, 21], [15, 17]]]],
  cup: ['cup', [[[0, 1], [3, 17], [12, 17], [15, 1], [0, 1]], [[14, 4], [20, 4], [21, 8], [14, 12]]]],
  pencil: ['pencil', [[[0, 22], [3, 15], [19, 0], [23, 4], [7, 20], [0, 22]], [[4, 15], [8, 19]]]],
  whistle: ['whistle', [[[2, 9], [2, 4], [13, 4], [18, 1], [23, 2], [26, 6], [25, 11], [20, 14], [15, 12], [13, 10], [2, 9]],
    [[16, 5], [21, 5], [20, 8], [16, 8], [16, 5]]]],
};

test('each classifier and basic suggestion has its own local illustration', () => {
  const names = new Set([...labels.map(label => doodleSuggestion(label).name), ...Object.values(objects).map(o => o.name)]);
  const files = [...names].map(drawingFile);
  assert.equal(new Set(files).size, names.size);
  const bundled = readdirSync(new URL('../../public/drawings/', import.meta.url)).map(file => 'drawings/' + file);
  assert.deepEqual(files.sort(), bundled.sort());
});

for (const [shape, [kind, strokes]] of Object.entries(sketches)) {
  test('recognize ' + shape + ' across translations, scales, and stroke directions', () => {
    for (const scale of [1, 6]) {
      const drawing = strokes.map(stroke => stroke.map(([x, y]) => ({ x: 32 + x * scale, y: 78 + y * scale })));
      const reversed = drawing.toReversed().map(stroke => stroke.toReversed());
      for (const input of [drawing, reversed]) {
        const [[bestMatch]] = templateScores(input);
        assert.equal(bestMatch, kind);
      }
    }
  });
}

test('each object has a different rhythm and a bounded, audible sample', () => {
  const kinds = Object.keys(objects) as ObjectKind[];
  assert.equal(new Set(kinds.map(kind => objects[kind].role)).size, kinds.length);
  for (const kind of kinds) {
    const { samples, rate } = objectSample(kind);
    assert.equal(rate, 44100);
    assert.ok(Math.max(...samples) > 0.25);
    assert.ok(Math.max(...samples.map(Math.abs)) <= 1);
    assert.ok(Math.abs(samples[0]) === 0 && Math.abs(samples.at(-1)!) === 0);
  }
});
