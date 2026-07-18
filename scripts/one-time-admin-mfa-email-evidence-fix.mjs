import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const serverPath = 'scripts/verify-admin-mfa-production.mjs';
const fixturePath = 'tests/launch/verify-same-run-deployment-artifact.test.mjs';
const regressionPath = 'tests/launch/admin-mfa-active-email-production.test.mjs';
const workflowPath = '.github/workflows/one-time-admin-mfa-email-evidence-fix.yml';
const scriptPath = 'scripts/one-time-admin-mfa-email-evidence-fix.mjs';

function replaceExactly(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
}

let server = readFileSync(serverPath, 'utf8');
server = replaceExactly(
  server,
  `  const activeAdminCount = Number(summary?.activeAdminCount || 0);\n  const activeAdminEmailUnverifiedCount = Number(summary?.activeAdminEmailUnverifiedCount || 0);\n  const allActiveAdminsEmailVerified =\n    activeAdminCount > 0 &&\n    activeAdminEmailUnverifiedCount === 0 &&\n    summary?.allActiveAdminsEmailVerified !== false;\n`,
  `  if (!Number.isInteger(summary?.activeAdminEmailUnverifiedCount)) {\n    throw new Error('Admin MFA summary must explicitly include activeAdminEmailUnverifiedCount.');\n  }\n  if (typeof summary?.allActiveAdminsEmailVerified !== 'boolean') {\n    throw new Error('Admin MFA summary must explicitly include allActiveAdminsEmailVerified.');\n  }\n  const activeAdminCount = Number(summary?.activeAdminCount || 0);\n  const activeAdminEmailUnverifiedCount = summary.activeAdminEmailUnverifiedCount;\n  const allActiveAdminsEmailVerified = summary.allActiveAdminsEmailVerified === true;\n`,
  'Admin MFA evidence builder',
);
writeFileSync(serverPath, server);

let fixture = readFileSync(fixturePath, 'utf8');
fixture = replaceExactly(
  fixture,
  `    activeAdminCount: 3,\n    phoneMfaEnrolledCount: 3,\n`,
  `    activeAdminCount: 3,\n    activeAdminEmailUnverifiedCount: 0,\n    phoneMfaEnrolledCount: 3,\n`,
  'same-run Admin MFA count fixture',
);
fixture = replaceExactly(
  fixture,
  `    recoveryQuorumReady: true,\n    allActiveAdminsPhoneMfaReady: true,\n`,
  `    recoveryQuorumReady: true,\n    allActiveAdminsEmailVerified: true,\n    allActiveAdminsPhoneMfaReady: true,\n`,
  'same-run Admin MFA boolean fixture',
);
writeFileSync(fixturePath, fixture);

let regression = readFileSync(regressionPath, 'utf8');
regression = replaceExactly(
  regression,
  `  const evidence = buildAdminMfaEvidence(summary, { env: ENV, now });\n`,
  `  assert.throws(\n    () => buildAdminMfaEvidence({ ...summary, activeAdminEmailUnverifiedCount: undefined }, { env: ENV, now }),\n    /explicitly include activeAdminEmailUnverifiedCount/,\n  );\n  assert.throws(\n    () => buildAdminMfaEvidence({ ...summary, allActiveAdminsEmailVerified: undefined }, { env: ENV, now }),\n    /explicitly include allActiveAdminsEmailVerified/,\n  );\n  const evidence = buildAdminMfaEvidence(summary, { env: ENV, now });\n`,
  'Admin MFA incomplete summary regression',
);
writeFileSync(regressionPath, regression);

unlinkSync(workflowPath);
unlinkSync(scriptPath);
console.log('Applied explicit Admin MFA email evidence fix and removed one-time files.');
