import { defineConfig } from '@playwright/test';
import { createFixtures } from './tests/browser/fixtures.ts';

const { camera, microphone } = createFixtures();

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      executablePath: process.env.POCKET_BAND_CHROME,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--use-file-for-fake-video-capture=' + camera,
        '--use-file-for-fake-audio-capture=' + microphone,
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
