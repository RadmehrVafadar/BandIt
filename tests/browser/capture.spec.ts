import { expect, test } from '@playwright/test';

test('camera and microphone fixture join the running mix and persist across reload', async ({ page }) => {
  await page.addInitScript(() => {
    const events: { at: number; duration: number }[] = [];
    const levels: number[] = [];
    Object.assign(window, { pocketEvents: events, pocketLevels: levels });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      events.push({ at: when, duration: this.buffer?.duration ?? 0 });
      return start.call(this, when, offset, duration);
    };
    const setValueAtTime = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value, when) {
      levels.push(value);
      return setValueAtTime.call(this, value, when);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const stage = page.getByRole('region', { name: 'The Stage' });
  await expect(stage).toHaveAttribute('data-step', /^[0-9]+$/);
  await page.getByRole('button', { name: 'Add object' }).click();
  await page.getByRole('button', { name: 'Open camera' }).click();
  await page.getByRole('button', { name: 'Take photo' }).click();
  await expect(page.getByAltText('Object preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cutout', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Record sound' }).click();
  await expect(page.getByText('Speakers muted.', { exact: false })).toBeVisible();
  const before = Number(await stage.getAttribute('data-step'));
  await page.getByRole('button', { name: 'Listen' }).click();
  await expect.poll(async () => Number(await stage.getAttribute('data-step'))).toBeGreaterThanOrEqual(before + 10);
  await page.getByRole('button', { name: 'Shaker', exact: true }).click();
  await page.getByLabel('Object name').fill('Keys');
  await page.getByRole('button', { name: 'Save to tray' }).click();
  const startIndex = await page.evaluate(() => (window as unknown as { pocketEvents: unknown[] }).pocketEvents.length);
  const slot = stage.locator('[data-slot="2"]');
  // Queue early in a bar so there is time to observe and cancel it.
  await expect.poll(async () => Number(await stage.getAttribute('data-step')) % 16, { timeout: 4000 }).toBeLessThan(7);
  await slot.click();
  await expect(slot).toHaveAccessibleName('Keys, Queued to join');
  await slot.click();
  await expect(slot).toHaveAccessibleName('Empty slot 3');
  const tray = page.getByRole('region', { name: 'Instrument Tray' });
  await tray.getByRole('button', { name: /Keys/ }).click();
  await slot.click();
  await expect(slot).toHaveAccessibleName('Keys, In the mix', { timeout: 5000 });
  await expect(slot).toHaveAttribute('data-hit', 'true', { timeout: 5000 });
  expect(await page.evaluate(index => {
    const { pocketEvents, pocketLevels } = window as unknown as {
      pocketEvents: { at: number; duration: number }[]; pocketLevels: number[];
    };
    return { captured: pocketEvents.slice(index).some(hit => hit.duration > 0.5), levels: pocketLevels };
  }, startIndex)).toMatchObject({ captured: true, levels: expect.arrayContaining([0, 0.85]) });

  await slot.click();
  await expect(slot).toHaveAccessibleName('Keys, Queued to leave');
  await expect(slot).toHaveAccessibleName('Empty slot 3', { timeout: 5000 });
  await tray.getByRole('button', { name: /Keys/ }).dragTo(slot);
  await expect(slot).toHaveAccessibleName('Keys, In the mix', { timeout: 5000 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(slot).toHaveAccessibleName('Keys, In the mix');
  await expect(stage).toHaveAttribute('data-step', '-1');
});

test('phone layout, denied permissions, upload, and cancel preserve the mixer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.goto('/');
  const stage = page.getByRole('region', { name: 'The Stage' });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Add object' }).click();
  await page.getByRole('button', { name: 'Open camera' }).click();
  await expect(page.getByText('Camera unavailable.', { exact: false })).toBeVisible();
  await page.getByLabel('Upload photo').setInputFiles('public/mug.png');
  await expect(page.getByAltText('Object preview')).toBeVisible();
  await page.getByRole('button', { name: 'Record sound' }).click();
  await expect(page.getByText('Microphone unavailable.', { exact: false })).toBeVisible();
  const before = Number(await stage.getAttribute('data-step'));
  await page.getByRole('button', { name: 'Cancel capture' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await expect.poll(async () => Number(await stage.getAttribute('data-step'))).toBeGreaterThan(before);
  await expect(stage.locator('[data-active="true"]')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('a silent recording can be retried and canceling during recording unmutes', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!constraints?.audio) return original(constraints);
      const silent = new AudioContext();
      await silent.resume();
      const destination = silent.createMediaStreamDestination();
      const constant = silent.createConstantSource();
      constant.offset.value = 0;
      constant.connect(destination);
      constant.start();
      return destination.stream;
    };
    const levels: number[] = [];
    Object.assign(window, { pocketLevels: levels });
    const setValueAtTime = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value, time) {
      levels.push(value);
      return setValueAtTime.call(this, value, time);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Add object' }).click();
  await page.getByRole('button', { name: 'Record sound' }).click();
  await expect(page.getByText('That take was too quiet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Record sound' }).click();
  await expect(page.getByText('Speakers muted.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel capture' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const { pocketLevels } = window as unknown as { pocketLevels: number[] };
    return pocketLevels.slice(-2);
  })).toEqual([0, 0.85]);
});
