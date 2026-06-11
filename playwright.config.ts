import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env.e2e for local runs (contains E2E_*_EMAIL/PASSWORD credentials).
// In CI, these vars come from GitHub Secrets and take precedence.
const possibleConfigPaths = [
  path.resolve(__dirname, '.env.e2e'),
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
];
for (const p of possibleConfigPaths) {
  if (existsSync(p)) {
    loadDotenv({ path: p, override: false });
    break;
  }
}

const hasExplicitBaseURL = Boolean(process.env.E2E_BASE_URL);
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:4173';
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
        command: 'npm run preview -- --host localhost --port 4173 --strictPort',
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
