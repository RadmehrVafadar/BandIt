import type { ObjectKind } from './sketch.ts';

export const BPM = 100;
export const BAR_STEPS = 16;
export const STEP_SECONDS = 60 / BPM / 4;

type Hit = readonly [step: number, level: number, semitones?: number];

export const patterns = {
  kick: [[0, 1], [6, 0.78], [8, 0.95], [14, 0.72]],
  snare: [[4, 0.85], [12, 0.95], [15, 0.32]],
  shaker: [[2, 0.75], [4, 0.52], [6, 0.86], [8, 0.53], [10, 0.78], [12, 0.55], [14, 0.94]],
  melody: [[0, 0.75, 0], [3, 0.55, 7], [7, 0.72, 4], [10, 0.65, 12], [14, 0.55, 7]],
  bell: [[5, 0.54], [11, 0.64]],
  cup: [[2, 0.72], [6, 0.46], [9, 0.68], [13, 0.55]],
} satisfies Record<string, Hit[]>;

export type Role = keyof typeof patterns;
export type Sample = { samples: Float32Array; rate: number };
export type Position = { x: number; y: number };
export type DrawingSize = { width: number; height: number; aspect: number };
export type Instrument = { id: string; name: string; image?: string; kind?: ObjectKind; role: Role; sample: Sample; position?: Position; drawing?: DrawingSize };
export type Slots = (string | null)[];
export type Change = { id: string | null; at: number };

export function barBoundary(nextStep: number) {
  return Math.ceil(nextStep / BAR_STEPS) * BAR_STEPS;
}
export function updateQueue(
  slots: Slots, pending: Map<number, Change>, slot: number, id: string | null, nextStep: number,
) {
  if (id === slots[slot]) pending.delete(slot);
  else pending.set(slot, { id, at: barBoundary(nextStep) });
}

export function bounceHeight(role: Role, step: number, enteredAt: number) {
  const pattern = patterns[role];
  const bar = Math.floor(step / BAR_STEPS) * BAR_STEPS;
  const previous = bar + (pattern.findLast(([beat]) => bar + beat <= step)?.[0] ?? pattern.at(-1)![0] - BAR_STEPS);
  const next = bar + (pattern.find(([beat]) => bar + beat > step)?.[0] ?? BAR_STEPS + pattern[0][0]);
  if (next < enteredAt) return 1;
  if (previous < enteredAt) {
    const firstBar = Math.floor(enteredAt / BAR_STEPS) * BAR_STEPS;
    const first = firstBar + (pattern.find(([beat]) => firstBar + beat >= enteredAt)?.[0] ?? BAR_STEPS + pattern[0][0]);
    const progress = Math.max(0, 1 - (first - step) / 2);
    return 1 - progress ** 2;
  }
  const phase = (step - previous) / (next - previous);
  return 4 * phase * (1 - phase);
}
