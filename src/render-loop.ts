import { LOOP_SECONDS, bassLine, chords, hitDelay, loopScore } from './loop-score.ts';
import type { LoopName } from './loop-score.ts';
import { BAR_STEPS, STEP_SECONDS } from './music.ts';
import type { Sample } from './music.ts';

const rate = 24000;
const tau = 2 * Math.PI;
const c2 = 65.4064;
const masterGain = .64;

// A rounded attack lets the recorded strike come through before the pitched body.
function addPluck(layer: Float32Array, start: number, seconds: number, hz: number, level: number, decay: number) {
  const frames = Math.round(seconds * rate);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const phase = tau * hz * t;
    const body = Math.sin(phase) + .38 * Math.sin(2 * phase) + .16 * Math.sin(3 * phase) * Math.exp(-12 * t);
    const envelope = Math.min(1, t / .011, (frames - 1 - i) / (rate * .045)) * Math.exp(-decay * t);
    layer[(start + i) % layer.length] += level * body * envelope;
  }
}

export function renderLoop(name: LoopName, source: Sample): Sample {
  const layer = new Float32Array(rate * LOOP_SECONDS);
  if (name === 'drum') {
    for (const [step, level, pitch, length] of bassLine) {
      const start = Math.round((step * STEP_SECONDS + hitDelay(name, step) + .014) * rate);
      addPluck(layer, start, length * STEP_SECONDS, c2 * 2 ** (pitch / 12), .49 * level, 3.2);
    }
  }
  for (const [step, level, pitch = 0, lengthSteps] of loopScore[name]) {
    const start = Math.round((step * STEP_SECONDS + hitDelay(name, step)) * rate);
    const tapSeconds = name === 'drum' ? .32 : .065 + .18 * level;
    const seconds = lengthSteps === undefined ? tapSeconds : lengthSteps * STEP_SECONDS;
    const length = Math.round(seconds * rate);
    const bellHz = c2 * 8 * 2 ** (pitch / 12);
    const speed = name === 'bell' ? bellHz / 659.25 : 2 ** ((pitch + (level - 1) * 2) / 12);
    const release = rate * (name === 'bell' ? .045 : .014);
    // Written cup lengths are open strokes. The short ghost taps stay dry.
    if (name === 'cup' && lengthSteps !== undefined) {
      const [low, high] = chords[Math.floor(step / BAR_STEPS)].cup;
      addPluck(layer, start, seconds, c2 * 4 * 2 ** (low / 12), .17 * level, 5.3);
      addPluck(layer, start + Math.round(.009 * rate), seconds, c2 * 4 * 2 ** (high / 12), .13 * level, 5.8);
    }
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const position = i * source.rate / rate * speed;
      const index = Math.floor(position);
      const a = source.samples[index] ?? 0;
      const dry = a + ((source.samples[index + 1] ?? 0) - a) * (position - index);
      let sound: number;
      switch (name) {
        case 'drum': {
          const attack = tau * (51 * t + .36 * (1 - Math.exp(-48 * t)));
          sound = .62 * dry * Math.exp(-8 * t) + .39 * Math.sin(attack) * Math.exp(-18 * t);
          break;
        }
        case 'cup': sound = 1.04 * dry * Math.exp(-8 * t); break;
        case 'keys': sound = 1.12 * dry * Math.exp(-4 * t); break;
        case 'bell': {
          const phase = tau * bellHz * t;
          sound = .66 * dry + .21 * Math.sin(phase) * Math.exp(-3.3 * t)
            + .065 * Math.sin(2.01 * phase) * Math.exp(-6 * t);
          break;
        }
      }
      layer[(start + i) % layer.length] += sound * level * Math.min(1, i / 35, (length - 1 - i) / release);
    }
  }
  return { rate, samples: layer.map(value => value * masterGain) };
}
