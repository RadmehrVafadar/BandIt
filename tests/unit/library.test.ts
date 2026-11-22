import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLibrary, readLibrary, storeRhythm, storeStage } from '../../src/library.ts';
import type { Instrument } from '../../src/music.ts';

test('restore instrument media and stage across connections', async () => {
  const name = 'library-test';
  let db = await openLibrary(name);
  assert.deepEqual((await readLibrary(db)).slots, [null, null, null, null]);
  const keys: Instrument = {
    id: 'keys', name: 'Keys', role: 'shaker', image: 'data:image/png;base64,keys',
    sample: { samples: new Float32Array([0, 0.85, 0]), rate: 48000 },
  };
  await storeStage(db, ['mug', 'pen', null, null, 'keys'], keys);
  db.close();
  db = await openLibrary(name);
  assert.deepEqual(await readLibrary(db), { instruments: [keys], slots: ['mug', 'pen', null, null, 'keys'] });
  await storeStage(db, ['mug', 'pen', 'missing']);
  assert.deepEqual(await readLibrary(db), { instruments: [keys], slots: ['mug', 'pen', null, null] });
  db.close();
});

test('save a recognized object and its normalized position with the stage', async () => {
  const db = await openLibrary('drawing-library-test');
  const key: Instrument = {
    id: 'a-drawing', name: 'Keys', kind: 'keys', role: 'shaker', position: { x: 0.17, y: 0.42 },
    sample: { samples: new Float32Array([0, 0.85, 0]), rate: 44100 },
  };
  const slots = [key.id, null, null, null];
  await storeStage(db, slots, key);
  assert.deepEqual(await readLibrary(db), { instruments: [key], slots });
  db.close();
});

test('lineup changes and concurrent takes preserve rhythms saved for other instruments', async () => {
  const first = await openLibrary('rhythm-library-test');
  const second = await openLibrary('rhythm-library-test');
  await Promise.all([
    storeRhythm(first, 'mug', [[0, 1], [7, 1]]),
    storeRhythm(second, 'pen', [[0, 1], [12, 1]]),
    storeStage(first, ['pen', null, null, null]),
  ]);
  assert.deepEqual((await readLibrary(first)).rhythms, new Map([
    ['mug', [[0, 1], [7, 1]]], ['pen', [[0, 1], [12, 1]]],
  ]));
  await storeRhythm(second, 'mug');
  assert.deepEqual((await readLibrary(first)).rhythms, new Map([['pen', [[0, 1], [12, 1]]]]));
  first.close();
  second.close();
});
