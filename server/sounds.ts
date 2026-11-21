import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const demoPrompts = new Map([
  ['keys', 'A small brass keyring flicked once, a crisp metallic jingle with a short bright tail'],
  ['drum', 'One warm punchy kick on a small bass drum, woody attack and short deep thump'],
  ['cup', 'A ceramic mug tapped once with a spoon, a clear hollow clink with a short decay'],
]);

export function soundBank(directory: string, labels: Set<string>, key: string, request = fetch) {
  const pending = new Map<string, Promise<Buffer>>();

  async function load(name: string) {
    const file = join(directory, name + '.mp3');
    try {
      return await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!key) throw new Error('Set ELEVENLABS_API_KEY to generate new sounds.');
    const description = demoPrompts.get(name) ?? 'One distinctive sound representing a ' + name + ', with an immediate attack and a short natural decay';
    const response = await request('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: description + '. Isolated rhythmic one-shot, no background or music.', duration_seconds: 0.8, loop: false }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('ElevenLabs returned HTTP ' + response.status);
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Expected audio from ElevenLabs.');
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
