import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const key = [
  [[0, 11], [4, 3], [13, 0], [22, 4], [24, 13], [20, 22], [11, 25], [3, 20], [0, 11]],
  [[23, 9], [63, 9], [63, 20], [55, 20], [54, 14], [47, 14], [46, 20], [23, 20]],
];
const drum = [
  [[0, 12], [8, 5], [28, 0], [50, 4], [60, 12], [50, 19], [28, 22], [7, 18], [0, 12]],
  [[0, 12], [3, 42], [13, 49], [32, 52], [51, 47], [60, 39], [60, 12]],
];
const bell = [
  [[0, 48], [15, 36], [21, 12], [33, 3], [43, 9], [52, 37], [63, 48], [0, 48]],
  [[24, 51], [27, 60], [39, 63], [45, 51]],
];
const cup = [
  [[0, 0], [9, 48], [36, 48], [45, 0], [0, 0]], [[42, 9], [60, 9], [63, 21], [42, 33]],
];

async function draw(page: Page, strokes: number[][][], xOffset: number, yOffset: number, touch = false) {
  const canvas = page.getByLabel('Draw an object');
  await expect(canvas).toHaveAttribute('data-disabled', 'false');
  const box = (await canvas.boundingBox())!;
  const touchSession = touch ? await page.context().newCDPSession(page) : undefined;
  for (const stroke of strokes) {
    for (const [index, [x, y]] of stroke.entries()) {
      const point = { x: box.x + xOffset + x, y: box.y + yOffset + y };
      if (touchSession) {
        await touchSession.send('Input.dispatchTouchEvent', {
          type: index === 0 ? 'touchStart' : 'touchMove', touchPoints: [point],
        });
      } else {
        await page.mouse.move(point.x, point.y);
        if (index === 0) await page.mouse.down();
      }
    }
    if (touchSession) await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.up();
  }
  await touchSession?.detach();
}

test('draw keys, hear a floor hit, and layer a drum at the next bar', async ({ page }) => {
  await page.addInitScript(() => {
    const hits: { at: number; duration: number }[] = [];
    const poses: { at: number; gap: number }[] = [];
    let audio: AudioContext | undefined;
    Object.assign(window, { hits, poses });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      audio = this.context as AudioContext;
      hits.push({ at: when, duration: this.buffer?.duration ?? 0 });
      return start.call(this, when, offset, duration);
    };
    function capturePose() {
      const keys = document.querySelector('[data-performer="Keys"]');
      const floor = document.querySelector('.floor');
      const timestamp = audio?.getOutputTimestamp();
      if (keys && floor && timestamp?.performanceTime && timestamp.contextTime !== undefined) {
        const at = timestamp.contextTime + (performance.now() - timestamp.performanceTime) / 1000;
        poses.push({ at, gap: floor.getBoundingClientRect().top - keys.getBoundingClientRect().bottom });
      }
      requestAnimationFrame(capturePose);
    }
    requestAnimationFrame(capturePose);
  });
  await page.goto('/');
  const suggestions = page.getByRole('group', { name: 'Sound suggestions' });
  const play = page.getByRole('button', { name: 'Play', exact: true });
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  const keys = page.locator('[data-performer="Keys"]');
  const drums = page.locator('[data-performer="Drum"]');
  const rail = page.locator('.beat-rail');
  await expect(suggestions).toHaveCount(0);
  await expect(play).toBeDisabled();
  await draw(page, [key[0]], 120, 90);
  await expect(suggestions.getByRole('button')).toHaveCount(8);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(suggestions).toHaveCount(0);
  await draw(page, key, 120, 90);
  await expect(keys).toHaveCount(0);
  await expect(play).toBeDisabled();
  await suggestions.getByRole('button', { name: 'Use Keys sound' }).click();
  await expect(pause).toBeVisible();
  await expect(keys).toHaveAttribute('data-active', 'true');
  await expect(keys.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(suggestions).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => {
    const { hits, poses } = window as unknown as {
      hits: { at: number }[]; poses: { at: number; gap: number }[];
    };
    return poses.some(pose => pose.gap < 25 && hits.some(hit => Math.abs(hit.at - pose.at) < 0.045));
  })).toBe(true);

  await expect.poll(async () => Number(await rail.getAttribute('data-step')) % 16, { timeout: 5000 }).toBeLessThan(6);
  await draw(page, drum, 280, 65);
  await suggestions.getByRole('button', { name: 'Use Drum sound' }).click();
  await expect(drums).toHaveAttribute('data-active', 'false');
  await expect(page.getByText('Joins on the next bar', { exact: true })).toBeVisible();
  await expect(drums).toHaveAttribute('data-active', 'true', { timeout: 5000 });
  const drumDrawing = await drums.locator('img').getAttribute('src');
  expect(await page.evaluate(() => {
    const { hits } = window as unknown as { hits: { at: number; duration: number }[] };
    const firstDrum = hits.find(hit => hit.duration > 0.3)!;
    return Math.round((firstDrum.at - hits[0].at) / 0.15) % 16;
  })).toBe(14);

  await pause.click();
  const frozen = await keys.boundingBox();
  const pausedStep = await rail.getAttribute('data-step');
  await expect(play).toBeVisible();
  await page.waitForTimeout(250);
  expect(await keys.boundingBox()).toEqual(frozen);
  await expect(rail).toHaveAttribute('data-step', pausedStep!);
  await play.click();
  await expect.poll(async () => Number(await rail.getAttribute('data-step'))).toBeGreaterThan(Number(pausedStep));
  await page.getByRole('button', { name: 'Remove Keys' }).click();
  await expect(keys).toHaveCount(0, { timeout: 5000 });
  await page.reload();
  await expect(play).toBeEnabled();
  await expect(drums).toHaveAttribute('data-active', 'true');
  await expect(drums.locator('img')).toHaveAttribute('src', drumDrawing!);
  await expect(rail).toHaveAttribute('data-step', '-1');
  await expect(page.getByText('Saved objects')).toBeVisible();
  const originalX = (await drums.boundingBox())!.x;
  await page.setViewportSize({ width: 750, height: 840 });
  expect((await drums.boundingBox())!.x).not.toBe(originalX);
});

