import { loadProjectEnv, repoRoot } from './load-project-env.mjs';
import path from 'node:path';

loadProjectEnv();

const roles = ['ADMIN', 'OWNER', 'TENANT', 'TECHNICIAN', 'BROKER'];

function isLocalhostUrl(raw) {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  } catch {
    return true;
  }
}

const baseUrl = String(process.env.E2E_BASE_URL || '').trim();
const strictRoles =
  process.env.E2E_STRICT_ROLES === 'true' ||
  (Boolean(baseUrl) && !isLocalhostUrl(baseUrl) && process.env.E2E_STRICT_ROLES !== 'false');
const keys = [
  'E2E_BASE_URL',
  ...(strictRoles ? ['E2E_ADMIN_BASE_URL'] : []),
  ...roles.flatMap((role) => [`E2E_${role}_EMAIL`, `E2E_${role}_PASSWORD`]),
];
const missing = keys.filter((key) => !String(process.env[key] || '').trim());
const allowMissing = process.env.E2E_ALLOW_MISSING_ENV === 'true';
const failures = [];

function isPlaceholderCredential(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized.length < 8) return true;
  return [
    'changeme',
    'password',
    'password123',
    'test1234',
    'placeholder',
    'your-password',
    'e2e-password',
    'admin123',
  ].some((token) => normalized === token || normalized.includes(token));
}

const adminUrl = String(process.env.E2E_ADMIN_BASE_URL || '').trim();
if (baseUrl && isLocalhostUrl(baseUrl)) failures.push('E2E_BASE_URL must be production/staging, not localhost');
if (strictRoles && adminUrl && isLocalhostUrl(adminUrl)) failures.push('E2E_ADMIN_BASE_URL must be production/staging, not localhost');

const emails = new Map();
const passwords = new Map();
for (const role of roles) {
  const email = String(process.env[`E2E_${role}_EMAIL`] || '').trim().toLowerCase();
  const password = String(process.env[`E2E_${role}_PASSWORD`] || '').trim();
  if (email) {
    const other = emails.get(email);
    if (other && other !== role) failures.push(`shared email across roles: ${other} and ${role}`);
    else emails.set(email, role);
  }
  if (password) {
    if (isPlaceholderCredential(password)) failures.push(`E2E_${role}_PASSWORD looks like a placeholder`);
    const other = passwords.get(password);
    if (other && other !== role) failures.push(`shared password across roles: ${other} and ${role}`);
    else passwords.set(password, role);
  }
}

const e2ePath = path.join(repoRoot, '.env.e2e');
console.log('[E2E_ENV_GUARD] loaded=' + e2ePath);
console.log('[E2E_ENV_GUARD] target=' + (process.env.E2E_BASE_URL || '(missing)'));
console.log('[E2E_ENV_GUARD] admin_target=' + (process.env.E2E_ADMIN_BASE_URL || (strictRoles ? '(missing)' : '(not required for this run)')));
for (const role of roles) {
  console.log(
    `[E2E_ENV_GUARD] ${role}: email=${process.env[`E2E_${role}_EMAIL`] ? 'set' : 'missing'} credential=${process.env[`E2E_${role}_PASSWORD`] ? 'set' : 'missing'}`
  );
}

if (missing.length) {
  console.error('[E2E_ENV_GUARD] missing=' + missing.join(', '));
  if (!allowMissing) {
    console.error(
      '[E2E_ENV_GUARD] Launch audit blocked. Set all required E2E values in .env.e2e or injected secrets. E2E_ALLOW_MISSING_ENV=true is permitted only for non-launch local smoke work.'
    );
    process.exit(1);
  }
  console.warn('[E2E_ENV_GUARD] Continuing with missing values because E2E_ALLOW_MISSING_ENV=true. This must not be used for launch clearance.');
} else if (failures.length) {
  console.error('[E2E_ENV_GUARD] invalid=' + failures.join('; '));
  process.exit(1);
} else {
  console.log('[E2E_ENV_GUARD] ok');
}
