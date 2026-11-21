import { defineConfig } from '@playwright/test';

const port = Number(process.env.POCKET_BAND_TEST_PORT ?? 4173);
const baseURL = 'http://127.0.0.1:' + port;

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL,
    launchOptions: {
      executablePath: process.env.POCKET_BAND_CHROME,
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port ' + port + ' --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
});