test('four distinct sounds fill the stage and removing a layer frees room', async ({ page }) => {
  await page.goto('/');
  const sketches = [key, drum, bell, cup];
  for (const [index, strokes] of sketches.entries()) {
    await draw(page, strokes, 40 + index * 115, 90 + index * 12);
    await page.getByRole('group', { name: 'Sound suggestions' }).getByRole('button').first().click();
  }
  await expect(page.locator('[data-active=true]')).toHaveCount(4, { timeout: 5000 });
  await expect(page.getByText('The mix is full.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Bell' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Remove Cup' })).toBeEnabled();
  await page.getByRole('button', { name: 'Remove Bell' }).click();
  await expect(page.getByLabel('Draw an object')).toHaveAttribute('data-disabled', 'false', { timeout: 5000 });
});

test('headphones isolate one object and restore the mix', async ({ page }) => {
  await page.addInitScript(() => {
    const audioHits: { drum: boolean; audible: boolean }[] = [];
    Object.assign(window, { audioHits });
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
      if (this instanceof AudioBufferSourceNode && destination instanceof GainNode) {
        audioHits.push({ drum: (this.buffer?.duration ?? 0) > 0.3, audible: destination.gain.value > 0 });
      }
      return Reflect.apply(connect, this, [destination, ...ports]);
    } as typeof connect;
  });
  const readHits = () => page.evaluate(() => (window as unknown as {
    audioHits: { drum: boolean; audible: boolean }[];
  }).audioHits);
  async function expectMix(keysAudible: boolean, drumAudible: boolean) {
    const start = (await readHits()).length;
    await expect.poll(async () => {
      const hits = (await readHits()).slice(start);
      return hits.some(hit => !hit.drum) && hits.some(hit => hit.drum)
        && hits.every(hit => hit.audible === (hit.drum ? drumAudible : keysAudible));
    }).toBe(true);
  }

  await page.goto('/');
  await draw(page, key, 120, 90);
  await page.getByRole('button', { name: 'Use Keys sound' }).click();
  await draw(page, drum, 280, 65);
  await page.getByRole('button', { name: 'Use Drum sound' }).click();
  const keysSolo = page.getByRole('button', { name: 'Solo Keys' });
  const drumSolo = page.getByRole('button', { name: 'Solo Drum' });
  await expect(keysSolo).toBeVisible();
  await expect(page.getByText('Try drawing', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-performer="Drum"]')).toHaveAttribute('data-active', 'true', { timeout: 5000 });

  await keysSolo.click();
  await expect(keysSolo).toHaveAttribute('aria-pressed', 'true');
  await expectMix(true, false);
  await drumSolo.click();
  await expect(keysSolo).toHaveAttribute('aria-pressed', 'false');
  await expect(drumSolo).toHaveAttribute('aria-pressed', 'true');
  await expectMix(false, true);
  await drumSolo.click();
  await expect(drumSolo).toHaveAttribute('aria-pressed', 'false');
  await expectMix(true, true);

  await drumSolo.click();
  await page.getByRole('button', { name: 'Remove Drum' }).click();
  await expect(drumSolo).toHaveAttribute('aria-pressed', 'false');
  await expect(drumSolo).toBeDisabled();
});

test.describe('touch drawing', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

  test('swipes through illustrated guesses without choosing a sound', async ({ page }) => {
    await page.goto('/');
    await draw(page, key, 75, 80, true);
    const strip = page.locator('.suggestion-strip');
    await expect(strip.getByRole('button')).toHaveCount(8);
    const box = (await strip.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const x = box.x + box.width - 15;
    const y = box.y + box.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const distance of [20, 55, 95, 140]) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - distance, y }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
    await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect(page.locator('[data-performer]')).toHaveCount(0);
  });

  test('recognizes touch strokes and highlights a hit in place', async ({ page }) => {
    await page.goto('/');
    const keys = page.locator('[data-performer="Keys"]');
    await draw(page, key, 75, 80, true);
    // Chromium's raw touch emulation suppresses immediately following tap gestures.
    await page.waitForTimeout(550);
    await page.getByRole('button', { name: 'Use Keys sound' }).tap();
    await expect(keys).toHaveAttribute('data-hit', 'true');
    const position = await keys.boundingBox();
    await draw(page, drum, 175, 175, true);
    await page.waitForTimeout(550);
    await page.getByRole('button', { name: 'Use Drum sound' }).tap();
    await expect(page.locator('[data-performer="Drum"]')).toHaveAttribute('data-active', 'true', { timeout: 5000 });
    expect(await keys.boundingBox()).toEqual(position);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(page.locator('.floor')).toBeInViewport();
  });
});

