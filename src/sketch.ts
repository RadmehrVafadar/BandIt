import type { Position } from './music.ts';

export type Stroke = Position[];

function example(...lines: string[]): Stroke[] {
  return lines.map(line => line.split(' ').map(pair => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  }));
}

// Outlines include common ways to draw each object, with or without details.
const templates = {
  keys: [
    example('2,5 2,2 5,1 8,2 9,5 8,8 5,9 2,8 2,5', '5,9 5,21 7,21 7,18 9,18 9,16 7,16 7,9'),
    example('1,5 2,2 5,1 8,2 9,5 8,8 5,9 2,8 1,5', '5,9 12,19 15,17 13,15 15,13 13,11 11,13 8,8'),
    example('1,5 2,2 5,1 8,2 9,5 8,8 5,9 2,8 1,5', '3,8 1,16 3,17 5,16 3,15 5,14 6,8', '7,8 12,18 15,17 13,14 15,13 11,12 9,7'),
    example('1,5 2,2 5,1 8,2 9,5 8,8 5,9 2,8 1,5', '9,4 21,4 21,8 18,8 18,6 16,6 16,8 9,8'),
    example('1,5 2,2 5,1 8,2 9,5 8,8 5,9 2,8 1,5', '8,8 19,19 21,17 19,15 18,16 16,14 17,13 9,5'),
    example('2,5 2,2 5,1 8,2 9,5 8,8 5,9 2,8 2,5', '5,9 5,20', '5,16 8,16', '5,20 8,20'),
  ],
  drum: [
    example('1,5 3,2 10,1 17,2 19,5 17,7 10,8 3,7 1,5', '1,5 1,14 3,16 10,17 17,16 19,14 19,5'),
    example('1,5 3,2 10,1 17,2 19,5 17,7 10,8 3,7 1,5', '1,5 1,14 3,16 10,17 17,16 19,14 19,5', '2,9 6,16 10,8 14,16 18,9'),
    example('1,6 4,4 10,3 16,4 19,6 16,8 10,9 4,8 1,6', '1,6 2,15 10,17 18,15 19,6', '3,0 10,7', '16,0 12,7'),
    example('1,1 18,1 18,12 1,12 1,1', '1,4 18,4', '2,4 5,12 9,4 13,12 17,4'),
  ],
  bell: [
    example('1,15 4,12 5,6 7,3 10,2 13,3 15,6 16,12 19,15 1,15', '7,15 8,18 10,19 12,18 13,15', '10,2 10,0'),
    example('2,13 4,10 5,4 7,2 10,1 13,2 15,4 16,10 18,13 15,15 5,15 2,13', '10,15 10,18'),
    example('1,15 5,13 7,5 9,2 12,2 14,5 16,13 20,15 1,15', '8,16 10,19 12,19 14,16', '3,3 1,6', '17,3 19,6'),
  ],
  cup: [
    example('2,4 5,2 11,2 15,4 12,6 5,6 2,4', '2,4 4,14 12,14 15,4', '15,6 19,6 20,8 18,11 14,12'),
    example('1,2 2,13 4,15 10,15 12,13 13,2 1,2', '13,4 17,4 18,6 17,9 13,11'),
    example('1,4 4,2 12,2 15,4 12,6 4,6 1,4', '1,4 4,16 12,16 15,4'),
    example('1,1 15,1 12,16 4,16 1,1', '2,5 14,5'),
  ],
  pencil: [
    example('1,19 3,13 15,1 19,5 7,17 1,19', '3,13 7,17', '12,4 16,8'),
    example('2,2 5,0 8,2 8,15 5,20 2,15 2,2', '2,4 8,4', '2,15 8,15'),
    example('1,2 14,2 19,5 14,8 1,8 1,2', '5,2 5,8', '14,2 14,8'),
    example('1,2 5,1 18,14 19,19 14,18 1,5 1,2', '14,18 18,14'),
  ],
  whistle: [
    example('1,7 1,3 12,3 15,1 19,1 22,4 22,8 19,11 15,11 12,8 1,7', '14,4 18,4 18,7 14,7 14,4'),
    example('1,2 8,2 10,4 18,4 18,8 11,8 9,12 5,13 1,10 0,6 1,2', '3,5 7,5 7,9 3,9 3,5'),
    example('1,5 6,2 10,2 12,4 22,4 22,7 13,8 12,12 8,14 4,13 1,10 1,5', '5,6 9,6 9,10 5,10 5,6'),
  ],
};

export type ObjectKind = keyof typeof templates;

export function bounds(strokes: Stroke[]) {
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const stroke of strokes) {
    for (const { x, y } of stroke) {
      box.left = Math.min(box.left, x);
      box.top = Math.min(box.top, y);
      box.right = Math.max(box.right, x);
      box.bottom = Math.max(box.bottom, y);
    }
  }
  return box;
}

function points(strokes: Stroke[]) {
  const { left, top, right, bottom } = bounds(strokes);
  const width = right - left;
  const height = bottom - top;
  const scale = Math.max(width, height, Number.EPSILON);
  const cloud: Position[] = [];
  for (const stroke of strokes) {
    for (const [index, point] of stroke.entries()) {
      const previous = stroke[index - 1] ?? point;
      const length = Math.hypot(point.x - previous.x, point.y - previous.y) / scale;
      const count = Math.max(1, Math.ceil(length * 28));
      for (let i = 1; i <= count; i++) {
        cloud.push({
          x: (previous.x + (point.x - previous.x) * i / count - left - width / 2) / scale,
          y: (previous.y + (point.y - previous.y) * i / count - top - height / 2) / scale,
        });
      }
    }
  }
  // Keep matching cost independent of pen sampling rate and time spent tracing.
  const cells = new Map<string, Position>();
  for (const point of cloud) cells.set(Math.round(point.x * 28) + ',' + Math.round(point.y * 28), point);
  return [...cells.values()];
}

function distance(from: Position[], to: Position[]) {
  let total = 0;
  for (const point of from) {
    let closest = Infinity;
    for (const target of to) {
      closest = Math.min(closest, (point.x - target.x) ** 2 + (point.y - target.y) ** 2);
    }
    total += closest;
  }
  return total / from.length;
}

const references = (Object.keys(templates) as ObjectKind[]).flatMap(kind =>
  templates[kind].map(strokes => ({ kind, cloud: points(strokes) })),
);

export function rankSketch(strokes: Stroke[]): ObjectKind[] {
  const cloud = points(strokes);
  const scores = new Map<ObjectKind, number>();
  for (const reference of references) {
    const cost = distance(cloud, reference.cloud) + distance(reference.cloud, cloud);
    scores.set(reference.kind, Math.min(scores.get(reference.kind) ?? Infinity, cost));
  }
  return [...scores].sort((a, b) => a[1] - b[1]).map(([kind]) => kind);
}
