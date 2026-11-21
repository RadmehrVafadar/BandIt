import { expect, test } from '@playwright/test';
import { mockAuth0, testAuthEnv } from '../fixtures/auth0.ts';

test('Google login offers optional keys and signs out other studio tabs', async ({ page, context }) => {
  await mockAuth0(page);
  await page.goto('/');
  const login = page.getByRole('button', { name: 'Continue with Google' });
  await expect(login).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  const authorize = page.waitForRequest('https://' + testAuthEnv.VITE_AUTH0_DOMAIN + '/authorize?*');
  await login.click();
  const params = new URL((await authorize).url()).searchParams;
  expect(params.get('audience')).toBe(testAuthEnv.VITE_AUTH0_AUDIENCE);
  expect(params.get('code_challenge_method')).toBe('S256');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('button', { name: 'Add an object to slot 1' })).toBeEnabled();
  expect(new URL(page.url()).search).toBe('');
  const secondTab = await context.newPage();
  await mockAuth0(secondTab);
  await secondTab.goto('/');
  await expect(secondTab.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(login).toBeEnabled();
  await expect(secondTab.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  await page.reload();
  await expect(login).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('a denial from the Auth0 login action offers account switching', async ({ page }) => {
  await page.route('https://' + testAuthEnv.VITE_AUTH0_DOMAIN + '/authorize?*', route => {
    const params = new URL(route.request().url()).searchParams;
    const callback = new URL(params.get('redirect_uri')!);
    callback.search = new URLSearchParams({ error: 'access_denied', state: params.get('state')! }).toString();
    return route.fulfill({ status: 302, headers: { location: callback.href } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('button', { name: 'Use another account' })).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('a second Google account can enter, edit and forget its own keys', async ({ page }) => {
  await mockAuth0(page, { subject: 'google-oauth2|another-account' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your API keys' });
  await dialog.getByLabel('Gemini API key', { exact: false }).fill('personal-test-gemini');
  await dialog.getByRole('button', { name: 'Open studio' }).click();
  await expect(page.getByRole('button', { name: 'Add an object to slot 1' })).toBeEnabled();
  await page.getByRole('button', { name: 'API keys', exact: true }).click();
  await expect(dialog.getByLabel('Gemini API key', { exact: false })).toHaveValue('personal-test-gemini');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain('personal-test-gemini');
  await page.reload();
  await page.getByRole('button', { name: 'API keys', exact: true }).click();
  await expect(dialog.getByLabel('Gemini API key', { exact: false })).toHaveValue('');
});

test('See demo opens below sign-in, keeps its own stage and skips Auth0', async ({ page }) => {
  const authRequests: string[] = [];
  page.on('request', request => { if (request.url().includes(testAuthEnv.VITE_AUTH0_DOMAIN)) authRequests.push(request.url()); });
  await page.goto('/');
  const signIn = await page.getByRole('button', { name: 'Continue with Google' }).boundingBox();
  const link = page.getByRole('link', { name: 'See demo' });
  expect((await link.boundingBox())!.y).toBeGreaterThanOrEqual(signIn!.y + signIn!.height);
  await link.click();
  await page.getByRole('button', { name: 'Add an object to slot 1' }).click();
  await page.getByRole('button', { name: 'Add Lip Kick' }).click();
  await expect(page.getByRole('button', { name: 'Solo Lip Kick' })).toBeVisible();
  expect((await page.evaluate(() => indexedDB.databases())).map(db => db.name)).toEqual(['pocket-band:demo']);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Solo Lip Kick' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(link).toBeVisible();
  expect(authRequests).toEqual([]);
});

test('a callback without a login transaction leaves the studio locked', async ({ page }) => {
  await page.goto('/?code=expired&state=old');
  await expect(page.getByRole('status')).toContainText('Sign-in didn’t finish');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');
});

test('both preview APIs reject unmarked requests without a token', async ({ request }) => {
  for (const path of ['/api/identify', '/api/sounds?name=keys']) {
    const response = await request.post(path, { headers: { 'x-pocket-band': '1' } });
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
