import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loopVoice } from '../src/loop-score.ts';
import type { LoopName } from '../src/loop-score.ts';
import type { Sample } from '../src/music.ts';
import { objectSample } from '../src/objects.ts';
import { renderLoop } from '../src/render-loop.ts';

const rate = 24000;

async function loadClips() {
  const browser = await chromium.launch({ executablePath: process.env.BANDIT_CHROME });
  try {
    const page = await browser.newPage();
    const clips = { bell: objectSample('bell') } as Record<LoopName, Sample>;
    for (const name of ['drum', 'keys', 'cup'] as const) {
      const mp3 = await readFile('public/demo-sounds/' + name + '.mp3');
      const pcm = await page.evaluate(async ({ encoded, rate }) => {
        const context = new OfflineAudioContext(1, 1, rate);
        const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const audio = await context.decodeAudioData(bytes.buffer);
        return Array.from(audio.getChannelData(0));
      }, { encoded: mp3.toString('base64'), rate });
      const peak = pcm.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      if (!peak) throw new Error('Silent source clip: ' + name);
      // Start the keyring on a clear metallic strike, past the quieter handling noise.
      const onset = pcm.findIndex(value => Math.abs(value) >= peak * (name === 'keys' ? .7 : .025));
      const leadIn = name === 'keys' ? .008 : .002;
      const strike = pcm.slice(Math.max(0, onset - Math.round(leadIn * rate)));
      clips[name] = { samples: Float32Array.from(strike, value => value * .78 / peak), rate };
    }
    return clips;
  } finally {
    await browser.close();
  }
}

async function writeWav(path: string, pcm: Float32Array) {
  const wav = Buffer.alloc(44 + pcm.length * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(2 * rate, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length * 2, 40);
  pcm.forEach((value, i) => {
    if (!Number.isFinite(value) || Math.abs(value) > 1) throw new Error('Invalid level in ' + path);
    wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  });
  await writeFile(path, wav);
}

const clips = await loadClips();
await mkdir('public/loops', { recursive: true });
for (const name of Object.values(loopVoice)) {
  const loop = renderLoop(name, clips[name]);
  await writeWav('public/loops/' + name + '.wav', loop.samples);
}
