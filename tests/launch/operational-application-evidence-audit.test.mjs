import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('application evidence workflow is protected and auto-discovers fixed production records', async () => {
  const [workflow, verifier, wrapper, publisher] = await Promise.all([
    read('.github/workflows/operational-application-evidence.yml'),
    read('scripts/verify-operational-application-evidence.mjs'),
    read('scripts/verify-operational-application-evidence-mfa.mjs'),
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
  assert.match(workflow, /Auto-discover, verify, and publish application evidence/);
  assert.match(workflow, /OPERATIONAL_GATE="\$gate" node scripts\/verify-operational-application-evidence-mfa\.mjs/);
  assert.match(workflow, /OPERATIONAL_GATE="\$gate" node scripts\/publish-operational-application-evidence\.mjs/);
  assert.match(workflow, /application-proofs\/\$\{gate\}\.json/);
  assert.match(workflow, /SELECTED_GATE.*all/s);
  assert.doesNotMatch(workflow, /run-operational-application-evidence-paginated\.mjs|--prepare-in-place/);

  assert.match(wrapper, /await import\('\.\/verify-operational-application-evidence\.mjs'\)/);
  assert.match(wrapper, /const PAGE_SIZE = 250/);
  assert.match(wrapper, /function installPaginatedQueryProxy/);
  assert.match(wrapper, /readAllMatchingSnapshot/);
  assert.match(wrapper, /restoreCollection\(\)/);
  assert.match(wrapper, /globalThis\.fetch = originalFetch/);
  assert.doesNotMatch(wrapper, /temporaryPath|renameSync|pathToFileURL/);

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
  assert.match(workflow, /launch_package\/application-proof\.json/);
  assert.match(workflow, /launch_package\/application-proofs/);
  assert.match(verifier, /const APPLICATION_PROOF_PATH = 'launch_package\/application-proof\.json';/);
  assert.match(verifier, /writeFileSync\(APPLICATION_PROOF_PATH,/);
  assert.match(verifier, /requireAuthorizedApprover\(process\.env\.GITHUB_ACTOR\)/);
  assert.match(publisher, /readFileSync\('launch_package\/application-proof\.json'/);
  assert.match(publisher, /sha256File\('launch_package\/application-proof\.json'\)/);
  assert.doesNotMatch(workflow, /payment_id:|contract_id:|notification_id:|ticket_id:|tenant_uid:|staff_uid:|renewal_watch_id:/);
  assert.doesNotMatch(verifier, /process\.env\.(?:PAYMENT_ID|CONTRACT_ID|NOTIFICATION_ID|TICKET_ID|TENANT_UID|STAFF_UID|RENEWAL_WATCH_ID)/);
  assert.doesNotMatch(`${workflow}\n${verifier}\n${publisher}`, /GATE_STATUS|founder_attested|waiv|static green/i);
  assert.doesNotMatch(workflow, /technicianPhysicalGpsEvidence/);
});

test('pagination proxy expands bounded discovery and exact-count queries and restores Firestore', async () => {
  const wrapper = await read('scripts/verify-operational-application-evidence-mfa.mjs');
  assert.match(wrapper, /const PAGE_SIZE = 250/);
  assert.match(wrapper, /async function readAllMatchingSnapshot/);
  assert.match(wrapper, /FieldPath\.documentId\(\)/);
  assert.match(wrapper, /startAfter\(cursor\)/);
  assert.match(wrapper, /function installPaginatedQueryProxy/);
  assert.match(wrapper, /property === 'limit'/);
  assert.match(wrapper, /get: \(\) => readAllMatchingSnapshot\(target\)/);
  assert.match(wrapper, /restoreCollection\(\)/);
  assert.doesNotMatch(wrapper, /temporaryPath|renameSync|writeFileSync\([^\n]*\.mjs/);
});

test('payment and commission evidence uses real replay invariants and requires Founder TOTP publication', async () => {
  const [verifier, wrapper, publisher, approval, commission] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('scripts/verify-operational-application-evidence-mfa.mjs'),
    read('scripts/publish-operational-application-evidence.mjs'),
    read('functions/paymentTransactionApproval.ts'),
    read('functions/brokerCommissions.ts'),
  ]);

  assert.match(verifier, /latestApprovedPayment/);
  assert.match(verifier, /latestBrokerCommission/);
  assert.match(verifier, /cloudfunctions\.net\/adminApprovePayment/);
  assert.match(verifier, /payload\?\.idempotent !== true/);
  assert.match(verifier, /invoicesAfter\.length !== 1/);
  assert.match(verifier, /(?:approvalAuditsAfter|auditsAfter)\.length !== 1/);
  assert.match(verifier, /JSON\.stringify\(before\) !== JSON\.stringify\(after\)/);
  assert.match(verifier, /`commission_\$\{contractId\}`/);
  assert.match(verifier, /commissionsAfterSnapshot\.size !== 1/);
  assert.match(verifier, /beforeHash !== afterHash/);
  assert.match(wrapper, /replaySecondFactorHash = sha256\(verifiedMfa\.secondFactorIdentifier\)/);
  const publisherChecks = publisher.match(/requiredHash\(e\.replaySecondFactorHash, 'replaySecondFactorHash', errors\)/g) || [];
  assert.equal(publisherChecks.length, 2, 'both finance replay gates must require the Founder TOTP hash');
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
  assert.match(verifier, /creationAudits\.(?:length|size) !== 1/);
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