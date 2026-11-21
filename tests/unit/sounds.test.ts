import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { soundBank } from '../../server/sounds.ts';

test('only recognized objects generate, retries provider errors and shares cached audio', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pocket-sounds-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const labels = new Set(['star']);
  let calls = 0;
  const get = soundBank(directory, labels, 'test', async (_url, init) => {
    assert.match(String(init?.body), /star/);
    if (++calls === 1) return new Response(null, { status: 429 });
    return new Response('sample', { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  assert.throws(() => get('../star'));
  await assert.rejects(get('star'), /429/);
  const [first, same] = await Promise.all([get('star'), get('star')]);
  assert.deepEqual(first, same);
  assert.deepEqual(await soundBank(directory, labels, '')('star'), first);
  assert.equal(calls, 2);
});
