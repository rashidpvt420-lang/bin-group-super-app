import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public hard-launch decision is routed through canonical operational evidence', async () => {
  const [packageSource, collector, guard, decision, workflow] = await Promise.all([
    read('package.json'),
    read('scripts/capture-operational-readiness.mjs'),
    read('scripts/hard-launch-operational-decision-gate.mjs'),
    read('scripts/hard-launch-decision-gate.mjs'),
    read('.github/workflows/firebase-production-deploy.yml'),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.equal(
    packageJson.scripts['hard-launch:decision'],
    'node scripts/hard-launch-operational-decision-gate.mjs',
  );
  assert.match(workflow, /run:\s*npm run hard-launch:decision/);

  assert.match(collector, /system_health\/admin_summaries/);
  assert.match(collector, /hardLaunchOperationalGates/);
  assert.match(collector, /REQUIRED_OPERATIONAL_GATES/);
  assert.match(collector, /executionGenerated !== true/);
  assert.match(collector, /verifiedBy !== 'workflow'/);
  assert.match(collector, /GITHUB_ACTIONS !== 'true'/);
  assert.match(collector, /refs\/heads\/main/);
  assert.match(collector, /operationalReadinessPath/);
  assert.doesNotMatch(collector, /founder_attested|manual proof|static green/i);

  assert.match(guard, /launchMode !== 'public'/);
  assert.match(guard, /capture-operational-readiness\.mjs/);
  assert.match(guard, /validateOperationalReadinessReport/);
  assert.match(guard, /operationalReadinessHash/);
  assert.match(guard, /operationalGateCount = REQUIRED_OPERATIONAL_GATES\.length/);
  assert.match(guard, /hard-launch-decision-gate\.mjs/);

  assert.match(decision, /publicReleaseStatus:\s*sha256File\(paths\.publicReleaseStatus\)/);
});

test('all required operational gates remain explicit and non-waivable in the collector path', async () => {
  const [gateSource, collector] = await Promise.all([
    read('scripts/lib/hard-launch-gate.mjs'),
    read('scripts/capture-operational-readiness.mjs'),
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
  assert.match(collector, /for \(const key of REQUIRED_OPERATIONAL_GATES\)/);
  assert.doesNotMatch(collector, /required\s*!==\s*false|waiv|skip/i);
});
