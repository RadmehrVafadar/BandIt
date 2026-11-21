import { horseCallSteps } from './horse.ts';
import { loopScore, loopVoice, nativePart, signatureSteps } from './loop-score.ts';
import type { LoopName } from './loop-score.ts';
import type { LoopBank } from './loops.ts';
import { arrange } from './music.ts';
import type { Instrument, Part, Sample, Slots } from './music.ts';

export type Accent = { sample: Sample; steps: Set<number> };
type Player = { voice: LoopName } & ({ stem?: Sample; solo: Accent; accent?: Accent } | { beatbox: Sample });
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
  const horses = new Map([...parts.keys()].filter(id => instruments.get(id)!.sample.articulation === 'whinny')
    .map((id, index) => [id, index]));
  const players = new Map<string, Player>();
  const assigned = new Set<Part>();
  for (const [id, part] of parts) {
    const item = instruments.get(id)!;
    const { sample } = item;
    const voice = loopVoice[part];
    const sharesPart = assigned.has(part);
    assigned.add(part);
    if (sample.articulation === 'beatbox') {
      players.set(id, { voice, beatbox: sample });
      continue;
    }

    const events = loopScore[voice];
    const solo = { sample, steps: signatureSteps(events, sample.samples.length / sample.rate) };
    const player: Player = { voice, stem: sharesPart ? undefined : loops.get(part), solo };
    if (sharesPart || nativePart(item) !== part || sample.preserveRecording) {
      const horseIndex = horses.get(id);
      player.accent = horseIndex === undefined ? solo : { sample, steps: horseCallSteps(events, horseIndex, horses.size, parts.size) };
    }
    players.set(id, player);
  }
  return { parts, players };
}
