import type { Instrument, Role } from './music.ts';

function starter(id: string, name: string, role: Role): Instrument {
  const rate = 44100;
  const samples = new Float32Array(Math.round(rate * (role === 'kick' ? 0.38 : 0.23)));
  let seed = 17;
  let phase = 0;
  let lastNoise = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const snap = noise - lastNoise * 0.65;
    lastNoise = noise;
    phase += 2 * Math.PI * (51 + 102 * Math.exp(-t * 45)) / rate;
    const sound = role === 'kick'
      ? Math.sin(phase) * Math.exp(-t * 13) * 0.88 + snap * Math.exp(-t * 190) * 0.18
      : snap * Math.exp(-t * 24) * 0.48 + Math.sin(2 * Math.PI * 182 * t) * Math.exp(-t * 42) * 0.29;
    samples[i] = sound * Math.min(1, i / 60, (samples.length - 1 - i) / 220);
  }
  return { id, name, role, sample: { samples, rate }, image: import.meta.env.BASE_URL + id + '.png' };
}

export const starters = [starter('mug', 'Mug', 'kick'), starter('pen', 'Pen', 'snare')];
