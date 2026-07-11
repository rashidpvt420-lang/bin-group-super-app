/**
 * Phase 1 baseline runner — writes launch-phase1-results.txt at repo root.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = [];

function run(label, cmd, args, { timeoutMs = 600000 } = {}) {
  out.push(`\n========== ${label} ==========`);
  const started = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: timeoutMs,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      E2E_BASE_URL: process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app',
      E2E_ADMIN_BASE_URL: process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app',
    },
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const tail = text.split(/\r?\n/).slice(-35).join('\n');
  out.push(`EXIT: ${result.status ?? 'null'} (${elapsed}s)`);
  out.push('--- TAIL ---');
  out.push(tail || '(no output)');
  if (result.error) out.push(`ERROR: ${result.error.message}`);
  return result.status ?? 1;
}

out.push(`repoRoot=${repoRoot}`);
out.push(`utc=${new Date().toISOString()}`);

const steps = [
  ['build', 'npm', ['run', 'build']],
  ['build:functions', 'npm', ['run', 'build:functions']],
  ['test:stability', 'npm', ['run', 'test:stability']],
  ['test:gate12:controls', 'npm', ['run', 'test:gate12:controls']],
  ['test:gate12:smtp', 'npm', ['run', 'test:gate12:smtp']],
  ['test:gate12:appcheck', 'npm', ['run', 'test:gate12:appcheck']],
  ['test:e2e:env', 'npm', ['run', 'test:e2e:env']],
  ['test:e2e:auth-rest', 'npm', ['run', 'test:e2e:auth-rest']],
  ['test:gate12:stripe', 'npm', ['run', 'test:gate12:stripe']],
];

const summary = [];
for (const [label, cmd, args] of steps) {
  const code = run(label, cmd, args);
  summary.push(`${label}: ${code === 0 ? 'PASS' : 'FAIL'} (${code})`);
}

out.push('\n========== SUMMARY ==========');
out.push(summary.join('\n'));

const dest = path.join(repoRoot, 'launch-phase1-results.txt');
writeFileSync(dest, out.join('\n'), 'utf8');
console.log(`Wrote ${dest}`);
console.log(summary.join('\n'));
