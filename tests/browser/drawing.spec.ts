import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createBeatboxPack } from '../../src/beatbox.ts';
import { drawingSample } from '../../src/drawing-sounds.ts';
import { hitDelay, loopScore } from '../../src/loop-score.ts';
import { STEP_SECONDS } from '../../src/music.ts';
import { mockAuth0, testAccessToken } from '../fixtures/auth0.ts';

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
const moon = [[[44, 0], [30, 3], [16, 11], [6, 24], [3, 39], [7, 54], [18, 65],
  [33, 71], [49, 70], [60, 64], [45, 63], [32, 55], [24, 44], [21, 31],
  [24, 18], [32, 7], [44, 0]]];
const horse = [
  [[0, 19], [5, 14], [10, 10], [13, 2], [16, 8], [20, 1], [20, 10], [27, 25], [40, 26],
    [53, 24], [58, 27], [61, 33], [62, 45], [65, 47], [66, 38], [65, 29], [62, 25]],
  [[59, 34], [57, 41], [60, 57], [57, 58], [51, 45], [49, 42], [48, 55], [45, 56],
    [45, 42], [30, 42], [26, 41], [25, 56], [22, 56], [21, 42], [19, 56], [16, 56],
    [18, 34], [15, 24], [10, 20], [5, 22], [0, 19]],
];

test('BandIt shows a rotating note and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page).toHaveTitle('BandIt');
  const note = page.getByRole('heading', { name: 'BandIt', exact: true }).locator('.brand-note');
  await expect(note).toHaveCSS('animation-name', 'note-turn');
  await expect(note).toHaveCSS('background-image', /bandit-turntable\.png/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(note).toHaveCSS('animation-name', 'none');
  await expect(note).toHaveCSS('background-image', /bandit-note\.png/);
  await expect(note).toBeVisible();
});

test.beforeEach(async ({ page, baseURL }) => {
  await mockAuth0(page, { returningAt: baseURL });
  // Keep rehearsals and CI deterministic even when a developer has a paid key.
  await page.route('**/demo-sounds/*.mp3', route => route.fulfill({ status: 404 }));
  await page.route('**/api/sounds?*', route => {
    expect(route.request().headers().authorization).toBe('Bearer ' + testAccessToken);
    return route.fulfill({ status: 503 });
  });
});

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

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test('draws white ink to the viewport edges at width ' + viewport.width, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const canvas = page.getByLabel('Draw an object');
    await expect(canvas).toHaveAttribute('data-disabled', 'false');
    expect(await canvas.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
    await expect(canvas).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.getByText(/\bBPM\b|\d\s*\/\s*4 objects|Your mix/i)).toHaveCount(0);
    const emptySlots = page.getByRole('button', { name: /Add an object to slot/ });
    await expect(emptySlots).toHaveCount(4);
    expect(await emptySlots.evaluateAll(buttons => buttons.every(button => {
      const box = button.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, innerHeight - 48) instanceof HTMLCanvasElement;
    }))).toBe(true);
    await expect(page.locator('.beat-rail')).toHaveCount(0);

    for (const y of [3, viewport.height - 3]) {
      await draw(page, [[[0, 0], [12, 0]]], 3, y);
      const ink = await canvas.evaluate((element: HTMLCanvasElement, row) => {
        const scale = element.width / element.clientWidth;
        return [...element.getContext('2d')!.getImageData(Math.floor(8 * scale), Math.floor(row * scale), 1, 1).data];
      }, y);
      expect(ink).toEqual([255, 255, 255, 255]);
    }
    await page.getByRole('button', { name: 'Clear sketch' }).click();
    const slot = page.getByRole('button', { name: 'Add an object to slot 3' });
    await slot.focus();
    await page.keyboard.press('Enter');
    const picker = page.getByRole('dialog', { name: 'Add an object' });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('heading')).toHaveCount(0);
    await expect(slot).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('No saved objects yet.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(slot).toBeFocused();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
}

