import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { soundBank } from './sounds.ts';

export function soundHandler(directory: string, key: string) {
  const labels = new Set(readFileSync('public/doodlenet/class_names.txt', 'utf8').trim().split(/\r?\n/).map(label => label.replaceAll('_', ' ')));
  for (const name of ['keys', 'drum', 'bell', 'whistle', 'cup', 'pencil']) labels.add(name);

  const bank = soundBank(directory, labels, key);
  return async (req: IncomingMessage, res: ServerResponse) => {
    const name = new URL(req.url ?? '/', 'http://localhost').searchParams.get('name') ?? '';
    if (req.method !== 'POST' || req.headers['x-pocket-band'] !== '1' || !labels.has(name)) {
      res.writeHead(400).end();
      return;
    }
    try {
      const audio = await bank(name);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' }).end(audio);
    } catch (error) {
      console.warn('Object sound unavailable:', name, error instanceof Error ? error.message : '');
      res.writeHead(503).end();
    }
  };
}
