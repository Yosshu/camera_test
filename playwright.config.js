import { defineConfig, devices } from '@playwright/test';

const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}/camera_test/`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    // 実機のカメラの代わりに Chromium のダミーカメラを2台使う
    permissions: ['camera'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream=device-count=2'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    url: BASE_URL,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
