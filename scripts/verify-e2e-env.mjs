const roles = ['ADMIN', 'OWNER', 'TENANT', 'TECHNICIAN', 'BROKER'];
const keys = ['E2E_BASE_URL', ...roles.flatMap((role) => [`E2E_${role}_EMAIL`, `E2E_${role}_PASSWORD`])];
const missing = keys.filter((key) => !String(process.env[key] || '').trim());
const strict = process.env.E2E_STRICT_ROLES === 'true';

console.log('[E2E_ENV_GUARD] target=' + (process.env.E2E_BASE_URL || '(missing)'));
for (const role of roles) {
  console.log(`[E2E_ENV_GUARD] ${role}: email=${process.env[`E2E_${role}_EMAIL`] ? 'set' : 'missing'} credential=${process.env[`E2E_${role}_PASSWORD`] ? 'set' : 'missing'}`);
}

if (missing.length) {
  console[strict ? 'error' : 'warn']('[E2E_ENV_GUARD] missing=' + missing.join(', '));
  if (strict) process.exit(1);
} else {
  console.log('[E2E_ENV_GUARD] ok');
}
