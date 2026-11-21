import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { identifyHandler } from '../../server/identify.ts';

const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9]).toString('base64');
const post = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pocket-band': '1' }, body: JSON.stringify({ image }) };

async function serve(t: TestContext, provider: typeof fetch, key = 'test-key') {
  const server = createServer(identifyHandler(key, provider));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/identify';
}

function candidate(name: unknown) {
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ name }) }] } }] });
}

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
  assert.equal(generationConfig.responseMimeType, 'application/json');
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
