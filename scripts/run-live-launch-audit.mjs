import { spawnSync } from 'node:child_process';

process.env.E2E_BASE_URL = process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCmd, ['run', 'test:e2e:launch-audit'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