test('draw keys, hear a floor hit, and layer a drum at the next bar', async ({ page }) => {
  await page.addInitScript(() => {
    const hits: { at: number; start: number; stem: boolean }[] = [];
    const poses: { at: number; gap: number }[] = [];
    let audio: AudioContext | undefined;
    Object.assign(window, { hits, poses });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      audio = this.context as AudioContext;
      if (this.buffer?.duration === 10) {
        const rate = this.buffer.sampleRate;
        const bar = this.buffer.getChannelData(0).subarray(Math.round(offset * rate), Math.round((offset + 2.5) * rate));
        const onset = bar.findIndex(value => Math.abs(value) > .015);
        if (onset >= 0) hits.push({ at: when + onset / rate, start: when, stem: true });
      } else if (this.buffer && Math.abs(this.buffer.duration - .23) < .0001) {
        hits.push({ at: when, start: when, stem: false });
      }
      return start.call(this, when, offset, duration);
    };
    function capturePose() {
      const keys = document.querySelector('[data-performer="Keys"]');
      const canvas = document.querySelector('canvas');
      const timestamp = audio?.getOutputTimestamp();
      if (keys && canvas && timestamp?.performanceTime && timestamp.contextTime !== undefined) {
        const at = timestamp.contextTime + (performance.now() - timestamp.performanceTime) / 1000;
        poses.push({ at, gap: canvas.getBoundingClientRect().bottom - keys.getBoundingClientRect().bottom });
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
  const hitCount = () => page.evaluate(() => (window as unknown as { hits: unknown[] }).hits.length);
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
  await expect(keys.locator('img')).toHaveAttribute('src', /\/drawings\/keys\.svg$/);
  await expect(suggestions).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => {
    const { hits, poses } = window as unknown as {
      hits: { at: number }[]; poses: { at: number; gap: number }[];
    };
    return poses.some(pose => pose.gap < 25 && hits.some(hit => Math.abs(hit.at - pose.at) < 0.045));
  })).toBe(true);

  await expect(keys).toHaveAttribute('data-hit', 'true', { timeout: 5000 });
  await draw(page, drum, 280, 65);
  await suggestions.getByRole('button', { name: 'Use Drum sound' }).click();
  await expect(drums).toHaveAttribute('data-active', 'false');
  await expect(page.getByText('Joins on the next bar', { exact: true })).toBeVisible();
  await expect(drums).toHaveAttribute('data-active', 'true', { timeout: 5000 });
  const drumDrawing = await drums.locator('img').getAttribute('src');
  const barsBeforeDrum = await page.evaluate(firstKeyOffset => {
    const { hits } = window as unknown as { hits: { start: number; stem: boolean }[] };
    return (hits.find(hit => hit.stem)!.start - (hits[0].start - firstKeyOffset)) / 2.5;
  }, loopScore.keys[0][0] * STEP_SECONDS);
  expect(barsBeforeDrum).toBeGreaterThanOrEqual(1);
  expect(barsBeforeDrum).toBeCloseTo(Math.round(barsBeforeDrum), 5);

  await pause.click();
  const frozen = await keys.boundingBox();
  const pausedHits = await hitCount();
  await expect(play).toBeVisible();
  await page.waitForTimeout(250);
  expect(await keys.boundingBox()).toEqual(frozen);
  expect(await hitCount()).toBe(pausedHits);
  await play.click();
  await expect.poll(hitCount).toBeGreaterThan(pausedHits);
  await page.getByRole('button', { name: 'Remove Keys' }).click();
  await expect(keys).toHaveCount(0, { timeout: 5000 });
  await page.reload();
  await expect(play).toBeEnabled();
  await expect(drums).toHaveAttribute('data-active', 'true');
  await expect(drums.locator('img')).toHaveAttribute('src', drumDrawing!);
  const emptyFirstSlot = page.getByRole('button', { name: 'Add an object to slot 1' });
  await page.getByRole('button', { name: 'Add an object to slot 4' }).click();
  const picker = page.getByRole('dialog', { name: 'Add an object' });
  await expect(picker.getByRole('button', { name: 'Add Drum' })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Add Keys' }).click();
  await expect(picker).toBeHidden();
  await expect(emptyFirstSlot).toBeEnabled();
  await page.reload();
  await expect(page.locator('.mix-slot').nth(3).getByRole('button', { name: 'Solo Keys' })).toBeVisible();
  await expect(emptyFirstSlot).toBeEnabled();
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

test('the four + slots place picked objects left to right across the stage', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/?demo');
  const largeKey = key.map(stroke => stroke.map(([x, y]) => [x * 4, y * 4]));
  await draw(page, largeKey, 75, 210);
  await page.getByRole('button', { name: 'Use Keys sound' }).click();
  const keys = page.locator('[data-performer="Keys"]');
  const sketch = (await keys.boundingBox())!;
  expect(sketch.x + sketch.width / 2).toBeCloseTo(201, 0);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Remove Keys' }).click();

  const names = ['Doo Vocal', 'Tss Hat', 'Lip Kick', 'Keys'];
  for (const index of [3, 0, 2, 1]) {
    await page.getByRole('button', { name: 'Add an object to slot ' + (index + 1) }).click();
    await page.getByRole('button', { name: 'Add ' + names[index], exact: true }).click();
  }
  const centers = () => page.locator('[data-performer]').evaluateAll(actors => actors.map(actor => {
    const box = actor.getBoundingClientRect();
    return (box.x + box.width / 2) / innerWidth;
  }));
  const lanes = [.125, .375, .625, .875];
  await expect.poll(centers).toEqual(lanes);
  const placed = (await keys.boundingBox())!;
  expect(placed.y + placed.height / 2).toBeCloseTo(sketch.y + sketch.height / 2, 1);
  await page.reload();
  await page.setViewportSize({ width: 400, height: 800 });
  await expect.poll(centers).toEqual(lanes);
});

test('a beat landing tints the drawing neon and the glow fades on the rebound', async ({ page }) => {
  await page.goto('/?demo');
  await page.getByRole('button', { name: 'Add an object to slot 1' }).click();
  await page.evaluate(() => {
    let pick = 0;
    Math.random = () => (pick++ % 2) / 2;
  });
  await page.getByRole('button', { name: 'Add Lip Kick' }).click();
  const actor = page.locator('[data-performer="Lip Kick"]');
  type Frame = { gap: number; alpha: number; color: string };
  const frames = await actor.evaluate(element => new Promise<Frame[]>(resolve => {
    const frames: Frame[] = [];
    const start = performance.now();
    function sample() {
      const ink = getComputedStyle(element, '::after').backgroundColor;
      const [r, g, b, alpha = 1] = ink.match(/[\d.]+/g)!.map(Number);
      const gap = innerHeight - element.getBoundingClientRect().bottom;
      frames.push({ gap, alpha: Math.max(r, g, b) - Math.min(r, g, b) > 90 ? alpha : 0, color: [r, g, b].join(',') });
      if (performance.now() - start > 2600) resolve(frames);
      else requestAnimationFrame(sample);
    }
    sample();
  }));
  const landing = frames.findIndex(frame => frame.gap < 1 && frame.alpha > .9);
  expect(landing).toBeGreaterThanOrEqual(0);
  const colors = frames.filter(frame => frame.gap < 1 && frame.alpha > .9).map(frame => frame.color);
  expect(new Set(colors).size).toBeGreaterThan(1);
  const rebound = frames.slice(landing + 1);
  const fading = rebound.findIndex(frame => frame.gap > 15 && frame.alpha > .1 && frame.alpha < .8);
  expect(fading).toBeGreaterThanOrEqual(0);
  expect(rebound.slice(fading + 1).some(frame => frame.gap > 15 && frame.alpha === 0)).toBe(true);
  await expect(actor.locator('img')).toHaveCSS('filter', /drop-shadow/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(actor.locator('img')).not.toHaveCSS('filter', /drop-shadow/);
});

test('nearby performers bump sideways without sliding off the stage', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const keys = page.locator('[data-performer="Keys"]');
  const drumActor = page.locator('[data-performer="Drum"]');
  await draw(page, key, 2, 120);
  await page.getByRole('button', { name: 'Use Keys sound' }).click();
  await draw(page, drum, 25, 220);
  await page.getByRole('button', { name: 'Use Drum sound' }).click();
  await expect(drumActor).toHaveAttribute('data-active', 'false');
  const originalX = (await drumActor.boundingBox())!.x;

  await expect(drumActor).toHaveAttribute('data-active', 'true', { timeout: 5000 });
  await expect.poll(async () => (await drumActor.boundingBox())!.x, { timeout: 10000 }).toBeGreaterThan(originalX + 20);
  expect((await keys.boundingBox())!.x).toBeGreaterThanOrEqual(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await drumActor.boundingBox())!.x).toBeCloseTo(originalX, 1);
});

test('a single performer can rebound to either side of its starting slot', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 640 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?demo');
  await page.getByRole('button', { name: 'Add an object to slot 2' }).click();
  await page.evaluate(() => { Math.random = () => .1; });
  await page.getByRole('button', { name: 'Add Lip Kick' }).click();
  const actor = page.locator('[data-performer="Lip Kick"]');
  const slotCenter = 480 * .375;
  const airborneX = () => actor.evaluate(element => {
    const box = element.getBoundingClientRect();
    return innerHeight - box.bottom > 50 ? box.left + box.width / 2 : NaN;
  });
  await expect.poll(airborneX, { intervals: [16] }).toBeLessThan(slotCenter - 12);
  await page.evaluate(() => { Math.random = () => .9; });
  await expect.poll(airborneX, { intervals: [16] }).toBeGreaterThan(slotCenter + 12);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(airborneX).toBeCloseTo(slotCenter, 1);
});

test('four identical bells play distinct parts on the same floor grid', async ({ page }) => {
  await page.goto('/');
  for (const x of [35, 150, 265, 380]) {
    await draw(page, bell, x, 80);
    await page.getByRole('button', { name: 'Use Bell sound' }).click();
  }
  const bells = page.locator('[data-performer="Bell"][data-active=true]');
  await expect(bells).toHaveCount(4);
  const lineup = await bells.evaluateAll(items => items.map(item => item.getAttribute('data-part')));
  const parts = [...lineup].sort();
  expect(parts).toEqual(['backbeat', 'hook', 'motion', 'pulse']);
  const landed = new Set<string>();
  await expect.poll(async () => {
    const hits = await bells.evaluateAll(items => items
      .filter(item => item.getAttribute('data-hit') === 'true')
      .map(item => item.getAttribute('data-part')!));
    for (const part of hits) landed.add(part);
    return [...landed].sort();
  }, { intervals: [40] }).toEqual(parts);
  await page.reload();
  await expect(bells).toHaveCount(4);
  expect(await bells.evaluateAll(items => items.map(item => item.getAttribute('data-part')))).toEqual(lineup);
});

test('headphones isolate one object and restore the band and its accompaniment', async ({ page }) => {
  type AudioHit = { voice: 'keys' | 'drum' | 'backing'; buffer: number; audible: boolean };
  await page.addInitScript(() => {
    const audioHits: AudioHit[] = [];
    const soloTargets: Partial<Record<AudioHit['voice'], boolean>> = {};
    const voices = new Set<AudioBuffer>();
    Object.assign(window, { audioHits, soloTargets });
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
      if (this instanceof AudioBufferSourceNode && this.buffer && destination instanceof GainNode) {
        const seconds = this.buffer.duration;
        const voice = Math.abs(seconds - .23) < .0001 ? 'keys' : Math.abs(seconds - .34) < .0001 ? 'drum' : 'backing';
        voices.add(this.buffer);
        audioHits.push({ voice, buffer: [...voices].indexOf(this.buffer), audible: destination.gain.value > 0 });
        const setTarget = destination.gain.setTargetAtTime.bind(destination.gain);
        destination.gain.setTargetAtTime = (level, time, decay) => {
          soloTargets[voice] = level > 0;
          return setTarget(level, time, decay);
        };
      }
      return Reflect.apply(connect, this, [destination, ...ports]);
    } as typeof connect;
  });
  const readHits = () => page.evaluate(() => (window as unknown as { audioHits: AudioHit[] }).audioHits);
  async function expectMix(keysAudible: boolean, drumAudible: boolean) {
    for (const [name, audible] of [['Keys', keysAudible], ['Drum', drumAudible]] as const) {
      const opacity = audible ? '1' : /^0\.[1-9]\d*$/;
      await expect(page.locator(`[data-performer="${name}"]`)).toHaveCSS('opacity', opacity);
      await expect(page.getByRole('button', { name: 'Solo ' + name }).locator('.slot-art')).toHaveCSS('opacity', opacity);
    }
    const start = (await readHits()).length;
    const band = keysAudible && drumAudible;
    // Solo must also update stems that were already playing when the button was pressed.
    await expect.poll(() => page.evaluate(() => (window as unknown as {
      soloTargets: Partial<Record<AudioHit['voice'], boolean>>;
    }).soloTargets)).toMatchObject({ backing: band });
    await expect.poll(async () => {
      const hits = (await readHits()).slice(start);
      const audible = hits.filter(hit => hit.audible);
      if (band) return new Set(audible.map(hit => hit.buffer)).size >= 2 && audible.every(hit => hit.voice === 'backing');
      return audible.length > 0 && audible.every(hit => hit.voice === (keysAudible ? 'keys' : 'drum'))
        && hits.some(hit => hit.voice === 'backing' && !hit.audible);
    }, { timeout: 6500 }).toBe(true);
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

  await keysSolo.locator('.solo-icon').click();
  await expect(keysSolo).toHaveAttribute('aria-pressed', 'true');
  await expectMix(true, false);
  await drumSolo.hover();
  await page.mouse.down();
  await expect(drumSolo).toHaveAttribute('aria-pressed', 'true');
  await expectMix(false, true);
  await page.mouse.move(15, 200);
  await page.mouse.up();
  await expect(keysSolo).toHaveAttribute('aria-pressed', 'true');
  await expectMix(true, false);
  await drumSolo.click();
  await expect(keysSolo).toHaveAttribute('aria-pressed', 'false');
  await expect(drumSolo).toHaveAttribute('aria-pressed', 'true');
  await expectMix(false, true);
  await drumSolo.click();
  await expect(drumSolo).toHaveAttribute('aria-pressed', 'false');
  await expectMix(true, true);

  await drumSolo.press('Enter');
  await expect(drumSolo).toHaveAttribute('aria-pressed', 'true');
  await keysSolo.focus();
  await page.keyboard.down('Space');
  await expect(keysSolo).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(550);
  await page.keyboard.up('Space');
  await expect(drumSolo).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Remove Drum' }).click();
  await expect(drumSolo).toHaveAttribute('aria-pressed', 'false');
  await expect(drumSolo).toBeDisabled();
  await expect(drumSolo).toHaveCount(0);
  const removed = (await readHits()).length;
  await expect.poll(async () => (await readHits()).length - removed, { timeout: 6500 }).toBeGreaterThanOrEqual(2);
  expect((await readHits()).slice(removed).every(hit => hit.voice === 'keys' && hit.audible)).toBe(true);
});

test.describe('touch drawing', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

  test('a held touch keeps its ink when the browser interrupts the stroke', async ({ page }) => {
    await page.goto('/');
    const canvas = page.getByLabel('Draw an object', { exact: true });
    await expect(canvas).toHaveAttribute('data-disabled', 'false');
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y: 360 }] });
    await page.waitForTimeout(650);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 360 }] });
    const middleOfStroke = () => canvas.evaluate((element: HTMLCanvasElement) => {
      const scale = element.width / element.clientWidth;
      return element.getContext('2d')!.getImageData(Math.round(130 * scale), Math.round(360 * scale), 1, 1).data[3];
    });
    expect(await middleOfStroke()).toBe(255);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await touch.detach();
    expect(await middleOfStroke()).toBe(255);
    await expect(page.getByRole('group', { name: 'Sound suggestions' })).toBeVisible();
    await page.touchscreen.tap(200, 400);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await middleOfStroke()).toBe(255);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await middleOfStroke()).toBe(0);
  });

  test('holding headphones on touch restores the mix on release or cancellation', async ({ page }) => {
    await page.goto('/');
    await draw(page, key, 75, 270, true);
    await page.getByRole('button', { name: 'Use Keys sound' }).click();
    await draw(page, drum, 175, 340, true);
    await page.getByRole('button', { name: 'Use Drum sound' }).click();
    const keysSolo = page.getByRole('button', { name: 'Solo Keys' });
    const other = page.locator('[data-performer="Drum"]');
    await expect(other).toHaveAttribute('data-active', 'true');
    const box = (await keysSolo.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const touch = await page.context().newCDPSession(page);
    for (const end of ['touchEnd', 'touchCancel'] as const) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await expect(keysSolo).toHaveAttribute('aria-pressed', 'true');
      await expect(other).toHaveCSS('opacity', /^0\.[1-9]\d*$/);
      await page.waitForTimeout(550);
      await touch.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] });
      await expect(keysSolo).toHaveAttribute('aria-pressed', 'false');
      await expect(other).toHaveCSS('opacity', '1');
    }
    await touch.detach();
    await keysSolo.tap();
    await expect(keysSolo).toHaveAttribute('aria-pressed', 'true');
  });

  test('swipes through illustrated guesses without choosing a sound', async ({ page }) => {
    await page.goto('/');
    await draw(page, key, 75, 270, true);
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
    await draw(page, key, 75, 270, true);
    // Chromium's raw touch emulation suppresses immediately following tap gestures.
    await page.waitForTimeout(550);
    await page.getByRole('button', { name: 'Use Keys sound' }).tap();
    await expect(keys).toHaveAttribute('data-hit', 'true');
    const position = await keys.boundingBox();
    await draw(page, drum, 175, 340, true);
    await page.waitForTimeout(550);
    await page.getByRole('button', { name: 'Use Drum sound' }).tap();
    await expect(page.locator('[data-performer="Drum"]')).toHaveAttribute('data-active', 'true', { timeout: 5000 });
    expect(await keys.boundingBox()).toEqual(position);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(await page.getByLabel('Draw an object').boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  });
});

