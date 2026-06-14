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
const missing = keys.filter((key) => !String(process.env[key] || '').trim());
const allowMissing = process.env.E2E_ALLOW_MISSING_ENV === 'true';

console.log('[E2E_ENV_GUARD] target=' + (process.env.E2E_BASE_URL || '(missing)'));
for (const role of roles) {
  console.log(`[E2E_ENV_GUARD] ${role}: email=${process.env[`E2E_${role}_EMAIL`] ? 'set' : 'missing'} credential=${process.env[`E2E_${role}_PASSWORD`] ? 'set' : 'missing'}`);
}

if (missing.length) {
  console.error('[E2E_ENV_GUARD] missing=' + missing.join(', '));
  if (!allowMissing) {
    console.error('[E2E_ENV_GUARD] Launch audit blocked. Set all required E2E_* values in .env.e2e or export E2E_ALLOW_MISSING_ENV=true only for non-launch local smoke work.');
    process.exit(1);
  }
  console.warn('[E2E_ENV_GUARD] Continuing with missing values because E2E_ALLOW_MISSING_ENV=true. This must not be used for launch clearance.');
} else {
  console.log('[E2E_ENV_GUARD] ok');
}
