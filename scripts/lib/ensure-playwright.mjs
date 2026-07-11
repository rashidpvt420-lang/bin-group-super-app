/**
 * Install Playwright Chromium without --with-deps on Windows (avoids flaky system-deps + large downloads).
 */
import { spawnSync } from 'node:child_process';

const useDeps = process.env.CI === 'true' || process.env.PLAYWRIGHT_WITH_DEPS === '1';
const args = useDeps
  ? ['playwright', 'install', '--with-deps', 'chromium']
  : ['playwright', 'install', 'chromium'];

const result = spawnSync('npx', args, {
  shell: true,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
