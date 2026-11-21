import { defineConfig } from 'vite';

export default defineConfig({
  // Discover worker dependencies before the first stroke triggers a dev-server reload.
  optimizeDeps: { include: ['@tensorflow/tfjs-core', '@tensorflow/tfjs-layers', '@tensorflow/tfjs-backend-cpu'] },
});
