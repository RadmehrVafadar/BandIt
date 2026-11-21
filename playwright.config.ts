import { defineConfig, devices } from '@playwright/test';
import { testAuthEnv } from './tests/fixtures/auth0.ts';

const port = Number(process.env.POCKET_BAND_TEST_PORT ?? 4183);
const baseURL = 'http://127.0.0.1:' + port;
const outDir = 'node_modules/.cache/bandit-e2e';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 30000,
  use: { baseURL },
  projects: [
    {
      name: 'chromium',
      use: { launchOptions: { executablePath: process.env.BANDIT_CHROME ?? process.env.POCKET_BAND_CHROME } },
    },
    {
      name: 'mobile-webkit',
      testMatch: ['safari.spec.ts', 'phone-motion.spec.ts'],
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run build -- --outDir ' + outDir + ' && npm run preview -- --outDir ' + outDir
      + ' --host 127.0.0.1 --port ' + port + ' --strictPort',
    env: { ...testAuthEnv, GEMINI_API_KEY: '', ELEVENLABS_API_KEY: '' },
    url: baseURL,
    reuseExistingServer: false,
  },
});
