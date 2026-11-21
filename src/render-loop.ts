import { LOOP_SECONDS, loopScore } from './loop-score.ts';
import type { LoopName } from './loop-score.ts';
import { STEP_SECONDS } from './music.ts';
import type { Sample } from './music.ts';

const rate = 24000;
const lengths = { drum: .50, keys: .21, cup: .26, bell: .85 };
// The four stems share the gain used to master the original loop pack.
const masterGain = .6779611009651982;

export function renderLoop(name: LoopName, source: Sample): Sample {
  const layer = new Float32Array(rate * LOOP_SECONDS);
  for (const [step, level, pitch = 0] of loopScore[name]) {
    const root = 65.406 * 2 ** (pitch / 12);
    const start = Math.round((step * STEP_SECONDS + (step % 2 ? .011 : 0)) * rate);
    const length = Math.round(lengths[name] * rate);
    const speed = name === 'bell' ? 523.25 / 659.25 * 2 ** (pitch / 12)
      : 2 ** (((level - 1) * 2 + (name === 'cup' ? pitch : 0)) / 12);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const position = i * source.rate / rate * speed;
      const index = Math.floor(position);
      const a = source.samples[index] ?? 0;
      const dry = a + ((source.samples[index + 1] ?? 0) - a) * (position - index);
      let sound: number;
      switch (name) {
        case 'drum': {
          const attack = 2 * Math.PI * (root * t + .20 * (1 - Math.exp(-50 * t)));
          sound = dry * .48 * Math.exp(-10 * t)
            + (.59 * Math.sin(attack) + .11 * Math.sin(4 * Math.PI * root * t)) * Math.exp(-9 * t);
          break;
        }
        case 'cup': sound = dry * .78 * Math.exp(-7 * t); break;
        case 'keys': sound = dry * 1.25 * Math.exp(-6 * t); break;
        case 'bell': sound = .62 * dry + .12 * Math.sin(2 * Math.PI * root * 8 * t) * Math.exp(-6 * t); break;
      }
      // Wrap the tail into the next repetition for a continuous loop.
      layer[(start + i) % layer.length] += sound * level * Math.min(1, i / 35, (length - 1 - i) / 220);
    }
  }
  return { rate, samples: layer.map(value => value * masterGain) };
}
