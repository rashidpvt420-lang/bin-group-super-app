import { spawnSync } from 'node:child_process';
import { runNpmScript } from './lib/run-script.mjs';

process.env.E2E_BASE_URL = process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app';

const result = runNpmScript('test:e2e:launch-audit', { inherit: true });
process.exit(result.status ?? 1);
