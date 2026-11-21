import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceLooseAxis, createLooseStage } from '../../src/phone-motion.ts';

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

const flat = { x: 0, y: 0, z: -9.8 };
const still = { x: 0, y: 0, z: 0 };

function phone() {
  const properties = new Map<string, string>();
  const actor = {
    parentElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) },
    getBoundingClientRect: () => ({ left: 166, top: 393, width: 58, height: 58 }),
    style: { setProperty: (name: string, value: string) => properties.set(name, value) },
    dataset: { active: 'true' },
  } as unknown as HTMLDivElement;
  const actors = new Map([['Pool', actor]]);
  const stage = createLooseStage();
  const hits: string[] = [];
  function read(total: DeviceMotionEventAcceleration | null, linear: DeviceMotionEventAcceleration | null,
    angle = 0, acceptShake = true) {
    return stage.read({ accelerationIncludingGravity: total, acceleration: linear, interval: 1000 / 60 }, angle, true, acceptShake);
  }
  function move(frames: number, hz: number) {
    for (let i = 0; i < frames; i++) stage.move(actors, 1 / hz, id => hits.push(id));
    return ['--motion-x', '--motion-y'].map(key => parseFloat(properties.get(key)!));
  }
  return { read, move, hits, clearShake: stage.clearShake };
}

test('a short shake and its release between frames still send an object to the wall', () => {
  for (const hz of [30, 60, 120]) {
    const stage = phone();
    // A user's first sensor sample can already be a shake.
    stage.read({ ...flat, x: 7 }, { ...still, x: 7 });
    stage.read(flat, still);
    assert.deepEqual(stage.move(hz / 10, hz), [332, 393]);
    assert.deepEqual(stage.hits, ['Pool']);
    stage.move(hz, hz);
    assert.deepEqual(stage.hits, ['Pool']);
  }
});

test('a shake through the face of the screen sends the object to a vertical edge', () => {
  const stage = phone();
  stage.read(flat, still);
  stage.read({ ...flat, z: -2.8 }, { ...still, z: 7 }, 90);
  stage.read(flat, still, 90);
  assert.deepEqual(stage.move(6, 60), [166, 0]);
  assert.deepEqual(stage.hits, ['Pool']);
  stage.read({ ...flat, z: -16.8 }, { ...still, z: -7 }, 90);
  stage.read(flat, still, 90);
  assert.deepEqual(stage.move(10, 60), [166, 786]);
  assert.deepEqual(stage.hits, ['Pool', 'Pool']);
});

test('settling after repeated first gravity-only readings recovers the flick regardless of render timing', () => {
  for (const frames of [0, 1]) {
    const stage = phone();
    stage.read({ ...flat, x: 7 }, null);
    stage.move(frames, 120);
    stage.read({ ...flat, x: 7 }, null);
    stage.move(frames, 120);
    stage.read(flat, null);
    assert.deepEqual(stage.move(6, 60), [332, 393]);
    assert.deepEqual(stage.hits, ['Pool']);
  }
});

test('settling after a detected gravity-only reversal does not replay the first sample', () => {
  const stage = phone();
  stage.read({ ...flat, x: 7 }, null);
  stage.read({ ...flat, x: -8 }, null);
  assert.deepEqual(stage.move(6, 60), [0, 393]);
  stage.read(flat, null);
  assert.deepEqual(stage.move(6, 60), [0, 393]);
  assert.deepEqual(stage.hits, ['Pool']);
});

test('gravity-only sensors retain a brief shake without turning a gentle tilt into a launch', () => {
  const stage = phone();
  stage.read(flat, null);
  const slope = { x: 6, y: 0, z: -Math.sqrt(9.8 ** 2 - 6 ** 2) };
  stage.read(slope, null);
  const [tilted] = stage.move(6, 60);
  assert.ok(tilted > 166 && tilted < 191);
  assert.deepEqual(stage.hits, []);
  stage.read({ ...slope, x: 13 }, null, 90);
  stage.read(slope, null, 90);
  const [, y] = stage.move(6, 60);
  assert.equal(y, 0);
  assert.deepEqual(stage.hits, ['Pool']);
});

test('a sustained moderate tilt moves across half a phone in under half a second', () => {
  const stage = phone();
  stage.read({ x: 3.5, y: 0, z: -Math.sqrt(9.8 ** 2 - 3.5 ** 2) }, still);
  const [x] = stage.move(18, 60);
  assert.ok(x > 246 && x < 280);
  assert.deepEqual(stage.hits, []);
  assert.deepEqual(stage.move(9, 60), [332, 393]);
  assert.deepEqual(stage.hits, ['Pool']);
});

test('null readings and shakes received or cleared while paused cannot launch an object', () => {
  const stage = phone();
  assert.equal(stage.read({ x: null, y: null, z: -9.8 }, null), false);
  stage.read(flat, still);
  stage.read({ ...flat, x: 7 }, { ...still, x: 7 }, 0, false);
  stage.read(flat, still);
  assert.deepEqual(stage.move(6, 60), [166, 393]);
  stage.read({ ...flat, x: -7 }, { ...still, x: -7 });
  stage.clearShake();
  stage.read(flat, still);
  assert.deepEqual(stage.move(30, 60), [166, 393]);
  assert.deepEqual(stage.hits, []);
});

test('tilt moves through the same distance over the same time at different display refresh rates', () => {
  function travel(hz: number) {
    const axis = { position: 50, speed: 100 };
    for (let i = 0; i < hz / 2; i++) advanceLooseAxis(axis, 3, 2000, 1 / hz);
    return axis.position;
  }
  assert.ok(Math.abs(travel(30) - travel(120)) < .01);
});
