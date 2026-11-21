import { horseCallSteps } from './horse.ts';
import { loopScore, loopVoice, nativePart, signatureSteps } from './loop-score.ts';
import type { LoopName } from './loop-score.ts';
import type { LoopBank } from './loops.ts';
import { arrange } from './music.ts';
import type { Instrument, Part, Sample, Slots } from './music.ts';

export type Accent = { sample: Sample; steps: Set<number> };
type Player = { voice: LoopName } & ({ stem: Sample; accent?: Accent } | { beatbox: Sample });
type InstrumentBank = ReadonlyMap<string, Instrument>;
export type Ensemble = { parts: ReadonlyMap<string, Part>; players: ReadonlyMap<string, Player> };

export function assignParts(slots: Slots, instruments: InstrumentBank, previous?: ReadonlyMap<string, Part>) {
  const players = slots.flatMap(id => {
    const item = id && instruments.get(id);
    return item ? [{ id: item.id, role: item.role, nativePart: nativePart(item) }] : [];
  });
  return arrange(players, previous);
}

export function buildEnsemble(
  slots: Slots, instruments: InstrumentBank, loops: LoopBank, previous?: ReadonlyMap<string, Part>,
): Ensemble {
  const parts = assignParts(slots, instruments, previous);
  const horses = [...parts.keys()].filter(id => instruments.get(id)!.sample.articulation === 'whinny');
  const players = new Map<string, Player>();
  for (const [id, part] of parts) {
    const item = instruments.get(id)!;
    const { sample } = item;
    const voice = loopVoice[part];
    if (sample.articulation === 'beatbox') {
      players.set(id, { voice, beatbox: sample });
      continue;
    }

    const player: Player = { voice, stem: loops.get(part)! };
    if (nativePart(item) !== part || sample.preserveRecording) {
      const events = loopScore[voice];
      const horseIndex = horses.indexOf(id);
      const steps = horseIndex < 0 ? signatureSteps(events, sample.samples.length / sample.rate)
        : horseCallSteps(events, horseIndex, horses.length, parts.size);
      player.accent = { sample, steps };
    }
    players.set(id, player);
  }
  return { parts, players };
}
