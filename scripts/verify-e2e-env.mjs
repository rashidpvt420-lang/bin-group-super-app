import { existsSync } from 'fs';
import { config as loadDotenv } from 'dotenv';
import path from 'path';

const possibleConfigPaths = [
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
];

for (const envPath of possibleConfigPaths) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
    console.log('[E2E_ENV_GUARD] loaded=' + envPath);
    break;
  }
}

const roles = ['ADMIN', 'OWNER', 'TENANT', 'TECHNICIAN', 'BROKER'];
const keys = ['E2E_BASE_URL', ...roles.flatMap((role) => [`E2E_${role}_EMAIL`, `E2E_${role}_PASSWORD`])];
const placeholderPattern = /^(?:replace[_-]?me|changeme|password|example|test|dummy|placeholder|e2e_[a-z_]+|your[_-].*)$/i;

function valueState(key) {
  const value = String(process.env[key] || '').trim();
  if (!value) return 'missing';
  if (placeholderPattern.test(value)) return 'placeholder';
  if (key.endsWith('_EMAIL') && !/^\S+@\S+\.\S+$/.test(value)) return 'invalid-email';
  if (key.endsWith('_PASSWORD') && value.length < 10) return 'weak-or-invalid';
  if (key === 'E2E_BASE_URL' && !/^https:\/\//i.test(value)) return 'invalid-url';
  return 'set';
}

const invalid = keys.map((key) => ({ key, state: valueState(key) })).filter((entry) => entry.state !== 'set');
const allowMissing = process.env.E2E_ALLOW_MISSING_ENV === 'true';

console.log('[E2E_ENV_GUARD] target=' + (process.env.E2E_BASE_URL || '(missing)'));
for (const role of roles) {
  console.log(`[E2E_ENV_GUARD] ${role}: email=${valueState(`E2E_${role}_EMAIL`)} credential=${valueState(`E2E_${role}_PASSWORD`)}`);
}

if (invalid.length) {
  console.error('[E2E_ENV_GUARD] invalid=' + invalid.map(({ key, state }) => `${key}:${state}`).join(', '));
  if (!allowMissing) {
    console.error('[E2E_ENV_GUARD] Launch audit blocked. Configure real protected E2E credentials for all five profiles. Variable names or placeholder strings are not credentials.');
    process.exit(1);
  }
  console.warn('[E2E_ENV_GUARD] Continuing only because E2E_ALLOW_MISSING_ENV=true. This mode is forbidden for launch clearance.');
} else {
  console.log('[E2E_ENV_GUARD] ok');
}
