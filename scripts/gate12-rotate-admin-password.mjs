/**
 * Gate 12 — Rotate E2E admin password in Firebase Auth and update local .env.e2e only.
 * Does not print the new password; check .env.e2e after success.
 */
import admin from 'firebase-admin';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadProjectEnv, resolveFirebaseWebApiKey, firebaseRestHeaders } from './load-project-env.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.e2e');
const PROJECT = process.env.GCLOUD_PROJECT || 'bin-group-57c60';

if (!existsSync(envPath)) {
  console.error('Missing .env.e2e — create it before running password rotation.');
  process.exit(1);
}

loadProjectEnv();

const email = String(process.env.E2E_ADMIN_EMAIL || '').trim().toLowerCase();
const oldPassword = String(process.env.E2E_ADMIN_PASSWORD || '');

if (!email || !oldPassword) {
  console.error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set in .env.e2e');
  process.exit(1);
}

const newPassword = process.env.GATE12_NEW_ADMIN_PASSWORD || `BinE2e${randomBytes(12).toString('hex')}2026`;

async function verifyPassword(targetEmail, password) {
  const apiKey = resolveFirebaseWebApiKey();
  if (!apiKey) {
    console.error('[FAIL] Set VITE_FIREBASE_API_KEY in .env or .env.production for REST login verification.');
    return false;
  }
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers: firebaseRestHeaders(),
      body: JSON.stringify({ email: targetEmail, password, returnSecureToken: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.idToken) return true;
    const waitMs = 1500 * (attempt + 1);
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return false;
}

if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });

function updateEnvFile(key, value) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  let replaced = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) next.push(`${key}=${value}`);
  writeFileSync(envPath, `${next.join('\n').replace(/\n*$/, '')}\n`, 'utf8');
}

async function main() {
  console.log(`\n=== Gate 12 Admin Password Rotation (${email}) ===\n`);

  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().updateUser(user.uid, { password: newPassword, emailVerified: true, disabled: false });
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const oldStillWorks = await verifyPassword(email, oldPassword);
  const newWorks = await verifyPassword(email, newPassword);

  if (!newWorks) {
    console.error('[FAIL] New password does not authenticate via Firebase Auth REST API.');
    console.error('Auth user was updated — check Identity Toolkit / authorized domains, then retry.');
    process.exit(1);
  }
  if (oldStillWorks) {
    console.error('[FAIL] Old password still authenticates — rotation did not take effect.');
    process.exit(1);
  }

  updateEnvFile('E2E_ADMIN_PASSWORD', newPassword);
  console.log('[PASS] Firebase Auth password rotated for E2E admin.');
  console.log('[PASS] Old password rejected, new password accepted.');
  console.log('[PASS] Updated E2E_ADMIN_PASSWORD in .env.e2e (local only — not committed).');
  console.log('\nNext: update GitHub secret E2E_ADMIN_PASSWORD for CI, then re-run npm run test:e2e:gate11:staging');
}

main().catch((err) => {
  console.error('[FAIL]', err.message || err);
  process.exit(1);
});
