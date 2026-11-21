import { LOOP_SECONDS, loopParts, loopVoice } from './loop-score.ts';
import type { Part, Sample } from './music.ts';
import { objectSample } from './objects.ts';
import { renderLoop } from './render-loop.ts';

export type LoopBank = ReadonlyMap<Part, Sample>;

export async function loadLoops(): Promise<LoopBank> {
  let context: OfflineAudioContext | undefined;
  return new Map(await Promise.all(loopParts.map(async (part): Promise<[Part, Sample]> => {
    const name = loopVoice[part];
    try {
      context ??= new OfflineAudioContext(1, 1, 24000);
      const response = await fetch(import.meta.env.BASE_URL + 'loops/' + name + '.wav', { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error('Missing loop');
      const audio = await context.decodeAudioData(await response.arrayBuffer());
      if (audio.duration !== LOOP_SECONDS) throw new Error('Invalid loop length');
      return [part, { samples: audio.getChannelData(0), rate: audio.sampleRate }];
    } catch {
      // Keep this part on the same score if its bundled recording can't load.
      return [part, renderLoop(name, objectSample(name))];
    }
  })));
}
