import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.RELAYOPS_E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CI ? {} : { executablePath: '/usr/bin/google-chrome' }
  },
  webServer: externalBaseUrl ? undefined : {
    command: 'pnpm --dir ../.. dev',
    url: 'http://127.0.0.1:3000/demo',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } }
  ]
});
