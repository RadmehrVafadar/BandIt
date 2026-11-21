import { chordRoots } from './loop-score.ts';
import { BAR_STEPS, STEP_SECONDS } from './music.ts';
import type { Sample } from './music.ts';

type Note = readonly [step: number, length: number, semitones: number, level: number];
type Tone = (phase: number, age: number, remaining: number) => number;

// Root and fifth answer the kick. The final B-flat leads back to C.
const bass: Note[][] = [
  [],
  [[2, 5, 0, .09], [10, 3, 7, .06]],
  [[2, 6, 0, .088], [11, 3, 7, .06]],
  [[2, 5, 0, .09], [10, 3, 7, .06], [14, 1.5, 3, .047]],
];

// Voiced around middle C, the strings share B-flat while E-flat falls to D.
const strings: Note[][] = [
  [], [],
  [[4, 11, -2, .029], [5, 10, 3, .022]],
  [[2, 11, -2, .027], [3, 10, 2, .022]],
];

const pluck: Tone = (phase, age, remaining) => {
  const overtones = .43 * Math.sin(2 * phase) + .19 * Math.sin(3 * phase);
  return (Math.sin(phase) + overtones * Math.exp(-6 * age)) * Math.exp(-2.8 * age)
    * Math.min(1, age / .014, remaining / .09);
};

const bow: Tone = (phase, age, remaining) => {
  const vibrato = phase + .14 * Math.sin(2 * Math.PI * 4.8 * age);
  const body = .72 * Math.sin(vibrato) + .27 * Math.sin(2 * vibrato) + .15 * Math.sin(3 * vibrato);
  const swell = Math.min(1, age / .50, remaining / .42);
  return body * swell * swell * (3 - 2 * swell);
};

function renderBar(notes: readonly Note[], tuning: number, tone: Tone): Sample | undefined {
  if (!notes.length) return;
  const rate = 24000;
  const samples = new Float32Array(Math.round(BAR_STEPS * STEP_SECONDS * rate));
  for (const [step, length, semitones, level] of notes) {
    const start = Math.round(step * STEP_SECONDS * rate);
    const end = Math.round((step + length) * STEP_SECONDS * rate);
    const frequency = tuning * 2 ** (semitones / 12);
    for (let i = start; i < end; i++) {
      const age = (i - start) / rate;
      samples[i] += level * tone(2 * Math.PI * frequency * age, age, (end - 1 - i) / rate);
    }
  }
  return { samples, rate };
}

export function renderAccompaniment() {
  const middleC = 261.6256;
  return chordRoots.map((root, bar) => ({
    bass: renderBar(bass[bar], middleC / 4 * 2 ** (root / 12), pluck),
    strings: renderBar(strings[bar], middleC, bow),
  }));
}
