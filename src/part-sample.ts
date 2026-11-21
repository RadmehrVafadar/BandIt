import type { Part, Sample } from './music.ts';

// Compare two early windows. Glides, noise and unstable partials use the tuned-body fallback.
export function stablePitch({ samples, rate }: Sample) {
  function estimate(start: number) {
    const stride = Math.max(1, Math.round(rate / 8000));
    const hz = rate / stride;
    const size = Math.round(hz * .032);
    const offset = Math.round(start * rate);
    if (offset + size * stride > samples.length) return 0;
    const window = new Float64Array(size);
    let energy = 0;
    for (let i = 0; i < size; i++) {
      window[i] = samples[offset + i * stride] * (.5 - .5 * Math.cos(2 * Math.PI * i / size));
      energy += window[i] ** 2;
    }
    // Goertzel power across the playable register, with half-bin interpolation.
    const spacing = hz / (2 * size);
    const powers: number[] = [];
    let best = 0;
    for (let bin = 0; bin <= Math.ceil(1600 / spacing) + 1; bin++) {
      const coefficient = 2 * Math.cos(Math.PI * bin / size);
      let last = 0, prior = 0;
      for (const value of window) {
        const next = value + coefficient * last - prior;
        prior = last;
        last = next;
      }
      powers.push(last * last + prior * prior - coefficient * last * prior);
      if (powers[bin] > powers[best]) best = bin;
    }
    if (best * spacing < 80 || best * spacing > 1600 || powers[best] < Math.max(1e-8, .2 * size * energy)) return 0;
    const left = powers[best - 1], right = powers[best + 1];
    const shift = .5 * (left - right) / (left + right - 2 * powers[best]);
    return (best + shift) * spacing;
  }
  const first = estimate(.012), second = estimate(.042);
  return first && second && Math.abs(Math.log2(first / second)) < .045 ? (first + second) / 2 : 0;
}

const lengths = { pulse: .34, backbeat: .145, motion: .095, hook: .42 };
export function partSample(sample: Sample, part: Part): Sample {
  const { rate, samples: raw } = sample;
  const pitch = part === 'hook' ? stablePitch(sample) : 0;
  const root = pitch < 370 ? 261.6256 : 523.2511;
  const speed = pitch ? root / pitch : 1;
  const samples = new Float32Array(Math.round(rate * lengths[part]));
  let peak = 0;
  let low = 0;
  const smoothing = 1 - Math.exp(-2 * Math.PI * 1200 / rate);
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate, pos = i * speed, j = Math.floor(pos);
    const a = raw[j] ?? 0;
    const dry = a + ((raw[j + 1] ?? 0) - a) * (pos - j);
    low += smoothing * (dry - low);
    let sound: number;
    switch (part) {
      case 'pulse':
        sound = dry * Math.exp(-20 * t) + .42 * Math.sin(2 * Math.PI * (65.406 * t + .38 * (1 - Math.exp(-42 * t)))) * Math.exp(-13 * t);
        break;
      case 'backbeat':
        sound = (dry - .5 * low) * Math.exp(-16 * t);
        break;
      case 'motion':
        sound = (dry - .9 * low) * Math.exp(-32 * t);
        break;
      case 'hook':
        sound = pitch ? dry : dry * Math.exp(-14 * t) + .32 * Math.sin(2 * Math.PI * root * t) * Math.exp(-9 * t);
        break;
    }
    samples[i] = sound * Math.min(1, i / (rate * .002), (samples.length - 1 - i) / (rate * .018));
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const gain = Math.min(4, .62 / Math.max(.001, peak));
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return { rate, samples };
}
