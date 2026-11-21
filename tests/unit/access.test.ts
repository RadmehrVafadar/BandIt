import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { JWTPayload } from 'jose';
import { authConfig } from '../../auth/config.ts';
import { withProviderKey } from '../../server/access.ts';
import type { ProviderAccess } from '../../server/access.ts';
import { testAuthEnv } from '../fixtures/auth0.ts';

async function listen(t: TestContext, handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
}

test('incomplete Auth0 settings lock signed-in requests and leave the public demo available', async t => {
  for (const name of ['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID', 'VITE_AUTH0_AUDIENCE']) {
    assert.equal(authConfig({ ...testAuthEnv, [name]: ' ' }), undefined);
  }
  assert.equal(authConfig({ ...testAuthEnv, VITE_AUTH0_DOMAIN: 'https://tenant.invalid' }), undefined);
  assert.equal(authConfig({ ...testAuthEnv, VITE_AUTH0_AUDIENCE: testAuthEnv.VITE_AUTH0_CLIENT_ID }), undefined);
  assert.ok(authConfig({ ...testAuthEnv, VITE_AUTH0_OWNER_SUB: '' }));
  assert.equal(authConfig({})?.audience, 'urn:bandit:api');
  const url = await listen(t, withProviderKey(async (_req, res, { key }) => {
    assert.equal(key, 'demo-test-key');
    res.writeHead(204).end();
  }, 'demo-test-key', { VITE_AUTH0_DOMAIN: '' }));
  const response = await fetch(url, { headers: { authorization: 'Bearer token' } });
  assert.equal(response.status, 503);
  assert.equal((await fetch(url, { headers: { 'x-bandit-demo': '1' } })).status, 204);
});

test('both Vercel endpoints validate Google user tokens and accept explicitly marked demo requests', async t => {
  const previous = process.env;
  process.env = { ...previous, ...testAuthEnv, GEMINI_API_KEY: 'shared-gemini', ELEVENLABS_API_KEY: 'shared-eleven' };
  t.after(() => { process.env = previous; });
  const { default: identify } = await import('../../api/identify.ts');
  const { default: sounds } = await import('../../api/sounds.ts');
  const url = await listen(t, (req, res) => req.url?.startsWith('/api/sounds') ? sounds(req, res) : identify(req, res));

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const { privateKey: otherKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256' };
  const issuer = 'https://' + testAuthEnv.VITE_AUTH0_DOMAIN + '/';
  const request = fetch;
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    assert.equal(input, issuer + '.well-known/jwks.json');
    return Response.json({ keys: [jwk] });
  });
  const claims = { iss: issuer, aud: testAuthEnv.VITE_AUTH0_AUDIENCE, sub: testAuthEnv.VITE_AUTH0_OWNER_SUB,
    azp: testAuthEnv.VITE_AUTH0_CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 600 };
  function sign(overrides: JWTPayload = {}, key = privateKey) {
    return new SignJWT({ ...claims, ...overrides }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(key);
  }
  const rejected: [string | undefined, number][] = [
    [undefined, 401],
    [await sign({ sub: 'auth0|other-user' }), 403],
    [await sign({ azp: 'other-application' }), 403],
    [await sign({ iss: 'https://other.invalid/' }), 401],
    [await sign({ aud: testAuthEnv.VITE_AUTH0_CLIENT_ID }), 401],
    [await sign({ exp: 1 }), 401],
    [await sign({ exp: undefined }), 401],
    [await sign({}, otherKey), 401],
  ];
  for (const path of ['/api/identify', '/api/sounds?name=keys']) {
    for (const [token, status] of rejected) {
      const headers = new Headers({ 'x-pocket-band': '1' });
      if (token) headers.set('Authorization', 'Bearer ' + token);
      const response = await request(url + path, { method: 'POST', headers });
      assert.equal(response.status, status, path);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    }
    // An authorized GET reaches each handler's own method check without using a paid service.
    for (const token of [await sign(), await sign({ sub: 'google-oauth2|other-user' }), await sign({ azp: undefined, client_id: testAuthEnv.VITE_AUTH0_CLIENT_ID })]) {
      const response = await request(url + path, { headers: { Authorization: 'Bearer ' + token } });
      assert.equal(response.status, path === '/api/identify' ? 405 : 400);
    }
    const demo = await request(url + path, { headers: { 'x-bandit-demo': '1' } });
    assert.equal(demo.status, path === '/api/identify' ? 405 : 400);
  }

  const chosen: ProviderAccess[] = [];
  const verified = await listen(t, withProviderKey(async (_req, res, access) => {
    chosen.push(access);
    res.writeHead(204).end();
  }, 'site-key', testAuthEnv));
  const sub = 'google-oauth2|other-user';
  const authorization = 'Bearer ' + await sign({ sub });
  for (const headers of [new Headers({ authorization, 'x-bandit-api-key': 'personal-key' }),
    new Headers({ authorization }), new Headers({ 'x-bandit-demo': '1' })]) {
    assert.equal((await request(verified, { headers })).status, 204);
  }
  assert.deepEqual(chosen, [{ key: 'personal-key', member: sub }, { key: 'site-key', member: undefined }, { key: 'site-key', member: undefined }]);
  for (const headers of [new Headers({ authorization, 'x-bandit-api-key': 'invalid key' }),
    new Headers({ authorization, 'x-bandit-demo': '1' }), new Headers({ 'x-bandit-demo': '1', 'x-bandit-api-key': 'unexpected' })]) {
    assert.equal((await request(verified, { headers })).status, 400);
  }
  assert.equal(chosen.length, 3);
});
