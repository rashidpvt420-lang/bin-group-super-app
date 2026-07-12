import { existsSync } from 'fs';
import { config as loadDotenv } from 'dotenv';
import path from 'path';

const possibleConfigPaths = [
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
];

for (const envPath of possibleConfigPaths) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
    console.log('[E2E_ENV_GUARD] loaded=' + envPath);
    break;
  }
}

const roles = ['ADMIN', 'OWNER', 'TENANT', 'TECHNICIAN', 'BROKER'];
const strictRoles = process.env.E2E_STRICT_ROLES === 'true';
const keys = [
  'E2E_BASE_URL',
  ...(strictRoles ? ['E2E_ADMIN_BASE_URL'] : []),
  ...roles.flatMap((role) => [`E2E_${role}_EMAIL`, `E2E_${role}_PASSWORD`]),
];
const missing = keys.filter((key) => !String(process.env[key] || '').trim());
const allowMissing = process.env.E2E_ALLOW_MISSING_ENV === 'true';

const PLACEHOLDER_PATTERNS = [
  /^your[_-]?registered[_-]?uuid$/i,
  /^replace[_-]?(me|with)/i,
  /^xxx+$/i,
  /^todo$/i,
  /^changeme$/i,
  /^false$/i,
  /^true$/i,
];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function maskToken(token) {
  if (!token || token.length < 12) return '(invalid)';
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function validateAppCheckToken() {
  const token = String(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim();
  const skip = process.env.E2E_SKIP_APPCHECK_TOKEN === 'true';
  if (skip) {
    console.warn('[E2E_ENV_GUARD] App Check token check skipped via E2E_SKIP_APPCHECK_TOKEN=true (not allowed for launch clearance).');
    return [];
  }
  if (!token) return ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN'];
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(token)) || token.includes('YOUR_REGISTERED_UUID')) {
    console.error('[E2E_ENV_GUARD] VITE_FIREBASE_APPCHECK_DEBUG_TOKEN is a placeholder and must be a Console-registered UUID.');
    return ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN(placeholder)'];
  }
  if (!UUID_RE.test(token)) {
    console.error('[E2E_ENV_GUARD] VITE_FIREBASE_APPCHECK_DEBUG_TOKEN is malformed; expected UUID.');
    return ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN(malformed)'];
  }
  console.log('[E2E_ENV_GUARD] appcheck_token_fingerprint=' + maskToken(token));
  return [];
}

console.log('[E2E_ENV_GUARD] target=' + (process.env.E2E_BASE_URL || '(missing)'));
console.log('[E2E_ENV_GUARD] admin_target=' + (process.env.E2E_ADMIN_BASE_URL || (strictRoles ? '(missing)' : '(not required for this run)')));
for (const role of roles) {
  console.log(`[E2E_ENV_GUARD] ${role}: email=${process.env[`E2E_${role}_EMAIL`] ? 'set' : 'missing'} credential=${process.env[`E2E_${role}_PASSWORD`] ? 'set' : 'missing'}`);
}

const appCheckMissing = validateAppCheckToken();
const allMissing = [...missing, ...appCheckMissing];

const techBEmail = String(process.env.E2E_TECHNICIAN_B_EMAIL || '').trim();
const techBPassword = String(process.env.E2E_TECHNICIAN_B_PASSWORD || '').trim();
if ((techBEmail && !techBPassword) || (!techBEmail && techBPassword)) {
  console.error('[E2E_ENV_GUARD] E2E_TECHNICIAN_B_EMAIL and E2E_TECHNICIAN_B_PASSWORD must both be set together.');
  process.exit(1);
}
if (techBEmail) {
  console.log('[E2E_ENV_GUARD] TECHNICIAN_B: email=set credential=set (optional walkthrough only)');
}

if (process.env.E2E_STRICT_BUSINESS === 'true') {
  if (!String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()) {
    console.error('[E2E_ENV_GUARD] FIREBASE_SERVICE_ACCOUNT_JSON is required when E2E_STRICT_BUSINESS=true (business-admin Firestore seed).');
    process.exit(1);
  }
  console.log('[E2E_ENV_GUARD] business-admin service account: set');
}

if (allMissing.length) {
  console.error('[E2E_ENV_GUARD] missing=' + allMissing.join(', '));
  if (!allowMissing) {
    console.error('[E2E_ENV_GUARD] Launch audit blocked. Set all required E2E values in .env.e2e or injected secrets. E2E_ALLOW_MISSING_ENV=true is permitted only for non-launch local smoke work.');
    process.exit(1);
  }
  console.warn('[E2E_ENV_GUARD] Continuing with missing values because E2E_ALLOW_MISSING_ENV=true. This must not be used for launch clearance.');
} else {
  console.log('[E2E_ENV_GUARD] ok');
}
