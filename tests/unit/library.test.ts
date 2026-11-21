import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLibrary, readLibrary, storeStage } from '../../src/library.ts';
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
