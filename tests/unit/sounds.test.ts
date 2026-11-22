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
  const get = soundBank(directory, labels, async (_url, init) => {
    assert.match(String(init?.body), /star/);
    if (++calls === 1) return new Response(null, { status: 429 });
    return new Response('sample', { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  assert.throws(() => get('../star'));
  await assert.rejects(get('star', 'test'), /429/);
  const [first, same] = await Promise.all([get('star', 'test'), get('star', 'test')]);
  assert.deepEqual(first, same);
  assert.deepEqual(await soundBank(directory, labels)('star'), first);
  assert.equal(calls, 2);
});

test('car replaces an old generic take with a starter motor catching and idling', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'car-sound-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(directory, 'car.mp3'), 'old kick');
  const get = soundBank(directory, new Set(['car']), async (_url, init) => {
    const prompt = JSON.parse(String(init?.body));
    assert.match(prompt.text, /starter motor/i);
    assert.match(prompt.text, /idle/i);
    return new Response('ignition', { headers: { 'content-type': 'audio/mpeg' } });
  });
  assert.equal((await get('car', 'test')).toString(), 'ignition');
});

test('simultaneous personal and shared generations use separate keys and caches', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bandit-accounts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const get = soundBank(directory, new Set(['star']), async (_url, init) =>
    new Response(new Headers(init?.headers).get('xi-api-key'), { headers: { 'content-type': 'audio/mpeg' } }));
  const clips = await Promise.all([get('star', 'shared'), get('star', 'one', 'google-oauth2|1'), get('star', 'two', 'google-oauth2|2')]);
  assert.deepEqual(clips.map(clip => clip.toString()), ['shared', 'one', 'two']);
  assert.equal((await get('star', 'unused', 'google-oauth2|1')).toString(), 'one');
  assert.equal((await get('star', 'unused')).toString(), 'shared');
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
  assert.equal(await server()('car'), undefined);
  assert.equal(values.size, 0);
  const clips = await Promise.all([server()('car', generate), server()('car', generate)]);
  assert.deepEqual(clips[0], clips[1]);
  assert.deepEqual(await server()('car'), clips[0]);
  assert.equal(generations, 1);
});

test('Vercel Marketplace credentials must be a complete pair', async t => {
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_TOKEN;
  process.env.KV_REST_API_URL = 'https://redis.invalid';
  await assert.rejects(import('../../api/sounds.ts'), /Incomplete Redis/);
});
