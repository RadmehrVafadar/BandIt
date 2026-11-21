import type { Sample } from './music.ts';

const demoNames = new Set(['keys', 'drum', 'cup']);

export async function objectSound(name: string, context: AudioContext): Promise<Sample> {
  const label = name.toLowerCase();
  let response: Response | undefined;
  if (demoNames.has(label)) {
    response = await fetch(import.meta.env.BASE_URL + 'demo-sounds/' + label + '.mp3');
  }
  if (!response?.ok || !response.headers.get('content-type')?.startsWith('audio/')) {
    response = await fetch(import.meta.env.BASE_URL + 'api/sounds?name=' + encodeURIComponent(label), {
      method: 'POST', headers: { 'x-pocket-band': '1' }, signal: AbortSignal.timeout(25000),
    });
  }
  if (!response.ok) throw new Error('Sound unavailable');
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
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
