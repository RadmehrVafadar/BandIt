import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { soundHandler } from '../../server/handler.ts';
import { withProviderKey } from '../../server/access.ts';

async function serve(t: TestContext, directory: string) {
  const handle = soundHandler(directory);
  const server = createServer((req, res) => handle(req, res, { key: 'test-key' }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/sounds';
}

test('the public demo can replay a cached clip when the shared key is unavailable', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bandit-demo-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'basketball.mp3'), 'cached bounce');
  const server = createServer(withProviderKey(soundHandler(directory), undefined));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const response = await fetch('http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/sounds?name=basketball', {
    method: 'POST', headers: { 'x-bandit-demo': '1', 'x-pocket-band': '1' },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'cached bounce');
});

test('basketball generates audio when the function starts outside the static site', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bandit-function-'));
  const cwd = process.cwd();
  t.after(async () => {
    process.chdir(cwd);
    await rm(directory, { recursive: true, force: true });
  });
  const clientFetch = fetch;
  const provider = t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(url, 'https://api.elevenlabs.io/v1/sound-generation');
    assert.match(JSON.parse(String(init?.body)).text, /basketball/i);
    return new Response('bounce', { headers: { 'content-type': 'audio/mpeg' } });
  });
  process.chdir(directory);
  const response = await clientFetch(await serve(t, directory) + '?name=basketball', {
    method: 'POST', headers: { 'x-pocket-band': '1' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await response.text(), 'bounce');
  assert.equal(provider.mock.callCount(), 1);
});

test('sketches and photos of a swimming pool or computer keyboard share the matching sound', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bandit-illustrated-sounds-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const clientFetch = fetch;
  const prompts: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    prompts.push(JSON.parse(String(init?.body)).text);
    return new Response('sample', { headers: { 'content-type': 'audio/mpeg' } });
  });
  const url = await serve(t, directory);
  for (const [sketch, photo] of [['pool', 'swimming pool'], ['keyboard', 'computer keyboard']]) {
    for (const name of [sketch, photo]) {
      const response = await clientFetch(url + '?name=' + encodeURIComponent(name), {
        method: 'POST', headers: { 'x-pocket-band': '1' },
      });
      assert.equal(response.status, 200);
    }
  }
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /swimming pool/);
  assert.match(prompts[1], /computer keyboard/);
});
