import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceLooseAxis, createLooseStage } from '../../src/phone-motion.ts';
import type { MotionSettings } from '../../src/phone-motion.ts';

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
const weightless = { gravity: 0, sensitivity: 100 };

function phone(settings?: MotionSettings) {
  const properties = new Map<string, string>();
  const actor = {
    parentElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) },
    getBoundingClientRect: () => ({ left: 166, top: 393, width: 58, height: 58 }),
    style: { setProperty: (name: string, value: string) => properties.set(name, value) },
    dataset: { active: 'true' },
  } as unknown as HTMLDivElement;
  const actors = new Map([['Pool', actor]]);
  const stage = createLooseStage(settings);
  const hits: string[] = [];
  function read(total: DeviceMotionEventAcceleration | null, linear: DeviceMotionEventAcceleration | null,
    angle = 0, acceptShake = true) {
    return stage.read({ accelerationIncludingGravity: total, acceleration: linear, interval: 1000 / 60 }, angle, true, acceptShake);
  }
  function move(frames: number, hz: number) {
    for (let i = 0; i < frames; i++) stage.move(actors, 1 / hz, id => hits.push(id));
    return ['--motion-x', '--motion-y'].map(key => parseFloat(properties.get(key)!));
  }
  function shake(x: number, y: number, z = 0) {
    read({ x, y, z: flat.z + z }, { x, y, z });
    read(flat, still);
  }
  return { read, move, hits, shake, clearShake: stage.clearShake, setSettings: stage.setSettings };
}

test('default weight leaves a flat phone quiet and lets a firm lateral shake hit just the side', () => {
  const stage = phone();
  stage.read(flat, still);
  assert.deepEqual(stage.move(120, 60), [166, 393]);
  stage.shake(5, 0);
  assert.deepEqual(stage.move(30, 60), [166, 393]);
  assert.deepEqual(stage.hits, []);
  stage.shake(11, 0);
  assert.deepEqual(stage.move(12, 60), [332, 393]);
  stage.move(180, 60);
  assert.deepEqual(stage.hits, ['Pool']);
});

test('a phone already held upright does not drop the object until its tilt changes', () => {
  const stage = phone();
  const upright = { x: 0, y: -8, z: -Math.sqrt(9.8 ** 2 - 8 ** 2) };
  stage.read(upright, still);
  assert.deepEqual(stage.move(120, 60), [166, 393]);
  assert.deepEqual(stage.hits, []);
  stage.read({ x: 0, y: -9.8, z: 0 }, still);
  assert.deepEqual(stage.move(60, 60), [166, 786]);
  assert.deepEqual(stage.hits, ['Pool']);
});

test('a deliberate lift rises against the default weight, then settles at the floor with one contact', () => {
  for (const hz of [30, 60, 120]) {
    const stage = phone();
    stage.shake(0, 0, 8);
    const [, rising] = stage.move(hz / 5, hz);
    assert.ok(rising > 0 && rising < 200);
    assert.deepEqual(stage.hits, []);
    assert.deepEqual(stage.move(hz * 3, hz), [166, 786]);
    assert.deepEqual(stage.hits, ['Pool']);
  }
});

test('raising gravity reduces lift at each setting without changing horizontal travel', () => {
  const heights: number[] = [];
  const sideways: number[] = [];
  for (const gravity of [0, 35, 65, 100]) {
    const stage = phone({ gravity, sensitivity: 35 });
    stage.shake(7, 7);
    const [x, y] = stage.move(2, 60);
    heights.push(393 - y);
    sideways.push(x);
  }
  assert.ok(heights.every((height, i) => height > 0 && (!i || height < heights[i - 1])));
  assert.ok(sideways.every(x => x === sideways[0]));
});

test('sensitivity controls effort and launch speed independently of sustained tilt', () => {
  const distances: number[] = [];
  const tilts: number[] = [];
  for (const sensitivity of [0, 35, 70, 100]) {
    const stage = phone({ gravity: 65, sensitivity });
    stage.shake(9, 0);
    distances.push(stage.move(1, 60)[0] - 166);
    const sameTilt = phone({ gravity: 65, sensitivity });
    sameTilt.read({ x: 3.5, y: 0, z: -9.15 }, still);
    tilts.push(sameTilt.move(10, 60)[0]);
  }
  assert.equal(distances[0], 0);
  assert.ok(distances.every((distance, i) => !i || distance > distances[i - 1]));
  assert.ok(tilts.every(x => x === tilts[0]));
});

test('live setting changes preserve the current object and affect its next movement', () => {
  const stage = phone({ gravity: 0, sensitivity: 0 });
  stage.shake(5, 0);
  assert.deepEqual(stage.move(6, 60), [166, 393]);
  stage.setSettings({ gravity: 0, sensitivity: 100 });
  stage.shake(5, 0);
  assert.deepEqual(stage.move(6, 60), [332, 393]);
  stage.shake(0, 8);
  assert.deepEqual(stage.move(6, 60), [332, 0]);
  stage.setSettings({ gravity: 100, sensitivity: 0 });
  const [x, y] = stage.move(1, 60);
  assert.equal(x, 332);
  assert.ok(y > 0 && y < 3);
  assert.deepEqual(stage.move(120, 60), [332, 786]);
});

test('a short shake and its release between frames still send an object to the wall', () => {
  for (const hz of [30, 60, 120]) {
    const stage = phone(weightless);
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
  const stage = phone(weightless);
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
    stage.read({ ...flat, x: 11 }, null);
    stage.move(frames, 120);
    stage.read({ ...flat, x: 11 }, null);
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
  stage.read({ ...slope, x: 19 }, null, 90);
  stage.read(slope, null, 90);
  let y = tilted;
  for (let frame = 0; frame < 12 && !stage.hits.length; frame++) [, y] = stage.move(1, 60);
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
  stage.read({ ...flat, x: 11 }, { ...still, x: 11 }, 0, false);
  stage.read(flat, still);
  assert.deepEqual(stage.move(6, 60), [166, 393]);
  stage.read({ ...flat, x: -11 }, { ...still, x: -11 });
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