test('recognizes a star locally and restores its name and drawing', async ({ page }) => {
  await page.goto('/');
  await draw(page, [[[30, 0], [38, 22], [60, 22], [43, 36], [50, 60], [30, 46],
    [10, 60], [17, 36], [0, 22], [22, 22], [30, 0]]], 100, 80);
  const suggestions = page.getByRole('group', { name: 'Sound suggestions' });
  const star = suggestions.getByRole('button', { name: 'Use Star sound', exact: true });
  await expect(star.locator('img')).toHaveAttribute('src', /\/drawings\/star\.svg$/);
  const illustration = await star.locator('img').getAttribute('src');
  await expect(star.locator('img')).toHaveJSProperty('complete', true);
  expect(await star.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await star.focus();
  await page.keyboard.press('Enter');
  const onstage = page.locator('[data-performer="Star"] img');
  await expect(onstage).toHaveAttribute('src', illustration!);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove Star' })).toBeVisible();
  await expect(onstage).toHaveAttribute('src', illustration!);
});

async function trackNotes(page: Page) {
  type Hit = { at: number; duration: number; speed: number };
  await page.addInitScript(() => {
    const notes: Hit[] = [];
    Object.assign(window, { notes });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
      notes.push({ at: when, duration: this.buffer!.duration, speed: this.playbackRate.value });
      return start.call(this, when, ...rest);
    };
  });
  return () => page.evaluate(() => (window as unknown as { notes: Hit[] }).notes);
}

