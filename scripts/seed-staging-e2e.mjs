import { spawnSync } from 'node:child_process';

const STAGING_PROJECT_ID = 'bin-group-staging';
const PRODUCTION_PROJECT_ID = 'bin-group-57c60';

const projectId = String(
  process.env.STAGING_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT_ID ||
  '',
).trim();

if (projectId !== STAGING_PROJECT_ID) {
  throw new Error(
    `Refusing staging E2E seed: expected project '${STAGING_PROJECT_ID}', got '${projectId || '(empty)'}'.`,
  );
}
if (projectId === PRODUCTION_PROJECT_ID) {
  throw new Error('Refusing staging E2E seed against production Firebase.');
}

const roles = [
  ['ADMIN', 'E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'],
  ['OWNER', 'E2E_OWNER_MAILBOX_EMAIL', 'E2E_OWNER_PASSWORD'],
  ['TENANT', 'E2E_TENANT_EMAIL', 'E2E_TENANT_PASSWORD'],
  ['TECHNICIAN', 'E2E_TECHNICIAN_EMAIL', 'E2E_TECHNICIAN_PASSWORD'],
  ['BROKER', 'E2E_BROKER_MAILBOX_EMAIL', 'E2E_BROKER_PASSWORD'],
];

const childEnv = {
  ...process.env,
  GOOGLE_CLOUD_PROJECT: STAGING_PROJECT_ID,
  GCLOUD_PROJECT: STAGING_PROJECT_ID,
  GCP_PROJECT_ID: STAGING_PROJECT_ID,
};

for (const [role, targetEmailVar, targetPasswordVar] of roles) {
  const stagingEmailVar = `STAGING_E2E_${role}_EMAIL`;
  const stagingPasswordVar = `STAGING_E2E_${role}_PASSWORD`;
  const email = String(process.env[stagingEmailVar] || '').trim().toLowerCase();
  const password = String(process.env[stagingPasswordVar] || '');

  if (!email || !password) {
    throw new Error(`Missing ${stagingEmailVar} or ${stagingPasswordVar}.`);
  }
  if (!email.startsWith('e2e-staging-') || !email.endsWith('@bingroup.com')) {
    throw new Error(
      `${stagingEmailVar} must be an isolated staging identity matching e2e-staging-*@bingroup.com.`,
    );
  }
  if (password.length < 16) {
    throw new Error(`${stagingPasswordVar} must be at least 16 characters.`);
  }

  childEnv[targetEmailVar] = email;
  childEnv[targetPasswordVar] = password;
}

const optionalTechnicianBEmail = String(process.env.STAGING_E2E_TECHNICIAN_B_EMAIL || '').trim().toLowerCase();
const optionalTechnicianBPassword = String(process.env.STAGING_E2E_TECHNICIAN_B_PASSWORD || '');
if (optionalTechnicianBEmail || optionalTechnicianBPassword) {
  if (!optionalTechnicianBEmail || !optionalTechnicianBPassword) {
    throw new Error('STAGING_E2E_TECHNICIAN_B_EMAIL and STAGING_E2E_TECHNICIAN_B_PASSWORD must be set together.');
  }
  if (!optionalTechnicianBEmail.startsWith('e2e-staging-') || !optionalTechnicianBEmail.endsWith('@bingroup.com')) {
    throw new Error('STAGING_E2E_TECHNICIAN_B_EMAIL must match e2e-staging-*@bingroup.com.');
  }
  if (optionalTechnicianBPassword.length < 16) {
    throw new Error('STAGING_E2E_TECHNICIAN_B_PASSWORD must be at least 16 characters.');
  }
  childEnv.E2E_TECHNICIAN_B_EMAIL = optionalTechnicianBEmail;
  childEnv.E2E_TECHNICIAN_B_PASSWORD = optionalTechnicianBPassword;
}

function runSeeder(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status}.`);
  }
}

console.log(`Seeding isolated E2E Auth users in ${STAGING_PROJECT_ID}.`);
runSeeder('scripts/seed-e2e-auth.mjs');

console.log(`Seeding isolated E2E role fixtures in ${STAGING_PROJECT_ID}.`);
runSeeder('scripts/seed-live-role-test-data.mjs');

console.log('Staging E2E seed complete. Production was explicitly refused by this wrapper.');
