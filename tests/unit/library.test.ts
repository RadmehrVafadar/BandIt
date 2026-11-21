import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLibrary, readLibrary, storeInstrument, storeStage } from '../../src/library.ts';
import type { Instrument } from '../../src/music.ts';

test('restore instrument media and stage across connections', async () => {
  const name = 'library-test';
  let db = await openLibrary(name);
  assert.deepEqual((await readLibrary(db)).slots, ['mug', 'pen', null, null]);
  const keys: Instrument = {
    id: 'keys', name: 'Keys', role: 'shaker', image: 'data:image/png;base64,keys',
    sample: { samples: new Float32Array([0, 0.85, 0]), rate: 48000 },
  };
  await storeInstrument(db, keys);
  await storeStage(db, ['mug', 'pen', 'keys', null]);
  db.close();
  db = await openLibrary(name);
  assert.deepEqual(await readLibrary(db), { instruments: [keys], slots: ['mug', 'pen', 'keys', null] });
  await storeStage(db, ['mug', 'pen', null, 'missing']);
  assert.deepEqual(await readLibrary(db), { instruments: [keys], slots: ['mug', 'pen', null, null] });
  db.close();
});
