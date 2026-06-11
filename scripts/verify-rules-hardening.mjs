import { spawnSync } from 'node:child_process';

const result = spawnSync('node', ['scripts/harden-firestore-rules.mjs', '--verify'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