test('recognizes a star locally and restores its name and drawing', async ({ page }) => {
  await page.goto('/');
  await draw(page, [[[30, 0], [38, 22], [60, 22], [43, 36], [50, 60], [30, 46],
    [10, 60], [17, 36], [0, 22], [22, 22], [30, 0]]], 100, 80);
  const suggestions = page.getByRole('group', { name: 'Sound suggestions' });
  const star = suggestions.getByRole('button', { name: 'Use Star sound', exact: true });
  await expect(star.locator('img')).toHaveAttribute('src', /\/drawings\/star\.svg$/);
  await expect(star.locator('img')).toHaveJSProperty('complete', true);
  expect(await star.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await star.focus();
  await page.keyboard.press('Enter');
  const onstage = page.locator('[data-performer="Star"] img');
  await expect(onstage).toHaveAttribute('src', /^data:image\/png;base64,/);
  const sketch = await onstage.getAttribute('src');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove Star' })).toBeVisible();
  await expect(onstage).toHaveAttribute('src', sketch!);
});

test('keeps basic sounds playable if the classifier cannot load', async ({ page }) => {
  await page.route('**/doodlenet/model.json', route => route.abort());
  await page.goto('/');
  await draw(page, key, 80, 90);
  await expect(page.getByText('Using basic sounds')).toBeVisible();
  await page.getByRole('button', { name: 'Use Keys sound' }).click();
  await expect(page.getByRole('button', { name: 'Remove Keys' })).toBeEnabled();
});
