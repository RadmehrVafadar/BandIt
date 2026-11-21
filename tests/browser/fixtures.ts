import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createFixtures() {
  const directory = mkdtempSync(join(tmpdir(), 'pocket-band-'));
  const camera = join(directory, 'object.y4m');
  const microphone = join(directory, 'shake.wav');
  const width = 96;
  const height = 96;
  const luma = Buffer.alloc(width * height, 222);
  const blue = Buffer.alloc(width * height / 4, 128);
  const red = Buffer.alloc(width * height / 4, 128);
  for (let y = 28; y < 68; y++) {
    for (let x = 26; x < 70; x++) {
      luma[y * width + x] = 112;
      blue[(y >> 1) * (width >> 1) + (x >> 1)] = 62;
      red[(y >> 1) * (width >> 1) + (x >> 1)] = 178;
    }
  }
  writeFileSync(camera, Buffer.concat([
    Buffer.from('YUV4MPEG2 W96 H96 F30:1 Ip A1:1 C420jpeg\nFRAME\n'), luma, blue, red,
  ]));

  const rate = 48000;
  const audio = Buffer.alloc(44 + rate * 2 * 2);
  audio.write('RIFF', 0);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(rate, 24);
  audio.writeUInt32LE(rate * 2, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(audio.length - 44, 40);
  for (let i = 0; i < rate * 2; i++) {
    const t = (i / rate) % 0.5 - 0.16;
    const hit = t >= 0 && t < 0.13 ? Math.sin(2 * Math.PI * 1430 * t) * Math.exp(-t * 24) : 0;
    audio.writeInt16LE(Math.round(hit * 14000), 44 + i * 2);
  }
  writeFileSync(microphone, audio);
  return { directory, camera, microphone };
}
