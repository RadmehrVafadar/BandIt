import type { Position } from './music.ts';

// Accelerometer readings are in m/s². Scale them into CSS pixels per second squared.
const pixelsPerMeter = 200;
type Axis = { position: number; speed: number; wall?: -1 | 1 };
type Body = { x: Axis; y: Axis };

export function screenForce(reading: DeviceMotionEventAcceleration | null, angle: number, appleMobile: boolean): Position | undefined {
  if (!reading || reading.x === null || reading.y === null || !Number.isFinite(reading.x) || !Number.isFinite(reading.y)) return;
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
  axis.speed = (axis.speed + acceleration * elapsed) * Math.exp(-1.2 * elapsed);
  const next = previous + axis.speed * elapsed;
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
  return {
    move(actors: Map<string, HTMLDivElement>, force: Position, elapsed: number, impact: (id: string) => void) {
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
        const hitX = advanceLooseAxis(body.x, force.x, stage.width - box.width, elapsed);
        const hitY = advanceLooseAxis(body.y, force.y, stage.height - box.height, elapsed);
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
    },
  };
}
