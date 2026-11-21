import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { soundHandler } from '../../server/handler.ts';

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
  const server = createServer(soundHandler(directory, 'test-key'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const response = await clientFetch('http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/sounds?name=basketball', {
    method: 'POST', headers: { 'x-pocket-band': '1' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await response.text(), 'bounce');
  assert.equal(provider.mock.callCount(), 1);
});
