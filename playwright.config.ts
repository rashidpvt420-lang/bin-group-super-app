import { defineConfig, devices } from '@playwright/test';

const hasExplicitBaseURL = Boolean(process.env.E2E_BASE_URL);
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const ciMode = Boolean(process.env.CI);

const projects = ciMode
  ? [
      { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
      { name: 'android-mobile', use: { ...devices['Pixel 7'] } },
    ]
  : [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } }];

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: ciMode ? 1 : 0,
  reporter: ciMode ? [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']] : 'list',
  webServer: hasExplicitBaseURL
    ? undefined
    : {
        command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects,
});
