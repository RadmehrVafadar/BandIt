import { hoofbeats } from './horse.ts';
import type { Instrument, Sample } from './music.ts';

const demoNames = new Set(['keys', 'drum', 'cup']);

export async function objectSound(name: string, context: BaseAudioContext): Promise<Sample> {
  const label = name.toLowerCase();
  if (label === 'horse') {
    const response = await fetch(import.meta.env.BASE_URL + 'demo-sounds/horse.wav');
    if (!response.ok) throw new Error('Horse recording unavailable');
    const sample = await decodeSample(await response.arrayBuffer(), context);
    return { ...sample, preserveRecording: true, articulation: 'whinny' };
  }
  if (demoNames.has(label)) {
    const response = await fetch(import.meta.env.BASE_URL + 'demo-sounds/' + label + '.mp3');
    if (!response.ok) throw new Error('Demo clip unavailable');
    return decodeSample(await response.arrayBuffer(), context);
  }
  const cacheKey = import.meta.env.BASE_URL + 'object-audio/' + encodeURIComponent(label);
  const cache = await globalThis.caches?.open('bandit-object-audio-v1').catch(() => undefined);
  let generated = false;
  let response = await cache?.match(cacheKey).catch(() => undefined);
  if (!response?.ok || !response.headers.get('content-type')?.startsWith('audio/')) {
    generated = true;
    response = await fetch(import.meta.env.BASE_URL + 'api/sounds?name=' + encodeURIComponent(label), {
      method: 'POST', headers: { 'x-pocket-band': '1' }, signal: AbortSignal.timeout(25000),
    });
  }
  if (!response.ok) throw new Error('Sound unavailable');
  const encoded = await response.arrayBuffer();
  const sample = await decodeSample(encoded, context);
  if (generated) {
    const clip = new Response(encoded, { headers: { 'Content-Type': response.headers.get('content-type') ?? 'audio/mpeg' } });
    await cache?.put(cacheKey, clip).catch(() => undefined);
  }
  return { ...sample, preserveRecording: true };
}

async function decodeSample(encoded: ArrayBuffer, context: BaseAudioContext): Promise<Sample> {
  const buffer = await context.decodeAudioData(encoded.slice(0));
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  let peak = 0;
  for (const value of mono) peak = Math.max(peak, Math.abs(value));
  if (peak < 0.001) throw new Error('Empty sound');
  const onset = mono.findIndex(value => Math.abs(value) >= peak * 0.025);
  const samples = mono.slice(Math.max(0, onset - Math.round(buffer.sampleRate * 0.002)));
  for (let i = 0; i < samples.length; i++) {
    samples[i] *= 0.78 / peak * Math.min(1, i / 32, (samples.length - 1 - i) / 128);
  }
  return { samples, rate: buffer.sampleRate };
}

export async function restoreHorseSounds(instruments: Instrument[]) {
  const older = instruments.filter(item => item.kind === 'whistle' && item.name === 'Horse' && !item.sample.articulation);
  if (!older.length) return;
  try {
    const whinny = await objectSound('Horse', new OfflineAudioContext(1, 1, 44100));
    for (const item of older) item.sample = whinny;
  } catch {
    for (const item of older) {
      if (!item.sample.preserveRecording) item.sample = hoofbeats();
    }
  }
}
