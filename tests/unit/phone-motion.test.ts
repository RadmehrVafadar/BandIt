import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceLooseAxis } from '../../src/phone-motion.ts';

test('landing exactly on either edge registers one impact, even under sustained tilt', () => {
  const elapsed = 1 / 60;
  const speed = 200;
  const free = { position: 0, speed };
  advanceLooseAxis(free, 0, 1000, elapsed);
  const distance = free.position;
  for (const direction of [-1, 1]) {
    const axis = { position: direction < 0 ? distance : 0, speed: direction * speed };
    assert.equal(advanceLooseAxis(axis, 0, distance, elapsed), true);
    assert.equal(advanceLooseAxis(axis, direction * 10, distance, elapsed), false);
    assert.equal(axis.speed, 0);
  }
});