test('beatbox voices play from fresh slots and restore after reload', async ({ page }) => {
  const notes = await trackNotes(page);
  const soundRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/sounds')) soundRequests.push(request.url());
  });
  const voices = createBeatboxPack('/');
  const slots = [3, 1, 4, 2];
  await page.goto('/');
  const pack = page.getByRole('group', { name: 'Beatbox', exact: true });
  for (const [index, { name }] of voices.entries()) {
    await page.getByRole('button', { name: 'Add an object to slot ' + slots[index] }).click();
    await expect(pack.getByRole('button')).toHaveCount(voices.length - index);
    await pack.getByRole('button', { name: 'Add ' + name, exact: true }).click();
    await expect(page.locator('.mix-slot').nth(slots[index] - 1).getByRole('button', { name: 'Solo ' + name })).toBeVisible();
  }

  const playedAllVoices = async () => {
    const hits = await notes();
    return voices.every(({ sample }) => hits.some(hit => hit.duration === sample.samples.length / sample.rate));
  };
  await expect.poll(playedAllVoices, { timeout: 8000 }).toBe(true);
  await page.reload();
  for (const [index, { name }] of voices.entries()) {
    await expect(page.locator('.mix-slot').nth(slots[index] - 1).getByRole('button', { name: 'Solo ' + name })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(playedAllVoices).toBe(true);
  const vocal = voices.find(voice => voice.role === 'melody')!.sample;
  await expect.poll(async () => (await notes()).some(hit =>
    hit.duration === vocal.samples.length / vocal.rate && hit.speed !== 1)).toBe(true);
  const [firstVocal, nextVocal] = (await notes()).filter(hit => hit.duration === vocal.samples.length / vocal.rate);
  const [[firstStep], [nextStep]] = loopScore.bell;
  expect(nextVocal.at - firstVocal.at).toBeCloseTo((nextStep - firstStep) * STEP_SECONDS
    + hitDelay('bell', nextStep) - hitDelay('bell', firstStep), 5);
  expect((await notes()).some(hit => hit.duration === 10)).toBe(false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Tss Hat' }).click();
  await page.getByRole('button', { name: 'Add an object to slot 4' }).click();
  await expect(pack.getByRole('button')).toHaveCount(1);
  await pack.getByRole('button', { name: 'Add Tss Hat' }).click();
  await expect(page.getByRole('button', { name: 'Solo Tss Hat' })).toBeEnabled();
  await page.getByRole('button', { name: 'Remove Pf Snare' }).click();
  await draw(page, bell, 180, 130);
  await page.getByRole('button', { name: 'Use Bell sound', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Solo Bell' })).toBeEnabled();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await notes()).some(hit => hit.duration === 10)).toBe(true);
  expect(soundRequests).toEqual([]);
});

test('four drawings and their accompaniment share one phrase, including for a returning Original listener', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bandit-playback', 'original');
    const buffers = new Set<AudioBuffer>();
    const scheduled: { time: number; offset: number; duration?: number; voice: number }[] = [];
    let audio: BaseAudioContext | undefined;
    function inStringSwell() {
      const time = scheduled.at(-1)?.time;
      if (!audio || time === undefined) return false;
      const elapsed = audio.currentTime - time;
      return elapsed > .8 && elapsed < 1.4 && scheduled.filter(note => note.time === time).length === 6;
    }
    Object.assign(window, { scheduled, inStringSwell });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (time = 0, offset = 0, duration?: number) {
      audio = this.context;
      if (this.buffer?.duration === 10) buffers.add(this.buffer);
      scheduled.push({ time, offset, duration, voice: [...buffers].indexOf(this.buffer!) });
      return start.call(this, time, offset, duration);
    };
  });
  const notes = () => page.evaluate(() => (window as unknown as {
    scheduled: { time: number; offset: number; duration?: number; voice: number }[];
  }).scheduled);
  const liveRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/sounds')) liveRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Playback style' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Loops|Original)$/ })).toHaveCount(0);
  for (const [index, [name, sketch]] of ([['Drum', drum], ['Keys', key], ['Cup', cup], ['Bell', bell]] as const).entries()) {
    await draw(page, sketch, 40 + index * 115, 90);
    await page.getByRole('button', { name: 'Use ' + name + ' sound', exact: true }).click();
  }
  await page.waitForFunction(() => (window as unknown as { inStringSwell(): boolean }).inStringSwell(),
    undefined, { timeout: 12000 });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const played = await notes();
  expect(liveRequests).toEqual([]);
  const bars = played.filter(note => note.duration !== undefined);
  for (const time of new Set(bars.map(note => note.time))) {
    const notesAtBar = bars.filter(note => note.time === time);
    const stems = notesAtBar.filter(note => note.voice >= 0);
    const bar = Math.round((time - played[0].time) / 2.5) % 4;
    const bass = stems.length >= 2 && bar >= 1;
    const strings = stems.length >= 3 && bar >= 2;
    expect(notesAtBar.length).toBe(stems.length + Number(bass) + Number(strings));
    for (const note of notesAtBar) {
      expect(note.duration).toBe(2.5);
      expect(note.offset).toBeCloseTo(note.voice < 0 ? 0 : bar * 2.5, 5);
    }
  }
  const count = played.length;
  await page.getByRole('button', { name: 'Remove Cup' }).click();
  await expect(page.locator('[data-performer="Cup"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await notes()).length).toBeGreaterThan(count);
  const resumed = (await notes()).slice(count);
  const slice = resumed.filter(note => note.time === resumed[0].time);
  expect(new Set(slice.filter(note => note.voice >= 0).map(note => note.voice)).size).toBe(3);
  const withinBar = slice.find(note => note.voice >= 0)!.offset % 2.5;
  expect(withinBar).toBeGreaterThan(0);
  const backing = slice.filter(note => note.voice < 0);
  expect(backing).toHaveLength(2);
  for (const note of backing) {
    expect(note.offset).toBeCloseTo(withinBar, 5);
    expect(note.duration).toBeCloseTo(2.5 - withinBar, 5);
  }
  await page.reload();
  await expect(page.locator('[data-performer]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await notes())[0]?.duration).toBe(2.5);
});

test('a lone horse plays only its natural call and keeps its voice after reload', async ({ page }) => {
  const notes = await trackNotes(page);
  const generated: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/sounds?name=horse')) generated.push(request.url());
  });
  await page.goto('/');
  await draw(page, horse, 110, 80);
  await page.getByRole('button', { name: 'Use Horse sound', exact: true }).click();
  const calls = async () => (await notes()).filter(hit => hit.duration > 1.4 && hit.duration < 2);
  await expect.poll(async () => (await calls()).length, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  const [first, second] = await calls();
  expect(second.at - first.at).toBeGreaterThanOrEqual(first.duration);
  expect((await notes()).every(hit => hit.duration === first.duration && hit.speed === 1)).toBe(true);
  expect(generated).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await calls())[0]?.duration).toBe(first.duration);
});

