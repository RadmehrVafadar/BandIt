import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { mockAuth0, testAccessToken } from '../fixtures/auth0.ts';

test.use({
  permissions: ['camera'],
  launchOptions: {
    executablePath: process.env.BANDIT_CHROME ?? process.env.POCKET_BAND_CHROME,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test.beforeEach(async ({ page, baseURL }) => {
  await mockAuth0(page, { returningAt: baseURL });
});

async function openCamera(page: Page, slot: number) {
  await page.getByRole('button', { name: 'Add an object to slot ' + slot }).click();
  const first = page.getByRole('dialog', { name: 'Add an object' }).getByRole('button').first();
  await expect(first).toHaveAccessibleName('Camera');
  await first.click();
  return page.getByRole('dialog', { name: 'Camera', exact: true });
}

for (const mode of ['demo', 'skip', 'personal Gemini', 'personal ElevenLabs'] as const) {
  test(mode + ' sends only the selected credential to each feature', async ({ page }) => {
    await page.goto(mode === 'demo' ? '/?demo' : '/');
    if (mode !== 'demo') {
      await page.getByRole('button', { name: 'API keys', exact: true }).click();
      if (mode === 'personal Gemini') await page.getByLabel('Gemini API key', { exact: false }).fill('test-photo-key');
      if (mode === 'personal ElevenLabs') await page.getByLabel('ElevenLabs API key', { exact: false }).fill('test-sound-key');
      await page.getByRole('button', { name: 'Save keys' }).click();
    }
    const calls: string[] = [];
    await page.route('**/api/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const headers = req.headers();
      expect(headers.authorization).toBe(mode === 'demo' ? undefined : 'Bearer ' + testAccessToken);
      expect(headers['x-bandit-demo']).toBe(mode === 'demo' ? '1' : undefined);
      const expected = path === '/api/identify' && mode === 'personal Gemini' ? 'test-photo-key'
        : path === '/api/sounds' && mode === 'personal ElevenLabs' ? 'test-sound-key' : undefined;
      expect(headers['x-bandit-api-key']).toBe(expected);
      calls.push(path);
      return path === '/api/identify' ? route.fulfill({ json: { name: 'basketball' } }) : route.fulfill({ status: 503 });
    });
    const camera = await openCamera(page, 1);
    await camera.getByRole('button', { name: 'Take photo' }).click();
    await expect(page.getByRole('button', { name: 'Solo Basketball' })).toBeVisible();
    expect(calls).toEqual(['/api/identify', '/api/sounds']);
  });
}

test('photographs an object into the chosen slot and saves it for reuse', async ({ page }) => {
  let captures = 0;
  await page.route('**/api/identify', route => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    expect(request.headers().authorization).toBe('Bearer ' + testAccessToken);
    expect(request.postDataJSON().image).toMatch(/^\/9j\//);
    captures++;
    return route.fulfill({ json: { name: 'bell' } });
  });
  await page.goto('/');
  const camera = await openCamera(page, 3);
  const shutter = camera.getByRole('button', { name: 'Take photo' });
  await expect(shutter).toBeEnabled();
  const track = await camera.locator('video').evaluateHandle((video: HTMLVideoElement) =>
    (video.srcObject as MediaStream).getVideoTracks()[0]);
  expect(captures).toBe(0);
  await shutter.click();
  await expect(camera).toBeHidden();
  await expect.poll(() => track.evaluate(track => track.readyState)).toBe('ended');
  expect(captures).toBe(1);
  const bell = page.locator('.mix-slot').nth(2).getByRole('button', { name: 'Solo Bell' });
  await expect(bell).toBeVisible();
  await expect(page.locator('[data-performer="Bell"] img')).toHaveAttribute('src', /\/drawings\/bell.svg$/);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.reload();
  await expect(bell).toBeVisible();
  await page.getByRole('button', { name: 'Remove Bell' }).click();
  await page.getByRole('button', { name: 'Add an object to slot 4' }).click();
  const picker = page.getByRole('dialog', { name: 'Add an object' });
  await expect(picker.getByRole('button').first()).toHaveAccessibleName('Camera');
  await picker.getByRole('button', { name: 'Add Bell' }).click();
  await expect(page.locator('.mix-slot').nth(3).getByRole('button', { name: 'Solo Bell' })).toBeVisible();
  expect(captures).toBe(1);
});

test('retries an unclear mobile photo and plays an object outside the illustration library', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let captures = 0;
  const soundRequests: string[] = [];
  await page.route('**/api/sounds?*', route => {
    soundRequests.push(route.request().url());
    return route.fulfill({ status: 503 });
  });
  await page.route('**/api/identify', route => ++captures === 1
    ? route.fulfill({ status: 422 }) : route.fulfill({ json: { name: 'water bottle' } }));
  await page.goto('/');
  const camera = await openCamera(page, 2);
  const shutter = camera.getByRole('button', { name: 'Take photo' });
  await shutter.click();
  await expect(camera.getByRole('alert')).toContainText('Center one object');
  await expect(page.locator('[data-performer]')).toHaveCount(0);
  await shutter.click();
  const photo = page.locator('[data-performer="Water bottle"] img');
  await expect(photo).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.reload();
  await expect(photo).toBeVisible();
  await expect(page.locator('.mix-slot').nth(1).getByRole('button', { name: 'Solo Water bottle' })).toBeVisible();
  expect(soundRequests).toEqual([]);
});

test('denied camera access leaves the slot available', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  await page.goto('/');
  const camera = await openCamera(page, 1);
  await expect(camera.getByRole('alert')).toContainText('Allow camera access');
  await page.keyboard.press('Escape');
  await expect(camera).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add an object to slot 1' })).toBeFocused();
  await expect(page.locator('[data-performer]')).toHaveCount(0);
});

