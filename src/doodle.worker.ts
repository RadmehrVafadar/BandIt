import '@tensorflow/tfjs-backend-cpu';
import { setBackend, tensor4d, tidy } from '@tensorflow/tfjs-core';
import type { Tensor } from '@tensorflow/tfjs-core';
import { loadLayersModel } from '@tensorflow/tfjs-layers';
import labels from './doodle-labels.json';
import { suggestionLimit } from './doodle.ts';

async function load(base: string) {
  await setBackend('cpu');
  const model = await loadLayersModel(base + 'model.json');
  if (labels.length !== model.outputs[0].shape.at(-1)) throw new Error('Invalid labels');
  return { model, labels };
}

let ready: ReturnType<typeof load> | undefined;
let latest = 0;
self.onmessage = async ({ data }: MessageEvent<{ id: number; pixels: Float32Array; base: string }>) => {
  const { id, pixels, base } = data;
  latest = id;
  try {
    const { model, labels } = await (ready ??= load(base));
    if (id !== latest) return;
    const scores = tidy(() => {
      const result = model.predict(tensor4d(pixels, [1, 28, 28, 1])) as Tensor;
      return Array.from(result.dataSync());
    });
    const ranked = labels.map((label, i) => ({ label, score: scores[i] })).sort((a, b) => b.score - a.score);
    self.postMessage({ id, labels: ranked.slice(0, suggestionLimit).map(item => item.label) });
  } catch (error) {
    console.warn("Sketch recognition unavailable", error);
    ready = undefined;
    self.postMessage({ id, labels: [] });
  }
};
