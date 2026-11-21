import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SharedSoundCache } from './shared-cache.ts';

export const demoPrompts = new Map([
  ['keys', 'A small brass keyring flicked once, a crisp metallic jingle with a short bright tail'],
  ['drum', 'One warm punchy kick on a small bass drum, woody attack and short deep thump'],
  ['cup', 'A ceramic mug tapped once with a spoon, a clear hollow clink with a short decay'],
]);

export function soundBank(directory: string, labels: Set<string>, key: string, request = fetch, shared?: SharedSoundCache) {
  const pending = new Map<string, Promise<Buffer>>();

  async function generate(name: string) {
    if (!key) throw new Error('Set ELEVENLABS_API_KEY to generate new sounds.');
    const description = name === 'car'
      ? 'A car starting: the starter motor cranks, the engine catches and settles into a low rattling idle'
      : demoPrompts.get(name) ?? 'Record the recognizable real-world sound of a ' + name + ' in use, capturing its characteristic action';
    const response = await request('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: description + '. Close, isolated recording. No backing beat or music.', duration_seconds: name === 'car' ? 1.5 : 0.8, loop: false }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('ElevenLabs returned HTTP ' + response.status);
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Expected audio from ElevenLabs.');
    console.info('ElevenLabs generated object sound:', name);
    return audio;
  }

  async function load(name: string) {
    const id = name === 'car' ? 'car-ignition-v1' : name;
    const file = join(directory, id + '.mp3');
    try {
      return await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const audio = shared ? await shared(id, () => generate(name)) : await generate(name);
    await mkdir(directory, { recursive: true });
    const temporary = file + '.' + randomUUID();
    await writeFile(temporary, audio);
    await rename(temporary, file);
    return audio;
  }

  return function get(name: string) {
    if (!labels.has(name) || !/^[a-z -]+$/.test(name)) throw new Error('Unknown object.');
    let result = pending.get(name);
    if (!result) {
      result = load(name).finally(() => pending.delete(name));
      pending.set(name, result);
    }
    return result;
  };
}
