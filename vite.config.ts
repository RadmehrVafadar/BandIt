import { defineConfig, loadEnv } from 'vite';

import { soundHandler } from './server/handler.ts';

export default defineConfig(({ mode }) => {
  const handler = soundHandler('.sound-cache', loadEnv(mode, process.cwd(), 'ELEVENLABS_').ELEVENLABS_API_KEY);
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
