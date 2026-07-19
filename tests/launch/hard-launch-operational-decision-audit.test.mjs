import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public hard-launch decision consumes protected operational evidence', async () => {
  const [packageSource, verifier, guard, decision, deployWorkflow, liveWorkflow] = await Promise.all([
    read('package.json'),
    read('scripts/verify-operational-readiness.mjs'),
    read('scripts/hard-launch-operational-decision-gate.mjs'),
    read('scripts/hard-launch-decision-gate.mjs'),
    read('.github/workflows/firebase-production-deploy.yml'),
    read('.github/workflows/live-role-smoke.yml'),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.equal(
    packageJson.scripts['hard-launch:decision'],
    'node scripts/hard-launch-operational-decision-gate.mjs',
  );
  assert.match(deployWorkflow, /run:\s*npm run hard-launch:decision/);
  assert.match(deployWorkflow, /hard-public-launch-clearance-\$\{\{ github\.sha \}\}/);
  assert.match(liveWorkflow, /run:\s*node scripts\/verify-operational-readiness\.mjs/);
  assert.match(liveWorkflow, /launch_package\/operational-readiness\.json/);

  assert.match(verifier, /system_health\/admin_summaries/);
  assert.match(verifier, /operationalEvidence/);
  assert.match(verifier, /REQUIRED_OPERATIONAL_GATES/);
  assert.match(verifier, /Live Role Smoke Tests/);
  assert.match(verifier, /hard-public-launch-clearance/);
  assert.match(verifier, /refs\/heads\/main/);
  assert.match(verifier, /validateOperationalReadinessReport/);

  assert.match(guard, /launchMode !== 'public'/);
  assert.match(guard, /hard_clearance\/operational-readiness\.json/);
  assert.match(guard, /hard_clearance\/launch_package\/operational-readiness\.json/);
  assert.match(guard, /validateOperationalReadinessReport/);
  assert.match(guard, /operationalReadinessHash/);
  assert.match(guard, /operationalGateCount = REQUIRED_OPERATIONAL_GATES\.length/);
  assert.match(guard, /hard-launch-decision-gate\.mjs/);
  assert.doesNotMatch(guard, /founder_attested|static green|manual proof/i);

  assert.match(decision, /publicReleaseStatus:\s*sha256File\(paths\.publicReleaseStatus\)/);
});

test('all required operational gates remain explicit and non-waivable', async () => {
  const [gateSource, verifier, guard] = await Promise.all([
    read('scripts/lib/hard-launch-gate.mjs'),
    read('scripts/verify-operational-readiness.mjs'),
    read('scripts/hard-launch-operational-decision-gate.mjs'),
  ]);
  const expected = [
    'ownerPaymentActivation',
    'paymentUnlockExactlyOnce',
    'tenantNotificationDelivery',
    'technicianPhysicalGpsEvidence',
    'brokerCommissionLockExactlyOnce',
    'adminStaffClaims',
    'stripeLiveBilling',
    'appCheckEnforcement',
    'privilegedAccessRotation',
    'brandedEmailDelivery',
    'renewalScheduler',
  ];

  for (const gate of expected) assert.match(gateSource, new RegExp(`['"]${gate}['"]`));
  assert.match(verifier, /for \(const key of REQUIRED_OPERATIONAL_GATES\)/);
  assert.match(guard, /operationalGateCount = REQUIRED_OPERATIONAL_GATES\.length/);
  assert.doesNotMatch(`${verifier}\n${guard}`, /required\s*!==\s*false|waiv|skip/i);
});
