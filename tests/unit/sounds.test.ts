import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { redisSoundCache } from '../../server/shared-cache.ts';
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

test('car replaces an old generic take with a starter motor catching and idling', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'car-sound-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(directory, 'car.mp3'), 'old kick');
  const get = soundBank(directory, new Set(['car']), 'test', async (_url, init) => {
    const prompt = JSON.parse(String(init?.body));
    assert.match(prompt.text, /starter motor/i);
    assert.match(prompt.text, /idle/i);
    return new Response('ignition', { headers: { 'content-type': 'audio/mpeg' } });
  });
  assert.equal((await get('car')).toString(), 'ignition');
});

test('independent servers share one paid generation and a cold server reads the result', async () => {
  const values = new Map<string, string>();
  const redis: typeof fetch = async (_url, init) => {
    const [command, key, value, nx] = JSON.parse(String(init?.body)) as string[];
    let result: string | null = null;
    if (command === 'GET') result = values.get(key) ?? null;
    else if (command === 'SET' && !(nx === 'NX' && values.has(key))) {
      values.set(key, value);
      result = 'OK';
    }
    return Response.json({ result });
  };
  const server = () => redisSoundCache('https://cache.invalid', 'test', redis);
  let generations = 0;
  const generate = async () => {
    generations++;
    return Buffer.from('engine');
  };
  const clips = await Promise.all([server()('car', generate), server()('car', generate)]);
  assert.deepEqual(clips[0], clips[1]);
  assert.deepEqual(await server()('car', generate), clips[0]);
  assert.equal(generations, 1);
});
