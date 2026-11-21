import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import type { Connect } from 'vite';
import { soundBank } from './server/sounds.ts';

export default defineConfig(({ mode }) => {
  const labels = new Set(readFileSync('public/doodlenet/class_names.txt', 'utf8').trim().split(/\r?\n/).map(label => label.replaceAll('_', ' ')));
  for (const name of ['keys', 'drum', 'bell', 'whistle', 'cup', 'pencil']) labels.add(name);
  const key = loadEnv(mode, process.cwd(), 'ELEVENLABS_').ELEVENLABS_API_KEY;
  const bank = soundBank('.sound-cache', labels, key);
  const handler: Connect.NextHandleFunction = async (req, res) => {
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
  return {
    plugins: [{
      name: 'object-sounds',
      configureServer(server) { server.middlewares.use('/api/sounds', handler); },
      configurePreviewServer(server) { server.middlewares.use('/api/sounds', handler); },
    }],
    // Discover worker dependencies before the first stroke triggers a dev-server reload.
    optimizeDeps: { include: ['@tensorflow/tfjs-core', '@tensorflow/tfjs-layers', '@tensorflow/tfjs-backend-cpu'] },
  };
});