test('a horse in a band layers a pitched pluck under its natural call and hoofbeats', async ({ page }) => {
  const notes = await trackNotes(page);
  await page.goto('/');
  await draw(page, horse, 110, 80);
  await page.getByRole('button', { name: 'Use Horse sound', exact: true }).click();
  await page.getByRole('button', { name: 'Add an object to slot 2' }).click();
  await page.getByRole('button', { name: 'Add Lip Kick' }).click();
  await expect.poll(async () => {
    const played = await notes();
    return played.some(call => call.duration > 1.4 && call.duration < 2 && call.speed === 1 &&
      played.some(pluck => pluck.at === call.at && Math.abs(pluck.duration - .48) < .0001));
  }, { timeout: 8000 }).toBe(true);
  await expect.poll(async () => (await notes()).some(note => Math.abs(note.duration - .48) < .0001 && note.speed !== 1),
    { timeout: 6500 }).toBe(true);
});

test('a saved drawing recovers the neigh while a personal recording also named Horse keeps its audio', async ({ page }) => {
  const notes = await trackNotes(page);
  await page.goto('/');
  await expect(page.getByLabel('Draw an object')).toHaveAttribute('data-disabled', 'false');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pocket-band');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['instruments', 'stage'], 'readwrite');
    const store = tx.objectStore('instruments');
    const sample = { samples: Float32Array.from({ length: 800 }, (_, i) => .2 * Math.sin(i / 7)), rate: 8000 };
    store.put({ id: 'drawn', name: 'Horse', kind: 'whistle', role: 'melody', sample });
    store.put({ id: 'recorded', name: 'Horse', role: 'kick', sample: { ...sample, preserveRecording: true } });
    tx.objectStore('stage').put(['drawn', 'recorded', null, null], 'slots');
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await notes()).some(hit => hit.duration > 1.4 && hit.duration < 2 && hit.speed === 1)).toBe(true);
  await expect.poll(async () => (await notes()).some(hit => Math.abs(hit.duration - .1) < .0001)).toBe(true);
});

