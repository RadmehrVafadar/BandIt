import { defineConfig, loadEnv } from 'vite';
import type { PreviewServer, ViteDevServer } from 'vite';

import { soundHandler } from './server/handler.ts';
import { identifyHandler } from './server/identify.ts';
import { withProviderKey } from './server/access.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_AUTH0_');
  const sounds = withProviderKey(soundHandler('.sound-cache'), env);
  const identify = withProviderKey(identifyHandler(), env);
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
