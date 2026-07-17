/**
 * Gate 11 fixture seeder — auth accounts + live role-linked Firestore data.
 * Reads credentials from .env.e2e (never commit that file).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function runStep(label, scriptName) {
  console.log(`\n=== Gate 11 seed: ${label} ===\n`);
  const result = spawnSync('node', [path.join(__dirname, scriptName)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`Gate 11 seed failed at step: ${label}`);
    process.exit(result.status || 1);
  }
}

runStep('Firebase Auth + user profiles', 'seed-e2e-auth.mjs');
runStep('Live role-linked Firestore fixtures', 'seed-live-role-test-data.mjs');
runStep('Tenant correction evidence baseline', 'prepare-tenant-correction-e2e.mjs');
console.log('\nGate 11 fixtures seeded successfully.');
console.log('Profiles: admin, owner, tenant, technician, broker (+ optional technician B when E2E_TECHNICIAN_B_* set).');
console.log('Tenant correction history is reset to a deterministic verified-contact baseline.');
console.log('Run business/walkthrough suites only after this seed completes.\n');