test('a lone crescent moon plays only its own sample, including after reload', async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer?.duration === 10) {
        Object.assign(window, { hasStem: true });
      } else if (this.buffer) {
        const pcm = this.buffer.getChannelData(0);
        Object.assign(window, { played: [this.playbackRate.value, pcm.length, ...pcm.slice(100, 132)] });
      }
      return start.apply(this, args);
    };
  });
  const played = () => page.evaluate(() => (window as unknown as { played?: number[] }).played);
  await page.goto('/');
  await draw(page, moon, 100, 80);
  await page.getByRole('button', { name: 'Use Moon sound', exact: true }).click();
  await expect.poll(played).toBeDefined();
  const saved = await played();
  const source = drawingSample('moon').samples;
  expect(saved).toEqual([1, source.length, ...source.slice(100, 132)]);
  expect(await page.evaluate(() => !!(window as unknown as { hasStem?: boolean }).hasStem)).toBe(false);
  await page.reload();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(played).toEqual(saved);
  expect(await page.evaluate(() => !!(window as unknown as { hasStem?: boolean }).hasStem)).toBe(false);
});

for (const source of ['demo', 'live']) {
  test(source + ' audio becomes the saved drawing sample', async ({ page }) => {
    const wav = Buffer.alloc(44 + 1600);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(1600, 40);
    for (let i = 0; i < 800; i++) wav.writeInt16LE(Math.round(12000 * Math.sin(i / 7)), 44 + i * 2);
    let requests = 0;
    const name = source === 'live' ? 'Moon' : 'Keys';
    const sketch = source === 'live' ? moon : key;
    const path = source === 'live' ? '**/api/sounds?name=moon' : '**/demo-sounds/keys.mp3';
    await page.route(path, route => {
      requests++;
      return route.fulfill({ contentType: 'audio/wav', body: wav });
    });
    await page.goto('/');
    await draw(page, sketch, 80, 90);
    await page.getByRole('button', { name: 'Use ' + name + ' sound' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    expect(requests).toBe(1);
    const duration = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>(resolve => {
        const request = indexedDB.open('pocket-band');
        request.onsuccess = () => resolve(request.result);
      });
      const items = db.transaction('instruments').objectStore('instruments').getAll();
      return new Promise<number>(resolve => {
        items.onsuccess = () => {
          db.close();
          const { samples, rate } = items.result[0].sample;
          resolve(samples.length / rate);
        };
      });
    });
    expect(duration).toBeCloseTo(0.1, 2);
    if (source === 'live') {
      await page.reload();
      await draw(page, sketch, 80, 90);
      await page.getByRole('button', { name: 'Use ' + name + ' sound' }).click();
      await expect(page.getByRole('button', { name: 'Remove ' + name })).toHaveCount(2);
      expect(requests).toBe(1);
    }
  });
}