test('a bare mouse result lets the photographer choose the device and keeps its photo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/identify', route => route.fulfill({ json: { name: 'mouse' } }));
  const requests: string[] = [];
  await page.route('**/api/sounds?*', route => {
    requests.push(route.request().url());
    return route.fulfill({ status: 503 });
  });
  await page.goto('/');
  const camera = await openCamera(page, 2);
  await camera.getByRole('button', { name: 'Take photo' }).click();
  await expect(camera.getByRole('button', { name: 'Animal mouse' })).toBeVisible();
  const photo = await camera.getByRole('img', { name: 'Captured photo' }).getAttribute('src');
  expect(photo).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.locator('[data-performer]')).toHaveCount(0);
  await camera.getByRole('button', { name: 'Computer mouse' }).click();
  await expect(camera).toBeHidden();
  const actor = page.locator('[data-performer="Computer mouse"] img');
  await expect(actor).toHaveAttribute('src', photo!);
  await page.reload();
  await expect(actor).toHaveAttribute('src', photo!);
  expect(requests).toEqual([]);
});

test('a computer keyboard reuses its illustration and requests a typing sound', async ({ page }) => {
  await page.route('**/api/identify', route => route.fulfill({ json: { name: 'computer keyboard' } }));
  const requests: string[] = [];
  await page.route('**/api/sounds?*', route => {
    requests.push(new URL(route.request().url()).searchParams.get('name')!);
    return route.fulfill({ status: 503 });
  });
  await page.goto('/');
  const camera = await openCamera(page, 1);
  await camera.getByRole('button', { name: 'Take photo' }).click();
  await expect(camera).toBeHidden();
  const actor = page.locator('[data-performer="Computer keyboard"] img');
  await expect(actor).toHaveAttribute('src', /\/drawings\/keyboard\.svg$/);
  expect(requests).toEqual(['computer keyboard']);
});

test('closing the camera during recognition discards the result and releases the camera', async ({ page }) => {
  let pending: Route | undefined;
  await page.route('**/api/identify', route => { pending = route; });
  await page.goto('/');
  const camera = await openCamera(page, 4);
  const shutter = camera.getByRole('button', { name: 'Take photo' });
  await expect(shutter).toBeEnabled();
  const track = await camera.locator('video').evaluateHandle((video: HTMLVideoElement) =>
    (video.srcObject as MediaStream).getVideoTracks()[0]);
  await shutter.click();
  await expect.poll(() => !!pending).toBe(true);
  await expect(shutter).toBeDisabled();
  await camera.getByRole('button', { name: 'Close camera' }).click();
  await pending!.fulfill({ json: { name: 'drum' } });
  await expect.poll(() => track.evaluate(track => track.readyState)).toBe('ended');
  await expect(page.getByRole('button', { name: 'Add an object to slot 4' })).toBeFocused();
  await expect(page.locator('[data-performer]')).toHaveCount(0);
});

test.describe('camera with phone motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('requests motion on the shutter tap after camera access', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(DeviceMotionEvent, 'requestPermission', { value: () => {
        document.documentElement.dataset.motionGesture = String(navigator.userActivation.isActive);
        return Promise.resolve('denied');
      } });
    });
    await page.route('**/api/identify', route => route.fulfill({ json: { name: 'bell' } }));
    await page.goto('/');
    const camera = await openCamera(page, 2);
    const shutter = camera.getByRole('button', { name: 'Take photo' });
    await expect(shutter).toBeEnabled();
    const root = page.locator('html');
    await expect(root).not.toHaveAttribute('data-motion-gesture', /.+/);
    await camera.getByRole('button', { name: 'Close camera' }).tap();
    await openCamera(page, 2);
    await shutter.tap();
    await expect(root).toHaveAttribute('data-motion-gesture', 'true');
    await expect(page.getByRole('button', { name: 'Solo Bell' })).toBeVisible();
  });
});
