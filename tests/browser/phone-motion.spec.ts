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
      const data = document.documentElement.dataset;
      data.motionRequests = String(Number(data.motionRequests ?? 0) + 1);
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
}

function tilt(page: Page, x: number | null, y: number | null) {
  return page.evaluate(({ x, y }) => {
    const event = Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x, y, z: -9.8 } });
    window.dispatchEvent(event);
  }, { x, y });
}

async function addVoice(page: Page, name = 'Lip Kick', slot = 2) {
  await page.getByRole('button', { name: 'Add an object to slot ' + slot }).tap();
  await page.getByRole('button', { name: 'Add ' + name, exact: true }).tap();
  const performer = page.locator('[data-performer="' + name + '"]');
  await expect(performer).toHaveAttribute('data-active', 'true');
  return performer;
}

function flick(page: Page, strength: number) {
  return page.evaluate(strength => {
    for (const x of [strength, 0]) {
      window.dispatchEvent(Object.assign(new Event('devicemotion'), {
        acceleration: { x, y: 0, z: 0 }, accelerationIncludingGravity: { x, y: 0, z: -9.8 },
      }));
    }
  }, strength);
}

function playedSounds(page: Page) {
  return page.evaluate(() => (window as unknown as { sounds: number[] }).sounds);
}

test('iPhone motion plays the object once at each wall and freezes on pause', async ({ page }) => {
  test.skip(!await page.evaluate(() => 'AudioContext' in window), 'This browser build has no Web Audio output.');
  await openPhone(page, 'granted');
  const kick = await addVoice(page);
  await expect(page.locator('html')).toHaveAttribute('data-gesture', 'true');
  await page.waitForTimeout(550);
  expect(await playedSounds(page)).toEqual([]);
  await tilt(page, 0, 0);
  await expect(kick).toHaveAttribute('data-loose', '');
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
  await openPhone(page, 'granted');
  await tilt(page, null, null);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => Object.defineProperty(screen.orientation, 'angle', { value: 90 }));
  const kick = await addVoice(page);
  await tilt(page, 0, 0);
  await expect(kick).toHaveAttribute('data-loose', '');
  await tilt(page, 9.8, 0);
  await expect.poll(async () => Math.round((await kick.boundingBox())!.y)).toBe(0);
  expect(await playedSounds(page)).toHaveLength(1);
});

test('denying motion permission keeps beat playback available', async ({ page }) => {
  await openPhone(page, 'denied');
  const canPlay = await page.evaluate(() => 'AudioContext' in window);
  const kick = await addVoice(page);
  await expect(page.getByText(/motion access was denied/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Motion settings', exact: true })).toHaveCount(0);
  await expect(kick).not.toHaveAttribute('data-loose', '');
  if (canPlay) await expect.poll(async () => (await playedSounds(page)).length).toBeGreaterThan(0);
});

test('a permission grant without sensor data falls back to the beat and accepts a later reading', async ({ page }) => {
  await openPhone(page, 'granted');
  const kick = await addVoice(page);
  await tilt(page, null, null);
  await expect(page.getByText(/motion data is unavailable/i)).toBeVisible();
  await expect(kick).not.toHaveAttribute('data-loose', '');
  await tilt(page, 0, 0);
  await expect(page.getByText(/motion data is unavailable/i)).toBeHidden();
  if (await page.evaluate(() => 'AudioContext' in window)) await expect(kick).toHaveAttribute('data-loose', '');
});

test('one object uses motion without a mode button', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPhone(page, 'granted');
  const toggle = page.getByRole('button', { name: 'Tilt to play' });
  await expect(toggle).toHaveCount(0);
  const kick = await addVoice(page);
  await expect(page.locator('html')).toHaveAttribute('data-gesture', 'true');
  await tilt(page, 0, 0);
  await expect(toggle).toHaveCount(0);
  if (await page.evaluate(() => 'AudioContext' in window)) await expect(kick).toHaveAttribute('data-loose', '');
});

test('a short shake that finishes between frames plays one edge hit', async ({ page }) => {
  test.skip(!await page.evaluate(() => 'AudioContext' in window), 'This browser build has no Web Audio output.');
  await openPhone(page, 'granted');
  const kick = await addVoice(page);
  await tilt(page, 0, 0);
  await expect(kick).toHaveAttribute('data-loose', '');
  await flick(page, 8);
  await expect.poll(() => playedSounds(page), { timeout: 650, intervals: [16, 32] })
    .toEqual([createBeatboxPack('/')[0].sample.samples.length]);
  const box = (await kick.boundingBox())!;
  expect(Math.min(box.x, 390 - box.x - box.width)).toBeCloseTo(0);
  await page.waitForTimeout(150);
  expect(await playedSounds(page)).toHaveLength(1);
});

test('adding a second object starts the band and removing it restores motion', async ({ page }) => {
  test.skip(!await page.evaluate(() => 'AudioContext' in window), 'This browser build has no Web Audio output.');
  await openPhone(page, 'granted');
  const kick = await addVoice(page);
  await tilt(page, 0, 0);
  await expect(kick).toHaveAttribute('data-loose', '');
  await addVoice(page, 'Pf Snare', 1);
  await expect(page.locator('[data-loose]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Motion settings', exact: true })).toHaveCount(0);
  const voices = createBeatboxPack('/').slice(0, 2).map(item => item.sample.samples.length);
  await expect.poll(() => playedSounds(page)).toEqual(expect.arrayContaining(voices));
  await page.getByRole('button', { name: 'Remove Pf Snare' }).tap();
  await tilt(page, 0, 0);
  await expect(kick).toHaveAttribute('data-loose', '');
  const hits = await playedSounds(page);
  await page.waitForTimeout(900);
  expect(await playedSounds(page)).toEqual(hits);
  await expect(page.locator('html')).toHaveAttribute('data-motion-requests', '1');
});