test('a Pool sketch requests and caches the swimming-pool sound even with an old ambiguous clip', async ({ page }) => {
  await page.addInitScript(() => {
    Worker.prototype.postMessage = function ({ id }: { id: number }) {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: { id, labels: ['pool'] } })));
    };
  });
  const requested: string[] = [];
  await page.route('**/api/sounds?*', route => {
    requested.push(new URL(route.request().url()).searchParams.get('name')!);
    return route.fulfill({ path: 'public/demo-sounds/cup.mp3', contentType: 'audio/mpeg' });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const cache = await caches.open('bandit-object-audio-v1');
    await cache.put('/object-audio/pool', new Response('old ambiguous take', { headers: { 'Content-Type': 'audio/mpeg' } }));
  });
  await draw(page, [[[0, 0], [40, 0], [40, 20], [0, 20], [0, 0]]], 150, 200);
  await page.getByRole('button', { name: 'Use Pool sound' }).click();
  await expect(page.getByRole('button', { name: 'Solo Pool' })).toBeVisible();
  expect(requested).toEqual(['swimming pool']);
  expect(await page.evaluate(async () => !!await caches.match('/object-audio/swimming%20pool'))).toBe(true);
});

test('a lone saved car recording plays in full without overlapping itself', async ({ page }) => {
  const notes = await trackNotes(page);
  await page.goto('/');
  await expect(page.getByLabel('Draw an object')).toHaveAttribute('data-disabled', 'false');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('pocket-band');
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction(['instruments', 'stage'], 'readwrite');
    const samples = Float32Array.from({ length: 24000 }, (_, i) => .2 * Math.sin(i / 7));
    tx.objectStore('instruments').put({
      id: 'car', name: 'Car', kind: 'drum', role: 'kick',
      sample: { samples, rate: 8000, preserveRecording: true },
    });
    tx.objectStore('stage').put(['car', null, null, null], 'slots');
    await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const engines = async () => (await notes()).filter(note => note.duration === 3);
  await expect.poll(async () => (await engines()).length, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  const [first, next] = await engines();
  expect(next.at - first.at).toBeCloseTo(5);
  expect((await engines()).every(note => note.speed === 1)).toBe(true);
  expect((await notes()).every(note => note.duration === first.duration)).toBe(true);
});

test('a missing recorded stem still plays its ten-second arrangement at 96 BPM', async ({ page }) => {
  const notes = await trackNotes(page);
  await page.route('**/loops/drum.wav', route => route.fulfill({ status: 404 }));
  await page.goto('/');
  await draw(page, drum, 110, 80);
  await page.getByRole('button', { name: 'Use Drum sound', exact: true }).click();
  await page.getByRole('button', { name: 'Add an object to slot 2' }).click();
  await page.getByRole('button', { name: 'Add Tss Hat' }).click();
  const stems = async () => (await notes()).filter(note => note.duration === 10);
  await expect.poll(async () => (await stems()).length, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  const [first, second] = await stems();
  expect(second.at - first.at).toBeCloseTo(2.5, 5);
});

test('keeps basic sounds playable if the classifier cannot load', async ({ page }) => {
  await page.route('**/doodlenet/model.json', route => route.abort());
  await page.goto('/');
  await draw(page, key, 80, 90);
  await expect(page.getByText('Using basic sounds')).toBeVisible();
  await page.getByRole('button', { name: 'Use Keys sound' }).click();
  await expect(page.getByRole('button', { name: 'Remove Keys' })).toBeEnabled();
});
