/**
 * Gate 11 fixture seeder — auth accounts + live role-linked Firestore data.
 * Reads credentials from .env.e2e (never commit that file).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFirebaseAdminCredentials } from './lib/firebase-admin-bootstrap.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

assertFirebaseAdminCredentials();

function runStep(label, scriptName) {
  console.log(`\n=== Gate 11 seed: ${label} ===\n`);
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName)], {
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
runStep('Launch workflow fixtures (technician ticket, broker, owner)', 'seed-launch-workflow-fixtures.mjs');
console.log('\nGate 11 fixtures seeded successfully.\n');
