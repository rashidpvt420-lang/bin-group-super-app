import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('application evidence workflow is protected and auto-discovers fixed production records', async () => {
  const [workflow, verifier, publisher] = await Promise.all([
    read('.github/workflows/operational-application-evidence.yml'),
    read('scripts/verify-operational-application-evidence.mjs'),
    read('scripts/publish-operational-application-evidence.mjs'),
  ]);

  assert.match(workflow, /^name:\s*Operational Application Evidence/m);
  assert.match(workflow, /^\s{2}verify-and-publish:/m);
  assert.match(workflow, /environment:\s*hard-public-launch/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS:\s*\$\{\{ secrets\.AUTHORIZED_FOUNDER_ACTORS \}\}/);
  assert.match(workflow, /allowed_actors/);
  assert.match(workflow, /GITHUB_ACTOR.*allowed_actor/s);
  assert.doesNotMatch(workflow, /GITHUB_ACTOR.*rashidpvt420-lang/s);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/s);
  assert.match(workflow, /PUBLISH_OPERATIONAL_APPLICATION_EVIDENCE/);
  assert.match(workflow, /expected_commit_sha.*GITHUB_SHA/s);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /Auto-discover and verify production application evidence/);
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
    assert.match(verifier, new RegExp(gate));
    assert.match(publisher, new RegExp(`${gate}:`));
  }
  assert.match(workflow, /path:\s*launch_package\/application-proof\.json/);
  assert.match(verifier, /const APPLICATION_PROOF_PATH = 'launch_package\/application-proof\.json';/);
  assert.match(verifier, /writeFileSync\(APPLICATION_PROOF_PATH,/);
  assert.match(publisher, /readFileSync\('launch_package\/application-proof\.json'/);
  assert.match(publisher, /sha256File\('launch_package\/application-proof\.json'\)/);
  assert.doesNotMatch(`${workflow}\n${verifier}\n${publisher}`, /application-(?:ownerPaymentActivation|paymentUnlockExactlyOnce|tenantNotificationDelivery|brokerCommissionLockExactlyOnce|adminStaffClaims|renewalScheduler)\.json/);
  assert.doesNotMatch(workflow, /payment_id:|contract_id:|notification_id:|ticket_id:|tenant_uid:|staff_uid:|renewal_watch_id:/);
  assert.doesNotMatch(verifier, /process\.env\.(?:PAYMENT_ID|CONTRACT_ID|NOTIFICATION_ID|TICKET_ID|TENANT_UID|STAFF_UID|RENEWAL_WATCH_ID)/);
  assert.doesNotMatch(`${workflow}\n${verifier}\n${publisher}`, /GATE_STATUS|founder_attested|waiv|static green/i);
  assert.doesNotMatch(workflow, /technicianPhysicalGpsEvidence/);
});

test('payment and commission evidence auto-discovers records, uses the real callable and proves replay invariants', async () => {
  const [verifier, approval, commission] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('functions/paymentTransactionApproval.ts'),
    read('functions/brokerCommissions.ts'),
  ]);

  assert.match(verifier, /latestApprovedPayment/);
  assert.match(verifier, /latestBrokerCommission/);
  assert.match(verifier, /cloudfunctions\.net\/adminApprovePayment/);
  assert.match(verifier, /payload\?\.idempotent !== true/);
  assert.match(verifier, /invoicesAfter\.length !== 1/);
  assert.match(verifier, /approvalAuditsAfter\.length !== 1/);
  assert.match(verifier, /JSON\.stringify\(before\) !== JSON\.stringify\(after\)/);
  assert.match(verifier, /`commission_\$\{contractId\}`/);
  assert.match(verifier, /commissionsAfterSnapshot\.size !== 1/);
  assert.match(verifier, /beforeHash !== afterHash/);
  assert.match(approval, /approvalWasIdempotent = true/);
  assert.match(commission, /\.doc\(`commission_\$\{contractId\}`\)/);
  assert.match(commission, /transaction\.create\(commissionRef/);
});

test('tenant notification proof auto-discovers successful delivery and requires tenant, photo, property and unit binding', async () => {
  const [verifier, delivery] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('functions/notificationDelivery.ts'),
  ]);

  assert.match(verifier, /latestDeliveredNotification/);
  assert.match(verifier, /where\('pushDeliveryState', '==', 'SUCCESS'\)/);
  assert.match(verifier, /pushSuccessCount \|\| 0\) > 0/);
  assert.match(verifier, /pushFailureCount \|\| 0\) === 0/);
  assert.match(verifier, /photoEvidence\(ticket\)/);
  assert.match(verifier, /ticket is not bound to the tenant/);
  assert.match(verifier, /property and unit/);
  assert.match(delivery, /pushDeliveryState:\s*deliveryState/);
  assert.match(delivery, /sendEachForMulticast/);
});

test('staff evidence auto-discovers one audited technician with no privileged claims', async () => {
  const [verifier, provisioning] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('functions/adminUserProvisioning.ts'),
  ]);

  assert.match(verifier, /latestStaffCreationAudit/);
  assert.match(verifier, /role !== 'technician'/);
  assert.match(verifier, /claims\.admin === true/);
  assert.match(verifier, /canManageSecurity/);
  assert.match(verifier, /creationAudits\.length !== 1/);
  assert.match(provisioning, /ADMIN_CREATE_STAFF_USER/);
  assert.match(provisioning, /staffAccess/);
  assert.match(provisioning, /hrProfiles/);
  assert.match(provisioning, /technicians/);
});

test('renewal proof auto-discovers a linked source, correct timeline, PDF and scheduler provenance', async () => {
  const [verifier, tenantPage] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('src/tenant/pages/TenantRenewalsPage.tsx'),
  ]);

  assert.match(verifier, /latestRenewalWatch/);
  assert.match(verifier, /contract_renewal_watch/);
  assert.match(verifier, /sourceCollection/);
  assert.match(verifier, /sourceId/);
  assert.match(verifier, /daysRemaining/);
  assert.match(verifier, /pdfUrl/);
  assert.match(verifier, /scheduler provenance/);
  assert.match(tenantPage, /contract_renewal_watch/);
  assert.match(tenantPage, /Open Renewal PDF/);
});
