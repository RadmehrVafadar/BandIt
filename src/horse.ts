import { BAR_STEPS, PHRASE } from './music.ts';
import type { Hit, Sample } from './music.ts';

let hooves: Sample | undefined;
let pluck: Sample | undefined;

export function horsePluck(): Sample {
  if (pluck) return pluck;
  const rate = 24000;
  const samples = new Float32Array(rate * .48);
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const phase = 2 * Math.PI * 130.8128 * t;
    const body = .35 * Math.sin(phase) + .16 * Math.sin(phase * 2) * Math.exp(-6 * t);
    const attack = .12 * Math.sin(phase * 3) + .08 * Math.sin(phase * 5);
    samples[i] = (body + attack * Math.exp(-24 * t)) * Math.exp(-8 * t)
      * Math.min(1, t / .005, (samples.length - 1 - i) / (rate * .02));
  }
  pluck = { rate, samples };
  return pluck;
}

export function hoofbeats(): Sample {
  if (hooves) return hooves;
  const rate = 44100;
  const samples = new Float32Array(Math.round(.22 * rate));
  let seed = 27;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const second = t >= .096;
    const age = second ? t - .096 : t;
    const phase = 2 * Math.PI * age * (second ? 184 : 213);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const knock = .38 * Math.sin(phase) + .22 * Math.sin(phase * 2.73) + .13 * Math.sin(phase * 5.18);
    const grit = .18 * (seed / 2147483648 - 1) * Math.exp(-185 * age);
    samples[i] = (knock * Math.exp(-63 * age) + grit) * (second ? .75 : 1)
      * Math.min(1, age / .0012, (samples.length - 1 - i) / (rate * .008));
  }
  hooves = { samples, rate, preserveRecording: true };
  return hooves;
}

export function horseCallSteps(events: readonly Hit[], horseIndex: number, horseCount: number, ensembleSize: number) {
  const calls = new Set<number>();
  const barsApart = Math.max(horseCount, ensembleSize > 1 ? 2 : 1);
  for (let bar = horseIndex; bar < PHRASE / BAR_STEPS; bar += barsApart) {
    const first = events.find(([step]) => Math.floor(step / BAR_STEPS) === bar);
    if (first) calls.add(first[0]);
  }
  return calls;
}
