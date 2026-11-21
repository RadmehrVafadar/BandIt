import { bounds } from './sketch.ts';
import type { Stroke } from './sketch.ts';

// DoodleNet expects a 28px grayscale bitmap with bright ink on black.
export function doodlePixels(strokes: Stroke[]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 28;
  const ctx = canvas.getContext('2d')!;
  const { left, top, right, bottom } = bounds(strokes);
  const scale = 24 / Math.max(right - left, bottom - top, 1);
  ctx.translate(14, 14);
  ctx.scale(scale, scale);
  ctx.translate(-(left + right) / 2, -(top + bottom) / 2);
  ctx.lineWidth = 1.5 / scale;
  ctx.lineJoin = ctx.lineCap = 'round';
  for (const stroke of strokes) {
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (const p of stroke) ctx.lineTo(p.x, p.y);
    if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.01 / scale, stroke[0].y);
    ctx.stroke();
  }
  const rgba = ctx.getImageData(0, 0, 28, 28).data;
  return Float32Array.from({ length: 784 }, (_, i) => rgba[i * 4 + 3] / 255);
}
