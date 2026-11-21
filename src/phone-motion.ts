import type { Position } from './music.ts';

// Accelerometer readings are in m/s². Scale them into CSS pixels per second squared.
const pixelsPerMeter = 640;
const shakeThreshold = 2.5; // m/s² of movement after removing gravity
const maxScreensPerSecond = 8;
type Vector = Position & { z: number };
type Axis = { position: number; speed: number; wall?: -1 | 1 };
type Body = { x: Axis; y: Axis };
type MotionSample = Pick<DeviceMotionEvent, 'acceleration' | 'accelerationIncludingGravity' | 'interval'>;

function vector(reading: DeviceMotionEventAcceleration | null, allowZOnly = false): Vector | undefined {
  if (!reading) return;
  const { x, y, z } = reading;
  if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) {
    return { x, y, z: z !== null && Number.isFinite(z) ? z : 0 };
  }
  if (allowZOnly && z !== null && Number.isFinite(z) && Math.abs(z) >= shakeThreshold) return { x: 0, y: 0, z };
}

function subtract(a: Vector, b: Vector): Vector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function screenVector(reading: Vector, angle: number, appleMobile: boolean): Position {
  // Core Motion supplies gravity toward the floor. Other accelerometers report the supporting force.
  const x = appleMobile ? reading.x : -reading.x;
  const y = appleMobile ? -reading.y : reading.y;
  switch ((angle + 360) % 360) {
    case 90: return { x: y, y: -x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: -y, y: x };
    default: return { x, y };
  }
}

export function advanceLooseAxis(axis: Axis, force: number, extent: number, elapsed: number) {
  // Clamp first so a viewport resize cannot masquerade as a collision.
  const limit = Math.max(0, extent);
  const previous = Math.min(limit, Math.max(0, axis.position));
  if ((axis.wall === -1 && previous > 2) || (axis.wall === 1 && previous < limit - 2)) axis.wall = undefined;
  const acceleration = Math.abs(force) < .2 ? 0 : Math.max(-35, Math.min(35, force)) * pixelsPerMeter;
  // Integrate acceleration and drag over the frame, including on 120 Hz displays.
  const drag = 1.2;
  const coast = -Math.expm1(-drag * elapsed) / drag;
  const next = previous + axis.speed * coast + acceleration * (elapsed - coast) / drag;
  axis.speed += (acceleration - drag * axis.speed) * coast;
  axis.position = Math.max(0, Math.min(limit, next));
  const wall = axis.speed < 0 && next <= 0 ? -1 : axis.speed > 0 && next >= limit ? 1 : undefined;
  if (!wall) return false;
  // Rearm after moving clear of this edge so sensor noise doesn't repeat the sound.
  const hit = previous !== axis.position && axis.wall !== wall;
  axis.wall = wall;
  axis.speed = 0;
  return hit;
}

export function createLooseStage() {
  let bodies = new WeakMap<HTMLDivElement, Body>();
  let tilt: Position = { x: 0, y: 0 };
  let gravity: Vector | undefined;
  let firstMovingSample: Vector | undefined;
  let pending: (Position & { strength: number }) | undefined;
  function clearShake() {
    pending = undefined;
    firstMovingSample = undefined;
  }

  function estimateShake(total: Vector, interval: number, acceptShake: boolean) {
    const atRest = Math.abs(Math.hypot(total.x, total.y, total.z) - 9.81) < .8;
    if (!gravity) {
      // The first sample may arrive mid-flick. The next resting sample supplies its gravity baseline.
      if (!atRest && acceptShake) firstMovingSample = total;
      gravity = total;
      return;
    }
    if (atRest) {
      const first = firstMovingSample;
      firstMovingSample = undefined;
      gravity = total;
      return first && subtract(first, total);
    }
    // On gravity-only devices, track slow changes in posture and keep the brief acceleration.
    const shake = subtract(total, gravity);
    const seconds = Math.max(1 / 120, Math.min(.1, (interval || 1000 / 60) / 1000));
    const blend = -Math.expm1(-4 * seconds);
    gravity = { x: gravity.x + shake.x * blend, y: gravity.y + shake.y * blend, z: gravity.z + shake.z * blend };
    return shake;
  }

  return {
    read(event: MotionSample, angle: number, appleMobile: boolean, acceptShake: boolean) {
      if (!acceptShake) clearShake();
      const total = vector(event.accelerationIncludingGravity);
      const linear = vector(event.acceleration, true);
      if (!total && !linear) return false;
      let shake = linear;
      if (linear) firstMovingSample = undefined;
      if (total) {
        if (linear) {
          gravity = subtract(total, linear);
          tilt = screenVector(gravity, angle, appleMobile);
        } else {
          shake = estimateShake(total, event.interval, acceptShake);
          tilt = screenVector(total, angle, appleMobile);
        }
      } else tilt = { x: 0, y: 0 };
      if (acceptShake && shake) {
        const direction = screenVector(shake, angle, appleMobile);
        // A push through the face of the screen sends the object along the screen's vertical axis.
        if (Math.abs(shake.z) > Math.hypot(shake.x, shake.y)) direction.y = appleMobile ? -shake.z : shake.z;
        const strength = Math.hypot(direction.x, direction.y);
        // Keep the strongest impulse until the next animation frame, even if the phone has already settled.
        if (strength >= shakeThreshold && strength > (pending?.strength ?? 0)) {
          firstMovingSample = undefined;
          const gain = Math.min(1, maxScreensPerSecond / strength);
          pending = { x: direction.x * gain, y: direction.y * gain, strength };
        }
      }
      return true;
    },
    clearShake,
    move(actors: Map<string, HTMLDivElement>, elapsed: number, impact: (id: string) => void) {
      const launch = pending;
      pending = undefined;
      const stage = actors.values().next().value?.parentElement?.getBoundingClientRect();
      if (!stage) return;
      for (const [id, actor] of actors) {
        if (actor.dataset.active !== 'true') continue;
        const box = actor.getBoundingClientRect();
        let body = bodies.get(actor);
        if (!body) {
          body = { x: { position: box.left - stage.left, speed: 0 }, y: { position: box.top - stage.top, speed: 0 } };
          bodies.set(actor, body);
          actor.dataset.loose = '';
        }
        if (launch) {
          const span = Math.max(stage.width, stage.height);
          body.x.speed = launch.x * span;
          body.y.speed = launch.y * span;
        }
        const hitX = advanceLooseAxis(body.x, tilt.x, stage.width - box.width, elapsed);
        const hitY = advanceLooseAxis(body.y, tilt.y, stage.height - box.height, elapsed);
        actor.style.setProperty('--motion-x', body.x.position + 'px');
        actor.style.setProperty('--motion-y', body.y.position + 'px');
        if (hitX || hitY) impact(id);
      }
    },
    reset(actors: Map<string, HTMLDivElement>) {
      for (const actor of actors.values()) {
        delete actor.dataset.loose;
        actor.style.removeProperty('--motion-x');
        actor.style.removeProperty('--motion-y');
      }
      bodies = new WeakMap();
      gravity = undefined;
      tilt = { x: 0, y: 0 };
      clearShake();
    },
  };
}
