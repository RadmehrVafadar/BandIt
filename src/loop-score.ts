import { BAR_STEPS, PHRASE, STEP_SECONDS } from './music.ts';
import type { Hit, Instrument, Part } from './music.ts';

export const LOOP_SECONDS = PHRASE * STEP_SECONDS;
export const chordRoots = [0, -4, 3, -5] as const;

function bars(pattern: (bar: number) => Hit[]): Hit[] {
  return chordRoots.flatMap((_, bar) => pattern(bar).map(([step, level, pitch]): Hit =>
    [bar * BAR_STEPS + step, level, pitch]));
}

export const loopScore = {
  drum: bars(bar => {
    const root = chordRoots[bar];
    const hits: Hit[] = [[0, 1, root], [7, .30, root], [8, .84, root]];
    if (bar % 2 === 1) hits.push([14, .52, root]);
    return hits;
  }),
  keys: bars(bar => {
    const hits: Hit[] = [[2, .90], [6, .56], [10, .77], [14, .50]];
    if (bar === 3) hits.push([15, .28]);
    return hits;
  }),
  cup: bars(bar => {
    const hits: Hit[] = [[4, .88, -2], [12, 1]];
    if (bar % 2 === 1) hits.push([15, .32]);
    return hits;
  }),
  bell: [
    [0, 1, 0], [6, .68, 3], [10, .88, 7], [14, .45, 10],
    [18, .85, 8], [22, .57, 7], [26, .75, 3],
    [32, .95, 0], [38, .68, 3], [42, .88, 7], [45, .65, 12],
    [50, .83, 10], [54, .63, 7], [57, .81, 2], [62, .45, -5],
  ] as Hit[],
};
export type LoopName = keyof typeof loopScore;

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
