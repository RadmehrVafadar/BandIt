export const BPM = 100;
export const BAR_STEPS = 16;
export const STEP_SECONDS = 60 / BPM / 4;

type Hit = readonly [step: number, level: number, semitones?: number];

export const patterns = {
  kick: [[0, 1], [6, 0.78], [8, 0.95], [14, 0.72]],
  snare: [[4, 0.85], [12, 0.95], [15, 0.32]],
  shaker: [[2, 0.75], [4, 0.52], [6, 0.86], [8, 0.53], [10, 0.78], [12, 0.55], [14, 0.94]],
  melody: [[0, 0.75, 0], [3, 0.55, 7], [7, 0.72, 3], [10, 0.65, 12], [14, 0.55, 7]],
} satisfies Record<string, Hit[]>;

export type Role = keyof typeof patterns;
export type Sample = { samples: Float32Array; rate: number };
export type Instrument = { id: string; name: string; image: string; role: Role; sample: Sample };
export type Slots = (string | null)[];
export type Change = { id: string | null; at: number };

export function barBoundary(nextStep: number) {
  return Math.ceil(nextStep / BAR_STEPS) * BAR_STEPS;
}

export function updateQueue(
  slots: Slots, pending: Map<number, Change>, slot: number, id: string | null, nextStep: number,
) {
  if (id === slots[slot]) pending.delete(slot);
  else pending.set(slot, { id, at: barBoundary(nextStep) });
}

export function cleanSample(channels: Float32Array[], rate: number): Sample | null {
  const length = Math.min(channels[0]?.length ?? 0, rate * 2);
  const mono = new Float32Array(length);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    mono[i] = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
    peak = Math.max(peak, Math.abs(mono[i]));
  }
  if (peak < 0.012) return null;
  const threshold = Math.max(0.006, peak * 0.06);
  const pad = Math.round(rate * 0.008);
  const start = Math.max(0, mono.findIndex(value => Math.abs(value) >= threshold) - pad);
  const end = Math.min(length, mono.findLastIndex(value => Math.abs(value) >= threshold) + pad + 1);
  const samples = mono.slice(start, end);
  const fade = Math.max(1, Math.round(rate * 0.005));
  for (let i = 0; i < samples.length; i++) {
    const envelope = Math.min(1, i / fade, (samples.length - 1 - i) / fade);
    samples[i] *= envelope * 0.88 / peak;
  }
  return { samples, rate };
}
