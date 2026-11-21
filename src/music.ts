import type { ObjectKind } from './sketch.ts';

export const BPM = 100;
export const BAR_STEPS = 16;
export const STEP_SECONDS = 60 / BPM / 4;

export type Hit = readonly [step: number, level: number, semitones?: number];

export type Role = 'kick' | 'snare' | 'shaker' | 'melody' | 'bell' | 'cup';
export type Part = 'pulse' | 'backbeat' | 'motion' | 'hook';
export const PHRASE = 4 * BAR_STEPS;

function bars(...patterns: (readonly Hit[])[]): Hit[] {
  return patterns.flatMap((events, bar) =>
    events.map(([step, level, pitch]): Hit => [bar * BAR_STEPS + step, level, pitch]));
}

const snare: Hit[] = [[4, .76], [12, .85]];
const offbeats: Hit[] = [[2, .50], [10, .46], [14, .35]];
// Cm, Ab, Eb, Gm. The hook repeats its opening rhythm over the third chord.
export const score: Record<Part, readonly Hit[]> = {
  pulse: bars([[0, .92, 0], [8, .8, 0]],
    [[0, .92, -4], [8, .8, -4], [14, .55, 3]],
    [[0, .92, 3], [8, .8, 3]],
    [[0, .92, -5], [8, .8, -5], [14, .57, -5]]),
  backbeat: bars(snare, snare, snare, snare),
  motion: bars(offbeats, [[2, .5], [6, .36], [10, .46]], offbeats, [[2, .5], [10, .46]]),
  hook: bars([[3, .76, 0], [6, .64, 3], [11, .72, 7]],
    [[1, .76, 8], [7, .62, 3], [11, .72, 0]],
    [[3, .76, 3], [6, .64, 7], [11, .72, 10]],
    [[1, .76, 7], [6, .64, 10], [9, .72, 2]]),
};

export function phrase(part: Part, solo: boolean): readonly Hit[] {
  if (!solo || part === 'pulse') return score[part];
  return score[part].flatMap((hit, i, events): Hit[] => {
    const downbeat = Math.floor(hit[0] / BAR_STEPS) * BAR_STEPS;
    if (i > 0 && events[i - 1][0] >= downbeat) return [hit];
    const lead: Hit = [downbeat, .82, hit[2]];
    return part === 'hook' ? [lead] : [lead, hit];
  });
}

const fit: Record<Role, Record<Part, number>> = {
  kick: { pulse: 10, backbeat: 6, motion: 3, hook: 1 },
  snare: { pulse: 6, backbeat: 10, motion: 5, hook: 1 },
  shaker: { pulse: 2, backbeat: 5, motion: 10, hook: 1 },
  cup: { pulse: 5, backbeat: 9, motion: 7, hook: 4 },
  bell: { pulse: 4, backbeat: 6, motion: 5, hook: 9 },
  melody: { pulse: 2, backbeat: 3, motion: 4, hook: 10 },
};
export function arrange(players: readonly Pick<Instrument, 'id' | 'role'>[], previous = new Map<string, Part>()) {
  let best = new Map<string, Part>();
  let bestScore = -Infinity;
  const chosen = new Map<string, Part>();
  const parts: Part[] = ['pulse', 'hook', 'backbeat', 'motion'];
  function visit(index: number, total: number, available: Part[]) {
    if (index === players.length) {
      if (players.length > 1 && available.includes('pulse')) return;
      if (total > bestScore) {
        bestScore = total;
        best = new Map(chosen);
      }
      return;
    }
    const { id, role } = players[index];
    for (const part of available) {
      chosen.set(id, part);
      visit(index + 1, total + fit[role][part] + (previous.get(id) === part ? 1.5 : 0),
        available.filter(other => other !== part));
    }
    chosen.delete(id);
  }
  visit(0, 0, parts);
  return best;
}
export type Sample = { samples: Float32Array; rate: number; preserveRecording?: boolean; articulation?: 'whinny' };
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
