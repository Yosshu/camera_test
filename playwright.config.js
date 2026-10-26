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
    // ヘッドレス専用の軽量版はカメラ API が NotSupportedError になるため、通常版の Chromium を使う
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    url: BASE_URL,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
