import { defineConfig, loadEnv } from 'vite';
import type { PreviewServer, ViteDevServer } from 'vite';

import { soundHandler } from './server/handler.ts';
import { identifyHandler } from './server/identify.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['ELEVENLABS_', 'GEMINI_']);
  const sounds = soundHandler('.sound-cache', env.ELEVENLABS_API_KEY);
  const identify = identifyHandler(env.GEMINI_API_KEY);
  function objectApi(server: ViteDevServer | PreviewServer) {
    server.middlewares.use('/api/sounds', sounds);
    server.middlewares.use('/api/identify', identify);
  }
  return {
    plugins: [{
      name: 'object-api',
      configureServer: objectApi,
      configurePreviewServer: objectApi,
    }],
    // Discover worker dependencies before the first stroke triggers a dev-server reload.
    optimizeDeps: { include: ['@tensorflow/tfjs-core', '@tensorflow/tfjs-layers', '@tensorflow/tfjs-backend-cpu'] },
  };
});
