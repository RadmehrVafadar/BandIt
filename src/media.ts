export type Photo = { crop: string; cutout?: string };

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

export function preparePhoto(source: CanvasImageSource, width: number, height: number): Photo {
  const side = Math.min(width, height);
  if (!side) throw new Error('The image is empty.');
  const size = Math.min(side, 480);
  const square = canvas(size, size);
  const context = square.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);
  const crop = square.toDataURL('image/webp', 0.88);
  const pixels = context.getImageData(0, 0, size, size);
  const data = pixels.data;
  const border: number[] = [];
  const colors = new Map<number, number[]>();
  for (let i = 0; i < size; i++) {
    border.push(i, size * (size - 1) + i, i * size, i * size + size - 1);
  }
  for (const index of border) {
    const p = index * 4;
    const key = (data[p] >> 5) * 64 + (data[p + 1] >> 5) * 8 + (data[p + 2] >> 5);
    const group = colors.get(key) ?? [];
    group.push(p);
    colors.set(key, group);
  }
  const group = [...colors.values()].sort((a, b) => b.length - a.length)[0];
  const color = [0, 1, 2].map(channel => group.reduce((sum, p) => sum + data[p + channel], 0) / group.length);
  const queue: number[] = [];
  const visited = new Uint8Array(size * size);
  const remove = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    const p = index * 4;
    const distance = Math.hypot(data[p] - color[0], data[p + 1] - color[1], data[p + 2] - color[2]);
    if (data[p + 3] > 0 && distance > 52) return;
    data[p + 3] = 0;
    queue.push(index);
  };
  border.forEach(remove);
  for (let i = 0; i < queue.length; i++) {
    const index = queue[i];
    if (index % size > 0) remove(index - 1);
    if (index % size < size - 1) remove(index + 1);
    if (index >= size) remove(index - size);
    if (index < size * (size - 1)) remove(index + size);
  }
  const removed = queue.length / (size * size);
  if (removed < 0.12 || removed > 0.96) return { crop };
  context.putImageData(pixels, 0, 0);
  return { crop, cutout: square.toDataURL('image/webp', 0.9) };
}

export async function readPhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return preparePhoto(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function release(stream?: MediaStream) {
  stream?.getTracks().forEach(track => track.stop());
}

export function recordSample(stream: MediaStream, signal: AbortSignal, onStart: () => void) {
  return new Promise<Blob>((resolve, reject) => {
    signal.throwIfAborted();
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      release(stream);
    };
    const abort = () => {
      if (recorder.state !== 'inactive') recorder.stop();
      cleanup();
      reject(signal.reason);
    };
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error('The microphone stopped recording.'));
    };
    recorder.onstop = () => {
      cleanup();
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorder.start();
    signal.addEventListener('abort', abort, { once: true });
    const timer = window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, 2000);
    onStart();
  });
}
