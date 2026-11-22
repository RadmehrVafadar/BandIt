import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { withProviderKey } from '../../server/access.ts';
import { identifyHandler } from '../../server/identify.ts';
import { objectLabels } from '../../src/object-labels.ts';

const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9]).toString('base64');
const post = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pocket-band': '1' }, body: JSON.stringify({ image }) };

async function serve(t: TestContext, provider: typeof fetch, key = 'test-key') {
  const handle = identifyHandler(provider);
  const server = createServer((req, res) => handle(req, res, { key }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/identify';
}

function candidate(name: unknown) {
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ name }) }] } }] });
}

test('the public demo uses the supplied Gemini key for recognition and never falls back to the site key', async t => {
  const provider = t.mock.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
    new Headers(init?.headers).get('x-goog-api-key') === 'guest-key' ? candidate('Drum') : new Response(null, { status: 403 }));
  const server = createServer(withProviderKey(identifyHandler(provider), 'site-key'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/identify';
  const headers = { ...post.headers, 'x-bandit-demo': '1' };
  assert.equal((await fetch(url, { ...post, headers })).status, 503);
  assert.equal(provider.mock.callCount(), 0);

  const allowed = await fetch(url, { ...post, headers: { ...headers, 'x-bandit-api-key': 'guest-key' } });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { name: 'drum' });
  assert.equal((await fetch(url, { ...post, headers: { ...headers, 'x-bandit-api-key': 'rejected-key' } })).status, 403);
  assert.deepEqual(provider.mock.calls.map(call => new Headers(call.arguments[1]?.headers).get('x-goog-api-key')),
    ['guest-key', 'rejected-key']);
});

test('sends the submitted JPEG to Gemini and returns the object name', async t => {
  const requests: Request[] = [];
  const url = await serve(t, async (input, init) => {
    requests.push(new Request(input, init));
    return candidate('Coffee_Cup');
  });
  const response = await fetch(url, post);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { name: 'coffee cup' });
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.match(request.url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent$/);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.get('x-goog-api-key'), 'test-key');
  const { contents, generationConfig } = await request.json();
  assert.deepEqual(contents[0].parts[0].inlineData, { mimeType: 'image/jpeg', data: image });
  assert.match(contents[0].parts[1].text, /coffee cup/);
  assert.match(contents[0].parts[1].text, /computer mouse/);
  assert.match(contents[0].parts[1].text, /animal mouse/);
  assert.match(contents[0].parts[1].text, /musical keyboard/);
  assert.equal(generationConfig.responseMimeType, 'application/json');
});

test('photo names only reuse illustrations for the matching meaning', () => {
  assert.equal(objectLabels.get('animal mouse'), 'mouse');
  assert.equal(objectLabels.get('computer mouse'), undefined);
  assert.equal(objectLabels.get('computer keyboard'), 'keyboard');
  assert.equal(objectLabels.get('musical keyboard'), undefined);
  assert.equal(objectLabels.get('flying bat'), 'bat');
  assert.equal(objectLabels.get('baseball bat'), 'baseball_bat');
  assert.equal(objectLabels.get('swimming pool'), 'pool');
  assert.equal(objectLabels.get('pool table'), undefined);
});

test('rejects invalid and oversized uploads before contacting Gemini', async t => {
  const provider = t.mock.fn(async () => candidate('drum'));
  const url = await serve(t, provider);
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await fetch(url, { ...post, headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await fetch(url, { ...post, headers: { ...post.headers, 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await fetch(url, { ...post, body: '{' })).status, 400);
  assert.equal((await fetch(url, { ...post, body: '{"image":"no photo"}' })).status, 400);
  const oversized = 'x'.repeat(1024 * 1024 + 1);
  assert.equal((await fetch(url, { ...post, body: oversized })).status, 413);
  const chunked = new Blob([oversized]).stream();
  assert.equal((await fetch(url, { ...post, body: chunked, duplex: 'half' } as RequestInit)).status, 413);
  assert.equal((await fetch(await serve(t, provider, ''), post)).status, 503);
  assert.equal(provider.mock.callCount(), 0);
});

test('distinguishes unclear photos from service failures and malformed names', async t => {
  const replies = [
    candidate(null), Response.json({ promptFeedback: { blockReason: 'SAFETY' } }),
    new Response('', { status: 429 }), Response.json({ candidates: [] }), candidate('<invalid>'),
    candidate("Rubik's cube"),
  ];
  const url = await serve(t, async () => replies.shift()!);
  for (const expected of [422, 422, 502, 502, 502, 200]) {
    const response = await fetch(url, post);
    assert.equal(response.status, expected);
    if (expected === 200) assert.deepEqual(await response.json(), { name: "rubik's cube" });
  }
});
