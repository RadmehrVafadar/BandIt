import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createBeatboxPack } from '../../src/beatbox.ts';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });

async function openPhone(page: Page, permission: 'granted' | 'denied') {
  await page.addInitScript(permission => {
    Object.defineProperty(navigator, 'platform', { value: 'iPhone' });
    Object.defineProperty(Screen.prototype, 'orientation', { configurable: true, value: { angle: 0 } });
    window.addEventListener('devicemotion', event => {
      if (event.isTrusted) event.stopImmediatePropagation();
    }, true);
    const motion = window.DeviceMotionEvent ?? class extends Event {};
    Object.defineProperty(window, 'DeviceMotionEvent', { configurable: true, value: motion });
    Object.defineProperty(motion, 'requestPermission', { configurable: true, value: () => {
      document.documentElement.dataset.gesture = String(navigator.userActivation?.isActive);
      return Promise.resolve(permission);
    } });
    const sounds: number[] = [];
    Object.assign(window, { sounds });
    if (!window.AudioBufferSourceNode) return;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer && this.buffer.length > 1) sounds.push(this.buffer.length);
      return start.apply(this, args);
    };
  }, permission);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add an object to slot 1' })).toBeEnabled();
  return page.getByRole('button', { name: 'Tilt to play' });
}

function tilt(page: Page, x: number | null, y: number | null) {
  return page.evaluate(({ x, y }) => {
    const event = Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x, y, z: -9.8 } });
    window.dispatchEvent(event);
  }, { x, y });
}

async function addKick(page: Page) {
  await page.getByRole('button', { name: 'Add an object to slot 2' }).tap();
  await page.getByRole('button', { name: 'Add Lip Kick' }).tap();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  return page.locator('[data-performer="Lip Kick"]');
}

function playedSounds(page: Page) {
  return page.evaluate(() => (window as unknown as { sounds: number[] }).sounds);
}

test('iPhone motion plays the object once at each wall and freezes on pause', async ({ page }) => {
  test.skip(!await page.evaluate(() => 'AudioContext' in window), 'This browser build has no Web Audio output.');
  const button = await openPhone(page, 'granted');
  const kick = await addKick(page);
  await expect(page.locator('html')).toHaveAttribute('data-gesture', 'true');
  await page.waitForTimeout(550);
  expect(await playedSounds(page)).toEqual([]);
  await tilt(page, 0, 0);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  const start = await kick.boundingBox();
  await page.waitForTimeout(550);
  expect(await kick.boundingBox()).toEqual(start);
  expect(await playedSounds(page)).toEqual([]);

  const kickLength = createBeatboxPack('/')[0].sample.samples.length;
  await tilt(page, 9.8, 0);
  await expect.poll(async () => {
    const box = (await kick.boundingBox())!;
    return Math.round(box.x + box.width);
  }).toBe(390);
  await page.waitForTimeout(550);
  expect(await playedSounds(page)).toEqual([kickLength]);

  await page.getByRole('button', { name: 'Pause', exact: true }).tap();
  const paused = await kick.boundingBox();
  await tilt(page, -18, 0);
  await page.waitForTimeout(300);
  expect(await kick.boundingBox()).toEqual(paused);
  expect(await playedSounds(page)).toEqual([kickLength]);
  await page.setViewportSize({ width: 320, height: 568 });
  const resized = (await kick.boundingBox())!;
  expect(resized.x + resized.width).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await expect.poll(async () => Math.round((await kick.boundingBox())!.x)).toBe(0);
  expect(await playedSounds(page)).toEqual([kickLength, kickLength]);
});

test('a usable sensor automatically enables motion and rotates its axes with the screen', async ({ page }) => {
  test.skip(!await page.evaluate(() => 'AudioContext' in window), 'This browser build has no Web Audio output.');
  const button = await openPhone(page, 'granted');
  await tilt(page, null, null);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await tilt(page, 0, 0);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => Object.defineProperty(screen.orientation, 'angle', { value: 90 }));
  const kick = await addKick(page);
  await tilt(page, 9.8, 0);
  await expect.poll(async () => Math.round((await kick.boundingBox())!.y)).toBe(0);
  expect(await playedSounds(page)).toHaveLength(1);
});

test('denying motion permission keeps beat playback available', async ({ page }) => {
  const button = await openPhone(page, 'denied');
  const canPlay = await page.evaluate(() => 'AudioContext' in window);
  if (canPlay) await addKick(page);
  else await button.tap();
  await expect(page.getByText(/motion access was denied/i)).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  if (canPlay) await expect.poll(async () => (await playedSounds(page)).length).toBeGreaterThan(0);
});

test('a permission grant without sensor data falls back to the beat and accepts a later reading', async ({ page }) => {
  const button = await openPhone(page, 'granted');
  await button.tap();
  await tilt(page, null, null);
  await expect(page.getByText(/motion data is unavailable/i)).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await tilt(page, 0, 0);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
});
