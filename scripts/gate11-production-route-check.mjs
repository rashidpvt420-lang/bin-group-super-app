import { spawnSync } from 'node:child_process';
process.exit(spawnSync(process.execPath, ['scripts/gate11-staging-route-check.mjs'], { stdio: 'inherit' }).status ?? 1);
