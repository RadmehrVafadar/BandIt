import { BAR_STEPS, PHRASE, STEP_SECONDS } from './music.ts';
import type { Hit, Instrument, Part } from './music.ts';

export const LOOP_SECONDS = PHRASE * STEP_SECONDS;
// Bass roots relative to C2 and the cup's two ringing pitches relative to C4.
export const chords = [
  { root: 0, cup: [3, 10] },  // Cm7: Eb, Bb
  { root: -4, cup: [3, 7] },  // Abmaj7: Eb, G
  { root: 3, cup: [0, 7] },   // Eb6: C, G
  { root: -5, cup: [-1, 5] }, // G7: B, F
] as const;

function phrase(...bars: Hit[][]): Hit[] {
  return bars.flatMap((hits, bar) => hits.map(([step, ...note]): Hit => [bar * BAR_STEPS + step, ...note]));
}

// Kick and bass share a stage slot. The bass answers between the drum landings.
// Each note gives its sixteenth, velocity, semitones above C2, and length in sixteenths.
export const bassLine = [
  [0, .90, chords[0].root, 3.3], [6, .63, 7, 1.25], [10, .81, 10, 2.7], [14, .54, 7, 1.15],
  [16, .94, chords[1].root, 4.4], [22, .68, 3, 1.5], [26, .82, 0, 3.25],
  [32, .91, chords[2].root, 3.3], [38, .65, 10, 1.25], [41, .79, 7, 2.3], [46, .57, -2, 1.2],
  [48, .95, chords[3].root, 4.2], [54, .69, 2, 1.4], [58, .76, 5, 2.4], [62, .60, -1, 1.65],
] as const;

export const loopScore = {
  drum: phrase(
    [[0, 1], [7, .39], [10, .85]],
    [[0, .96], [6, .63], [8, .88], [15, .32]],
    [[0, 1], [7, .41], [10, .88], [14, .52]],
    [[0, .98], [8, .87], [11, .44]],
  ),
  keys: phrase(
    [[2, .90], [6, .53], [10, .79], [14, .56], [15, .30]],
    [[2, .86], [6, .52], [10, .80], [14, .61]],
    [[2, .92], [6, .54], [11, .75], [13, .32], [14, .64]],
    [[2, .86], [6, .52], [10, .78]],
  ),
  cup: phrase(
    [[4, .85, -2, 1.65], [12, .95, 0, 3.15]],
    [[4, .82, -2, 1.65], [10, .30, 2], [12, .98, 0, 3.45]],
    [[4, .86, -2, 1.65], [12, 1, 0, 2.5], [15, .29, 3]],
    [[4, .83, -2, 1.65], [11, .31, 2], [12, .94, 0, 2.8]],
  ),
  // C-Eb-G calls twice. The second call reaches Bb, then B natural leads back to C.
  bell: phrase(
    [[0, .87, 0, 2.1], [3, .66, 3, .95], [6, .94, 7, 4.6]],
    [[2, .82, 3, 2.2], [5, .63, 0, 1.05], [8, .89, -4, 4.5]],
    [[0, .89, 0, 2.1], [3, .69, 3, .95], [6, .84, 7, 2.45], [10, .96, 10, 4.6]],
    [[2, .82, 5, 2.05], [5, .64, 2, 1.05], [8, .77, -5, 2.4], [13, .70, -1, 2.8]],
  ),
};
export type LoopName = keyof typeof loopScore;

export function hitDelay(name: LoopName, step: number) {
  const swing = step % 2 * STEP_SECONDS * .10;
  return swing + (name === 'cup' && step % BAR_STEPS === 4 ? .008 : 0);
}

export const loopVoice = { pulse: 'drum', motion: 'keys', backbeat: 'cup', hook: 'bell' } as const satisfies Record<Part, LoopName>;
export const loopParts = Object.keys(loopVoice) as Part[];

export function nativePart(item: Pick<Instrument, 'name' | 'kind'>) {
  if (item.kind === item.name.toLowerCase()) return loopParts.find(part => loopVoice[part] === item.kind);
}

// Long sounds get one entrance per bar. Short taps can articulate the whole rhythm.
export function signatureSteps(events: readonly Hit[], seconds: number) {
  const accents = seconds < STEP_SECONDS * 4 ? events : events.filter(([step], index) =>
    index === 0 || Math.floor(step / BAR_STEPS) !== Math.floor(events[index - 1][0] / BAR_STEPS));
  return new Set(accents.map(([step]) => step));
}
