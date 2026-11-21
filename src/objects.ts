import { Bell, CupSoda, Drum, KeyRound, Pencil, createLucideIcon } from 'lucide-react';
import type { Instrument, Position, Role, Sample } from './music.ts';
import type { ObjectKind } from './sketch.ts';

const Whistle = createLucideIcon('Whistle', [
  ['path', { d: 'M3 10h9a5 5 0 1 1 0 5L3 14z', key: 'body' }],
  ['path', { d: 'M15 10h3M4 7l2-3M9 6l.5-3', key: 'details' }],
]);

export const objects = {
  keys: { name: 'Keys', role: 'shaker', Icon: KeyRound },
  drum: { name: 'Drum', role: 'kick', Icon: Drum },
  bell: { name: 'Bell', role: 'bell', Icon: Bell },
  cup: { name: 'Cup', role: 'cup', Icon: CupSoda },
  pencil: { name: 'Pencil', role: 'snare', Icon: Pencil },
  whistle: { name: 'Whistle', role: 'melody', Icon: Whistle },
} satisfies Record<ObjectKind, { name: string; role: Role; Icon: typeof Bell }>;

const durations = { keys: 0.23, drum: 0.34, bell: 0.62, cup: 0.2, pencil: 0.105, whistle: 0.22 };
const tone = (frequency: number, time: number) => Math.sin(2 * Math.PI * frequency * time);

export function objectSample(kind: ObjectKind): Sample {
  const rate = 44100;
  const duration = durations[kind];
  const samples = new Float32Array(Math.round(duration * rate));
  let seed = 17;
  let previous = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const snap = noise - previous * 0.75;
    previous = noise;
    let sound: number;
    switch (kind) {
      case 'keys': {
        const ring = (time: number, frequency: number) => time < 0 ? 0 :
          (0.24 * tone(frequency, time) + 0.15 * tone(frequency * 1.48, time)) * Math.exp(-43 * time);
        sound = ring(t, 1820) + ring(t - 0.021, 2290) + ring(t - 0.049, 2710) + snap * 0.12 * Math.exp(-65 * t);
        break;
      }
      case 'drum':
        sound = 0.87 * tone(52, t + 0.027 * (1 - Math.exp(-60 * t))) * Math.exp(-13 * t);
        break;
      case 'bell':
        sound = 0.45 * tone(659.25, t) * Math.exp(-7 * t) + 0.24 * tone(1770, t) * Math.exp(-16 * t);
        break;
      case 'cup':
        sound = (0.49 * tone(386, t) + 0.25 * tone(838, t)) * Math.exp(-31 * t) + 0.14 * snap * Math.exp(-95 * t);
        break;
      case 'pencil':
        sound = (snap * 0.36 + 0.38 * tone(1331, t)) * Math.exp(-79 * t);
        break;
      case 'whistle':
        sound = (0.52 * tone(523.25, t) + 0.13 * tone(1046.5, t)) * Math.min(1, t * 80) * Math.exp(-9 * t);
    }
    samples[i] = sound * Math.min(1, i / 60, (samples.length - 1 - i) / 270);
  }
  return { samples, rate };
}

export function createObject(kind: ObjectKind, position: Position): Instrument {
  const { name, role } = objects[kind];
  return { id: crypto.randomUUID(), kind, name, role, position, sample: objectSample(kind) };
}
