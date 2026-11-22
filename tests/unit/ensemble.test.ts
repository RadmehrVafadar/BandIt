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
  const hook = players.get(original.id);
  assert.ok(hook && 'stem' in hook);
  assert.equal(hook.voice, 'bell');
  assert.equal(hook.stem, loops.get('hook'));
  assert.equal(hook.accent, undefined);
  assert.equal(hook.solo.sample, original.sample);
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

test('Pool keeps its water sound when its part changes in a band', () => {
  const pool: Instrument = { id: 'pool', name: 'Pool', kind: 'cup', role: 'cup', sample: tap };
  const cup: Instrument = { id: 'cup', name: 'Cup', kind: 'cup', role: 'cup', sample: { ...tap } };
  const bank = new Map([pool, cup].map(item => [item.id, item]));
  for (const slots of [[pool.id], [pool.id, cup.id]]) {
    const { players } = buildEnsemble(slots, bank, loops);
    const player = players.get(pool.id);
    assert.ok(player && 'solo' in player);
    assert.equal(player.solo.sample, pool.sample);
    assert.notEqual(player.solo.sample, player.stem);
  }
});

test('additional bells share a rhythm and play their samples without duplicating a stem', () => {
  const bells = Array.from({ length: 8 }, (_, index): Instrument => ({
    id: 'bell-' + index, name: 'Bell', kind: 'bell', role: 'bell', sample: { ...tap },
  }));
  const bank = new Map(bells.map(item => [item.id, item]));
  const slots = bells.map(item => item.id);
  const original = buildEnsemble(slots.slice(0, 4), bank, loops);
  const expanded = buildEnsemble(slots, bank, loops, original.parts);
  assert.equal(expanded.players.size, bells.length);
  for (const [id, part] of original.parts) {
    assert.equal(expanded.parts.get(id), part);
    assert.deepEqual(expanded.players.get(id), original.players.get(id));
  }
  for (const bell of bells.slice(4)) {
    const layer = expanded.players.get(bell.id);
    assert.ok(layer && 'solo' in layer);
    assert.equal(layer.stem, undefined);
    assert.equal(layer.accent?.sample, bell.sample);
    assert.ok(layer.accent?.steps.size);
  }
});