test('restoring a band only requests motion when one object remains', async ({ page }) => {
  test.skip(!await page.evaluate(() => 'AudioContext' in window), 'This browser build has no Web Audio output.');
  await openPhone(page, 'granted');
  await addVoice(page);
  await addVoice(page, 'Pf Snare', 1);
  await expect.poll(() => playedSounds(page)).toContain(createBeatboxPack('/')[1].sample.samples.length);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Solo Pf Snare' })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await expect.poll(() => playedSounds(page)).not.toEqual([]);
  await expect(page.locator('html')).not.toHaveAttribute('data-motion-requests', /.+/);
  await page.getByRole('button', { name: 'Remove Pf Snare' }).tap();
  await expect(page.locator('html')).toHaveAttribute('data-gesture', 'true');
  await tilt(page, 0, 0);
  await expect(page.locator('[data-performer="Lip Kick"]')).toHaveAttribute('data-loose', '');
});

test('motion sliders remember the feel of one object after a reload', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPhone(page, 'granted');
  const settings = page.getByRole('button', { name: 'Motion settings', exact: true });
  await expect(settings).toHaveCount(0);
  await addVoice(page);
  await tilt(page, 0, 0);
  await expect(settings).toBeVisible();
  await settings.tap();
  const panel = page.getByRole('dialog', { name: 'Motion settings' });
  const gravity = panel.getByRole('slider', { name: 'Gravity', exact: true });
  const sensitivity = panel.getByRole('slider', { name: 'Shake sensitivity', exact: true });
  await expect(gravity).toHaveValue('65');
  await expect(sensitivity).toHaveValue('35');
  const bounds = (await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(568);
  const track = (await gravity.boundingBox())!;
  await gravity.tap({ position: { x: track.width * .85, y: track.height / 2 } });
  await sensitivity.tap({ position: { x: track.width * .15, y: track.height / 2 } });
  const savedGravity = await gravity.inputValue();
  const savedSensitivity = await sensitivity.inputValue();
  expect(Number(savedGravity)).toBeGreaterThan(75);
  expect(Number(savedSensitivity)).toBeLessThan(25);
  await expect(panel.getByText(savedGravity + '%', { exact: true })).toBeVisible();
  await expect(panel.getByText(savedSensitivity + '%', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Close motion settings' }).tap();
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => document.elementFromPoint(160, 400)?.tagName)).toBe('CANVAS');

  await page.reload();
  await settings.tap();
  await expect(gravity).toHaveValue(savedGravity);
  await expect(sensitivity).toHaveValue(savedSensitivity);
});

test('both motion sliders change the next shake or tilt during playback', async ({ page }) => {
  test.skip(!await page.evaluate(() => 'AudioContext' in window), 'This browser build has no Web Audio output.');
  await openPhone(page, 'granted');
  const kick = await addVoice(page);
  await tilt(page, 0, 0);
  await expect(kick).toHaveAttribute('data-loose', '');
  const before = await kick.boundingBox();
  const settings = page.getByRole('button', { name: 'Motion settings', exact: true });
  await expect(settings).toBeVisible();
  await settings.tap();
  const sensitivity = page.getByRole('slider', { name: 'Shake sensitivity', exact: true });
  await sensitivity.press('Home');
  await flick(page, 4);
  await page.waitForTimeout(200);
  expect(await kick.boundingBox()).toEqual(before);
  expect(await playedSounds(page)).toEqual([]);

  await sensitivity.press('End');
  await flick(page, 4);
  await expect.poll(() => playedSounds(page)).toEqual([createBeatboxPack('/')[0].sample.samples.length]);
  const box = (await kick.boundingBox())!;
  expect(box.x + box.width).toBeCloseTo(390);

  const gravity = page.getByRole('slider', { name: 'Gravity', exact: true });
  await gravity.press('End');
  await tilt(page, 0, 3);
  await page.waitForTimeout(200);
  expect((await kick.boundingBox())!.y).toBeCloseTo(box.y);
  await gravity.press('Home');
  await expect.poll(async () => (await kick.boundingBox())!.y).toBeLessThan(box.y - 20);
  await expect(page.locator('html')).toHaveAttribute('data-motion-requests', '1');
});

test('unavailable preference storage still allows tuning for the current session', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage is blocked', 'SecurityError'); } });
  });
  await openPhone(page, 'granted');
  await addVoice(page);
  await tilt(page, 0, 0);
  const settings = page.getByRole('button', { name: 'Motion settings', exact: true });
  await settings.tap();
  const gravity = page.getByRole('slider', { name: 'Gravity', exact: true });
  await expect(gravity).toHaveValue('65');
  await gravity.press('Home');
  await page.getByRole('button', { name: 'Close motion settings' }).tap();
  await settings.tap();
  await expect(gravity).toHaveValue('0');
});
