import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('application evidence workflow is protected and uses fixed production verifiers', async () => {
  const [workflow, verifier, publisher] = await Promise.all([
    read('.github/workflows/operational-application-evidence.yml'),
    read('scripts/verify-operational-application-evidence.mjs'),
    read('scripts/publish-operational-application-evidence.mjs'),
  ]);

  assert.match(workflow, /^name:\s*Operational Application Evidence/m);
  assert.match(workflow, /^\s{2}verify-and-publish:/m);
  assert.match(workflow, /environment:\s*hard-public-launch/);
  assert.match(workflow, /GITHUB_ACTOR.*rashidpvt420-lang/s);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/s);
  assert.match(workflow, /PUBLISH_OPERATIONAL_APPLICATION_EVIDENCE/);
  assert.match(workflow, /expected_commit_sha.*GITHUB_SHA/s);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /verify-operational-application-evidence\.mjs/);
  assert.match(workflow, /publish-operational-application-evidence\.mjs/);

  const gates = [
    'ownerPaymentActivation',
    'paymentUnlockExactlyOnce',
    'tenantNotificationDelivery',
    'brokerCommissionLockExactlyOnce',
    'adminStaffClaims',
    'renewalScheduler',
  ];
  for (const gate of gates) {
    assert.match(workflow, new RegExp(gate));
    assert.match(verifier, new RegExp(`${gate}:`));
    assert.match(publisher, new RegExp(`${gate}:`));
  }
  assert.doesNotMatch(`${workflow}\n${verifier}\n${publisher}`, /GATE_STATUS|founder_attested|waiv|static green/i);
  assert.doesNotMatch(workflow, /technicianPhysicalGpsEvidence/);
});

test('payment and commission evidence use the real callable and prove replay invariants', async () => {
  const [verifier, approval, commission] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('functions/paymentTransactionApproval.ts'),
    read('functions/brokerCommissions.ts'),
  ]);

  assert.match(verifier, /cloudfunctions\.net\/adminApprovePayment/);
  assert.match(verifier, /payload\?\.idempotent !== true/);
  assert.match(verifier, /invoicesAfter\.length !== 1/);
  assert.match(verifier, /approvalAuditsAfter\.length !== 1/);
  assert.match(verifier, /JSON\.stringify\(before\) !== JSON\.stringify\(after\)/);
  assert.match(verifier, /commission_${contractId}/);
  assert.match(verifier, /commissionsAfter\.length !== 1/);
  assert.match(verifier, /beforeHash !== afterHash/);
  assert.match(approval, /approvalWasIdempotent = true/);
  assert.match(commission, /const commissionId = `commission_\$\{contractId\}`/);
  assert.match(commission, /transaction\.create\(commissionRef/);
});

test('tenant notification proof requires tenant binding, photo evidence and successful FCM delivery', async () => {
  const [verifier, delivery] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('functions/notificationDelivery.ts'),
  ]);

  assert.match(verifier, /pushDeliveryState\) !== 'SUCCESS'/);
  assert.match(verifier, /pushSuccessCount \|\| 0\) < 1/);
  assert.match(verifier, /pushFailureCount \|\| 0\) !== 0/);
  assert.match(verifier, /photoEvidence\(ticket\.data\)/);
  assert.match(verifier, /ticket is not bound to the tenant/);
  assert.match(verifier, /property and unit/);
  assert.match(delivery, /pushDeliveryState:\s*deliveryState/);
  assert.match(delivery, /sendEachForMulticast/);
});

test('staff evidence requires one audited technician with no privileged claims', async () => {
  const [verifier, provisioning] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('functions/adminUserProvisioning.ts'),
  ]);

  assert.match(verifier, /role !== 'technician'/);
  assert.match(verifier, /claims\.admin === true/);
  assert.match(verifier, /canManageSecurity/);
  assert.match(verifier, /creationAudits\.length !== 1/);
  assert.match(provisioning, /ADMIN_CREATE_STAFF_USER/);
  assert.match(provisioning, /staffAccess/);
  assert.match(provisioning, /hrProfiles/);
  assert.match(provisioning, /technicians/);
});

test('renewal proof requires a linked source, correct timeline, PDF and scheduler provenance', async () => {
  const [verifier, tenantPage] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('src/tenant/pages/TenantRenewalsPage.tsx'),
  ]);

  assert.match(verifier, /contract_renewal_watch/);
  assert.match(verifier, /sourceCollection/);
  assert.match(verifier, /sourceId/);
  assert.match(verifier, /daysRemaining/);
  assert.match(verifier, /pdfUrl/);
  assert.match(verifier, /scheduler provenance/);
  assert.match(tenantPage, /contract_renewal_watch/);
  assert.match(tenantPage, /Open Renewal PDF/);
});
