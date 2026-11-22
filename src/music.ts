import type { ObjectKind } from './sketch.ts';

export const BPM = 96;
export const BAR_STEPS = 16;
export const STEP_SECONDS = 60 / BPM / 4;

export type Hit = readonly [step: number, level: number, semitones?: number, lengthSteps?: number];

export type Role = 'kick' | 'snare' | 'shaker' | 'melody' | 'bell' | 'cup';
export type Part = 'pulse' | 'backbeat' | 'motion' | 'hook';
export const PHRASE = 4 * BAR_STEPS;

const fit: Record<Role, Record<Part, number>> = {
  kick: { pulse: 10, backbeat: 6, motion: 3, hook: 1 },
  snare: { pulse: 6, backbeat: 10, motion: 5, hook: 1 },
  shaker: { pulse: 2, backbeat: 5, motion: 10, hook: 1 },
  cup: { pulse: 5, backbeat: 9, motion: 7, hook: 4 },
  bell: { pulse: 4, backbeat: 6, motion: 5, hook: 9 },
  melody: { pulse: 2, backbeat: 3, motion: 4, hook: 10 },
};
type Musician = Pick<Instrument, 'id' | 'role'> & { nativePart?: Part };

export function arrange(players: readonly Musician[], previous: ReadonlyMap<string, Part> = new Map()) {
  const chosen = new Map<string, Part>();
  const parts: Part[] = ['pulse', 'hook', 'backbeat', 'motion'];
  // Keep the four recorded instruments on their own stems, including in smaller lineups.
  for (const part of parts) {
    const matches = players.filter(player => player.nativePart === part);
    const owner = matches.find(player => previous.get(player.id) === part) ?? matches[0];
    if (owner) chosen.set(owner.id, part);
  }
  const remaining = players.filter(player => !chosen.has(player.id));
  if (!remaining.length) return chosen;
  const occupied = new Set(chosen.values());
  let best = new Map<string, Part>();
  let bestScore = -Infinity;
  function visit(index: number, total: number, available: Part[]) {
    if (index === remaining.length) {
      if (players.length > 1 && available.includes('pulse')) return;
      if (total > bestScore) {
        bestScore = total;
        best = new Map(chosen);
      }
      return;
    }
    const { id, role } = remaining[index];
    for (const part of available) {
      chosen.set(id, part);
      visit(index + 1, total + fit[role][part] + (previous.get(id) === part ? 1.5 : 0),
        available.filter(other => other !== part));
    }
    chosen.delete(id);
  }
  visit(0, 0, parts.filter(part => !occupied.has(part)));
  return best;
}
export type Sample = { samples: Float32Array; rate: number; preserveRecording?: boolean; articulation?: 'whinny' | 'beatbox' };
export type Position = { x: number; y: number };
export type DrawingSize = { width: number; height: number; aspect: number };
export type Instrument = {
  id: string; name: string; image?: string; kind?: ObjectKind; role: Role; sample: Sample;
  // Freehand drawings supply x. Picker objects use the center of their current slot.
  position?: { x?: number; y: number };
  drawing?: DrawingSize;
};
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

export function bounceHeight(pattern: readonly Hit[], step: number, enteredAt: number) {

  const bar = Math.floor(step / PHRASE) * PHRASE;
  const previous = bar + (pattern.findLast(([beat]) => bar + beat <= step)?.[0] ?? pattern.at(-1)![0] - PHRASE);
  const next = bar + (pattern.find(([beat]) => bar + beat > step)?.[0] ?? PHRASE + pattern[0][0]);
  if (next < enteredAt) return 1;
  if (previous < enteredAt) {
    const firstBar = Math.floor(enteredAt / PHRASE) * PHRASE;
    const first = firstBar + (pattern.find(([beat]) => firstBar + beat >= enteredAt)?.[0] ?? PHRASE + pattern[0][0]);
    const progress = Math.max(0, 1 - (first - step) / 2);
    return 1 - progress ** 2;
  }
  const phase = (step - previous) / (next - previous);
  return 4 * phase * (1 - phase);
}
