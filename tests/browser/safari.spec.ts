import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a long press on the canvas leaves the stroke available to finish', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByLabel('Draw an object', { exact: true });
  await expect(canvas).toHaveAttribute('data-disabled', 'false');
  await page.mouse.move(80, 360);
  await page.mouse.down();
  const defaultMenu = await canvas.evaluate(element =>
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  expect(defaultMenu).toBe(false);
  await page.mouse.move(180, 360, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('group', { name: 'Sound suggestions' })).toBeVisible();
  await page.touchscreen.tap(220, 420);
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  const ink = await canvas.evaluate((element: HTMLCanvasElement) => {
    const scale = element.width / element.clientWidth;
    return element.getContext('2d')!.getImageData(Math.round(130 * scale), Math.round(360 * scale), 1, 1).data[3];
  });
  expect(ink).toBe(255);
});

test('plays a drawn sound through the media audio session after a tap', async ({ page }) => {
  test.skip(!await page.evaluate(() => 'AudioContext' in window), 'This browser build has no Web Audio output.');
  await page.addInitScript(() => {
    if (!('audioSession' in navigator)) {
      Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' } });
    }
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
      if (destination !== this.context.destination) return Reflect.apply(connect, this, [destination, ...ports]);
      const meter = this.context.createAnalyser();
      Reflect.apply(connect, this, [meter]);
      Reflect.apply(connect, meter, [destination]);
      const samples = new Float32Array(meter.fftSize);
      function listen() {
        meter.getFloatTimeDomainData(samples);
        if (samples.some(value => Math.abs(value) > 0.01)) {
          document.documentElement.dataset.outputSession = (navigator as Navigator & { audioSession: { type: string } }).audioSession.type;
        } else requestAnimationFrame(listen);
      }
      requestAnimationFrame(listen);
      return destination;
    } as typeof connect;
  });
  await page.route('**/doodlenet/model.json', route => route.abort());
  await page.goto('/');
  const canvas = page.getByLabel('Draw an object', { exact: true });
  await expect(canvas).toHaveAttribute('data-disabled', 'false');
  await page.touchscreen.tap(150, 350);
  await page.getByRole('button', { name: 'Use Bell sound' }).tap();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-output-session', 'playback');
});

test('a webview that defers audio can retry with Play after choosing a sound', async ({ page }) => {
  test.skip(!await page.evaluate(() => 'AudioContext' in window), 'This browser build has no Web Audio output.');
  await page.addInitScript(() => {
    let playTap = false;
    let unlocked = false;
    let release!: () => void;
    const permission = new Promise<void>(resolve => { release = resolve; });
    document.addEventListener('click', event => {
      playTap = (event.target as Element).closest('button')?.textContent.trim() === 'Play';
    }, true);
    window.addEventListener('click', () => { playTap = false; });
    window.AudioContext = class extends AudioContext {
      get state() { return unlocked ? super.state : 'suspended'; }
      async resume() {
        if (playTap) { unlocked = true; release(); }
        await permission;
        return super.resume();
      }
    };
  });
  await page.route('**/doodlenet/model.json', route => route.abort());
  await page.goto('/');
  await expect(page.getByLabel('Draw an object', { exact: true })).toHaveAttribute('data-disabled', 'false');
  await page.touchscreen.tap(150, 350);
  await page.getByRole('button', { name: 'Use Drum sound' }).tap();
  await expect(page.getByRole('button', { name: 'Solo Drum' })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});
