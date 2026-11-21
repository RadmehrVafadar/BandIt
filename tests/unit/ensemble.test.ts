import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEnsemble } from '../../src/ensemble.ts';
import { loopParts, loopScore } from '../../src/loop-score.ts';
import type { Instrument, Part } from '../../src/music.ts';

const tap = { samples: Float32Array.of(.5), rate: 24000 };
const loops = new Map(loopParts.map(part => [part, { ...tap }]));

test('restoring two bells keeps the saved hook and gives the other bell its own accent', () => {
  const original: Instrument = { id: 'original', name: 'Bell', kind: 'bell', role: 'bell', sample: tap };
  const second = { ...original, id: 'second' };
  const bank = new Map([original, second].map(item => [item.id, item]));
  const savedParts = new Map<string, Part>([[original.id, 'hook']]);
  const { parts, players } = buildEnsemble([second.id, null, 'missing', original.id], bank, loops, savedParts);

  assert.deepEqual(parts, new Map([[original.id, 'hook'], [second.id, 'pulse']]));
  assert.equal(players.size, 2);
  assert.deepEqual(players.get(original.id), { voice: 'bell', stem: loops.get('hook') });
  const pulse = players.get(second.id);
  assert.ok(pulse && 'stem' in pulse);
  assert.equal(pulse.stem, loops.get('pulse'));
  assert.equal(pulse.accent?.sample, second.sample);
  assert.deepEqual(pulse.accent.steps, new Set(loopScore.drum.map(([step]) => step)));
});

test('a preserved drum recording plays over its stem and a beatbox voice plays on its own', () => {
  const drum: Instrument = {
    id: 'drum', name: 'Drum', kind: 'drum', role: 'kick', sample: { ...tap, preserveRecording: true },
  };
  const vocal: Instrument = {
    id: 'vocal', name: 'Doo Vocal', kind: 'whistle', role: 'melody', sample: { ...tap, articulation: 'beatbox' },
  };
  const bank = new Map([drum, vocal].map(item => [item.id, item]));
  const { players } = buildEnsemble([drum.id, vocal.id], bank, loops);

  const pulse = players.get(drum.id);
  assert.ok(pulse && 'stem' in pulse);
  assert.equal(pulse.stem, loops.get('pulse'));
  assert.equal(pulse.accent?.sample, drum.sample);
  assert.deepEqual(players.get(vocal.id), { voice: 'bell', beatbox: vocal.sample });
});
