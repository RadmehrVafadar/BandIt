import type { Page } from '@playwright/test';
import { generateKeyPair, SignJWT } from 'jose';

export const testAuthEnv = {
  VITE_AUTH0_DOMAIN: 'bandit-login.invalid',
  VITE_AUTH0_CLIENT_ID: 'bandit-browser-test',
  VITE_AUTH0_AUDIENCE: 'https://bandit-api.invalid',
  VITE_AUTH0_OWNER_SUB: 'google-oauth2|test-owner',
};
export const testAccessToken = 'browser-fixture-access-token';

// Intercept the identity provider in the browser. The app uses its normal SDK and callback.
export async function mockAuth0(page: Page, { subject = testAuthEnv.VITE_AUTH0_OWNER_SUB, returningAt }: {
  subject?: string; returningAt?: string;
} = {}) {
  const { VITE_AUTH0_DOMAIN: domain, VITE_AUTH0_CLIENT_ID: clientId } = testAuthEnv;
  const issuer = 'https://' + domain + '/';
  const { privateKey } = await generateKeyPair('RS256');
  const nonces = new Map<string, string>();
  if (returningAt) {
    await page.context().addCookies([{ url: returningAt, name: 'auth0.' + clientId + '.is.authenticated', value: 'true' }]);
  }

  await page.route(issuer + '**', async route => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    if (pathname === '/authorize') {
      const callback = new URL(searchParams.get('redirect_uri')!);
      const code = crypto.randomUUID();
      const state = searchParams.get('state')!;
      nonces.set(code, searchParams.get('nonce')!);
      if (searchParams.get('response_mode') === 'web_message') {
        const message = { type: 'authorization_response', response: { code, state } };
        return route.fulfill({ contentType: 'text/html',
          body: '<script>parent.postMessage(' + JSON.stringify(message) + ',' + JSON.stringify(callback.origin) + ')</script>' });
      }
      callback.search = new URLSearchParams({ code, state }).toString();
      return route.fulfill({ status: 302, headers: { location: callback.href } });
    }
    if (pathname === '/oauth/token') {
      const headers = { 'Access-Control-Allow-Origin': request.headers().origin,
        'Access-Control-Allow-Headers': 'Content-Type, Auth0-Client', 'Access-Control-Allow-Methods': 'POST' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const code = new URLSearchParams(request.postData() ?? '').get('code')!;
      const nonce = nonces.get(code);
      nonces.delete(code);
      if (!nonce) return route.fulfill({ status: 400, headers });
      const idToken = await new SignJWT({ nonce }).setProtectedHeader({ alg: 'RS256' }).setIssuer(issuer)
        .setAudience(clientId).setSubject(subject).setIssuedAt().setExpirationTime('1h').sign(privateKey);
      return route.fulfill({ headers, json: {
        id_token: idToken, access_token: testAccessToken, token_type: 'Bearer', expires_in: 3600,
      } });
    }
    if (pathname === '/v2/logout') {
      return route.fulfill({ status: 302, headers: { location: searchParams.get('returnTo')! } });
    }
    return route.abort();
  });
}
