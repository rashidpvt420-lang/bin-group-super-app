/**
 * Gate 12 — Rotate all five E2E role passwords to unique values via Firebase Admin.
 * Updates local .env.e2e only (never committed). Does not print new passwords.
 */
import admin from 'firebase-admin';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv, resolveFirebaseWebApiKey, firebaseRestHeaders } from './load-project-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.e2e');
const PROJECT = process.env.GCLOUD_PROJECT || 'bin-group-57c60';

const ROLES = ['ADMIN', 'OWNER', 'TENANT', 'TECHNICIAN', 'BROKER'];

if (!existsSync(envPath)) {
  console.error('Missing .env.e2e — create it before running password rotation.');
  process.exit(1);
}

loadProjectEnv();

function roleConfig(role) {
  const email = String(process.env[`E2E_${role}_EMAIL`] || '').trim().toLowerCase();
  const password = String(process.env[`E2E_${role}_PASSWORD`] || '');
  if (!email || !password) {
    throw new Error(`E2E_${role}_EMAIL and E2E_${role}_PASSWORD must be set in .env.e2e`);
  }
  return { role, email, oldPassword: password };
}

function generatePassword(role) {
  const override = process.env[`GATE12_NEW_${role}_PASSWORD`];
  if (override) return override;
  return `BinE2e${role.toLowerCase()}${randomBytes(12).toString('hex')}2026`;
}

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
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
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

async function rotateRole({ role, email, oldPassword }) {
  const newPassword = generatePassword(role);
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().updateUser(user.uid, { password: newPassword, emailVerified: true, disabled: false });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const oldStillWorks = await verifyPassword(email, oldPassword);
  const newWorks = await verifyPassword(email, newPassword);

  if (!newWorks) {
    throw new Error(`${role}: new password does not authenticate via Firebase Auth REST API`);
  }
  if (oldStillWorks) {
    throw new Error(`${role}: old password still authenticates — rotation did not take effect`);
  }

  updateEnvFile(`E2E_${role}_PASSWORD`, newPassword);
  console.log(`[PASS] ${role} (${email}) — password rotated; E2E_${role}_PASSWORD updated in .env.e2e`);
  return newPassword;
}

async function main() {
  console.log('\n=== Gate 12 E2E Role Password Rotation (all five roles) ===\n');

  const configs = ROLES.map(roleConfig);
  const newPasswords = new Map();

  for (const config of configs) {
    const pw = await rotateRole(config);
    newPasswords.set(config.role, pw);
  }

  const unique = new Set(newPasswords.values());
  if (unique.size !== ROLES.length) {
    console.error('[FAIL] Generated passwords are not unique across roles — aborting.');
    process.exit(1);
  }

  console.log('\n[PASS] All five E2E role passwords rotated to unique values.');
  console.log('\nLocal only — .env.e2e was updated on this machine. Do NOT commit .env.e2e.');
  console.log('\nNext steps:');
  console.log('  1. Sync matching E2E_*_PASSWORD values to GitHub Actions secrets (if CI uses them).');
  console.log('  2. npm run seed:e2e:auth          # sync Firebase Auth + Firestore profiles');
  console.log('  3. npm run test:e2e:env           # confirm no shared-password rejection');
  console.log('  4. npm run test:e2e:auth-rest     # REST sign-in for all five roles');
  console.log('  5. npm run test:e2e:gate11:production');
}

main().catch((err) => {
  console.error('[FAIL]', err.message || err);
  process.exit(1);
});
