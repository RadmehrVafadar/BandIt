import { objectLabels } from '../src/object-labels.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { soundBank } from './sounds.ts';

import type { SharedSoundCache } from './shared-cache.ts';

export function soundHandler(directory: string, key: string, shared?: SharedSoundCache) {
  const labels = new Set(objectLabels.keys());
  const bank = soundBank(directory, labels, key, fetch, shared);
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
