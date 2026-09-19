import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertReviewedApplicationPreparationSource,
  transformFrozenTenantPhotoVerifier,
  transformFrozenBrokerPaymentVerifier,
} from '../../scripts/run-frozen-release-evidence.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('application evidence workflow is protected and auto-discovers fixed production records', async () => {
  const [workflow, verifier, wrapper, publisher, preparation, frozenWrapper] = await Promise.all([
    read('.github/workflows/operational-application-evidence.yml'),
    read('scripts/verify-operational-application-evidence.mjs'),
    read('scripts/verify-operational-application-evidence-mfa.mjs'),
    read('scripts/publish-operational-application-evidence.mjs'),
    read('scripts/prepare-operational-application-evidence.mjs'),
    read('scripts/run-frozen-release-evidence.mjs'),
  ]);

  assert.match(workflow, /^name:\s*Operational Application Evidence/m);
  assert.match(workflow, /^\s{2}verify-and-publish:/m);
  assert.match(workflow, /environment:\s*\$\{\{ \(inputs\.founder_totp_operation == 'verify' \|\| inputs\.founder_totp_operation == 'repair-and-sync'\) && 'production' \|\| 'hard-public-launch' \}\}/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS:\s*\$\{\{ secrets\.AUTHORIZED_FOUNDER_ACTORS \}\}/);
  assert.match(workflow, /allowed_actors/);
  assert.match(workflow, /GITHUB_ACTOR.*allowed_actor/s);
  assert.doesNotMatch(workflow, /GITHUB_ACTOR.*rashidpvt420-lang/s);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/s);
  assert.match(workflow, /PUBLISH_OPERATIONAL_APPLICATION_EVIDENCE/);
  assert.match(workflow, /expected_commit_sha.*GITHUB_SHA/s);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /Install Chromium for protected Tenant FCM registration/);
  assert.match(workflow, /E2E_TENANT_EMAIL:\s*\$\{\{ secrets\.E2E_TENANT_EMAIL \}\}/);
  assert.match(workflow, /E2E_TENANT_PASSWORD:\s*\$\{\{ secrets\.E2E_TENANT_PASSWORD \}\}/);
  assert.match(workflow, /run-frozen-release-evidence\.mjs scripts\/prepare-operational-application-evidence\.mjs/);
  assert.match(workflow, /cp control-plane\/scripts\/verify-operational-application-evidence\.mjs release\/scripts\/verify-operational-application-evidence\.mjs/);
  assert.match(workflow, /issues: read/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(frozenWrapper, /GITHUB_TOKEN is required for protected owner-command provenance/);
  assert.match(frozenWrapper, /Authorization: Bearer \$\{token\}/);
  assert.ok(
    workflow.indexOf('scripts/prepare-operational-application-evidence.mjs')
      < workflow.indexOf('OPERATIONAL_GATE="$gate" node ../control-plane/scripts/run-frozen-release-evidence.mjs scripts/verify-operational-application-provenance.mjs'),
    'provider-backed Tenant delivery must be prepared before post-deploy provenance selection',
  );
  assert.match(workflow, /Auto-discover, verify, and publish application evidence/);
  assert.match(workflow, /OPERATIONAL_GATE="\$gate" node \.\.\/control-plane\/scripts\/run-frozen-release-evidence\.mjs scripts\/verify-operational-application-evidence-mfa\.mjs/);
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

  assert.match(preparation, /GITHUB_ACTOR !== CANONICAL_FOUNDER_LOGIN/);
  assert.match(preparation, /tenant\.customClaims\?\.testAccount !== true/);
  assert.match(preparation, /profile\.testAccount !== true/);
  assert.match(preparation, /chromium\.launchPersistentContext\(profileDir, \{[\s\S]*headless: true,[\s\S]*channel: 'chromium'[\s\S]*\}\)/);
  assert.match(preparation, /mkdtemp\(path\.join\(os\.tmpdir\(\), 'bin-application-fcm-'\)\)/);
  assert.match(preparation, /await context\.close\(\)/);
  assert.match(preparation, /await rm\(profileDir, \{ recursive: true, force: true \}\)/);
  assert.match(preparation, /grantPermissions\(\['notifications'\]/);
  assert.match(preparation, /waitForFreshPushRegistration/);
  assert.match(preparation, /ensureFreshPushRegistration/);
  assert.match(preparation, /page\.reload\(\{ waitUntil: 'domcontentloaded' \}\)/);
  assert.match(preparation, /classifyPushDiagnostic/);
  assert.match(preparation, /messagingWorkerActive/);
  assert.match(preparation, /sha256\(token\) === document\.id/);
  assert.match(preparation, /getByTestId\('tenant-request-location'\)/);
  assert.match(preparation, /locationField\.locator\('input, textarea'\)\.first\(\)\.fill/);
  assert.match(preparation, /getByTestId\('tenant-request-description'\)\.locator\('input, textarea'\)\.first\(\)\.fill/);
  assert.doesNotMatch(preparation, /page\.locator\('\[data-testid="tenant-request-location"\]'\)\.fill/);
  assert.match(preparation, /cloudfunctions\.net\/createNotification/);
  assert.match(preparation, /'X-Firebase-AppCheck': auth\.appCheckToken/);
  assert.match(preparation, /lastState === 'SUCCESS'/);
  assert.match(preparation, /deliverySource\) === 'callable:createNotification'/);
  assert.match(preparation, /metadata\?\.workflowRunId/);
  assert.doesNotMatch(preparation, /collection\('notifications'\)\.doc\([^)]*\)\.set/);
  assert.doesNotMatch(preparation, /console\.(?:log|error)\([^\n]*(?:tenantEmail|tenantPassword|debugToken|data\.token)/);

  assert.match(frozenWrapper, /REVIEWED_APPLICATION_PREPARATION_BLOB = '9afcbd054f54729b647d8b1fae122b5dc0ffb155'/);
  assert.match(frozenWrapper, /assertReviewedApplicationPreparation\(releaseRoot\)/);
  assert.match(frozenWrapper, /resolveApplicationEvidenceActor\(env\)/);
  assert.doesNotThrow(() => assertReviewedApplicationPreparationSource(preparation));
  assert.throws(
    () => assertReviewedApplicationPreparationSource(preparation.replace("lastState === 'SUCCESS'", "lastState === 'PARTIAL'")),
    /unreviewed Tenant notification preparation/,
  );

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
  assert.match(verifier, /latestBrokerCommissionWithApprovedPayment/);
  assert.match(verifier, /no production broker commission lock has an approved payment binding/);
  assert.match(verifier, /candidate\.id === directPaymentId/);
  assert.match(verifier, /text\(data\.contractId \|\| data\.intakeId \|\| id\) === contractId/);
  assert.match(verifier, /directPaymentId/);
  assert.match(verifier, /collection\('payment_transactions'\)\.where\('status', '==', 'APPROVED'\)/);
  assert.match(verifier, /data\.paymentVerified === true/);
  assert.match(verifier, /data\.unlocksDashboard === true/);
  assert.match(verifier, /text\(data\.contractId \|\| data\.intakeId\) === contractId/);
  assert.match(verifier, /no approved production payment is bound to the broker commission contract/);
  assert.match(verifier, /convertedBrokerLeadForCommission/);
  assert.match(verifier, /collection\('brokerLeads'\)\.where\('commissionId', '==', commissionId\)/);
  assert.match(verifier, /lower\(data\.status\) === 'converted'/);
  assert.match(verifier, /commissionCreationStatus\) === 'COMMISSION_CREATED_SERVER_SIDE'/);
  assert.match(verifier, /broker_attribution_\$\{brokerLead\.id\}_\$\{contractId\}/);
  assert.match(verifier, /cloudfunctions\.net\/adminApprovePayment/);
  assert.match(verifier, /payload\?\.idempotent !== true/);
  assert.match(verifier, /invoicesAfter\.length !== 1/);
  assert.match(verifier, /approvalAuditsAfter\.length !== 1/);
  assert.match(verifier, /JSON\.stringify\(before\) !== JSON\.stringify\(after\)/);
  assert.match(verifier, /`commission_\$\{contractId\}`/);
  assert.match(verifier, /commissionsAfterSnapshot\.size !== 1/);
  assert.match(verifier, /beforeHash !== afterHash/);
  assert.match(publisher, /requiredText\(e\.brokerLeadId, 'brokerLeadId', errors\)/);
  assert.match(publisher, /requiredText\(e\.attributionAuditId, 'attributionAuditId', errors\)/);
  assert.match(publisher, /requiredHash\(e\.brokerLeadStateHash, 'brokerLeadStateHash', errors\)/);
  assert.match(wrapper, /replaySecondFactorHash = sha256\(verifiedMfa\.secondFactorIdentifier\)/);
  const publisherChecks = publisher.match(/requiredHash\(e\.replaySecondFactorHash, 'replaySecondFactorHash', errors\)/g) || [];
  assert.equal(publisherChecks.length, 2, 'both finance replay gates must require the Founder TOTP hash');
  assert.match(approval, /approvalWasIdempotent = true/);
  assert.match(commission, /\.doc\(`commission_\$\{contractId\}`\)/);
});

test('tenant notification proof auto-discovers successful delivery and requires tenant, photo, property and unit binding', async () => {
  const [verifier, delivery, preparation] = await Promise.all([
    read('scripts/verify-operational-application-evidence.mjs'),
    read('functions/notificationDelivery.ts'),
    read('scripts/prepare-operational-application-evidence.mjs'),
  ]);

  assert.match(verifier, /latestDeliveredNotification/);
  assert.match(verifier, /where\('pushDeliveryState', '==', 'SUCCESS'\)/);
  assert.match(verifier, /pushSuccessCount \|\| 0\) > 0/);
  assert.match(verifier, /pushFailureCount \|\| 0\) === 0/);
  assert.match(verifier, /photoEvidence\(ticket\)/);
  for (const field of ['primaryPhotoUrl', 'photos', 'beforePhotos', 'tenantPhotos', 'initialPhotoUrls']) {
    assert.match(verifier, new RegExp(`ticket\\.${field}`));
    assert.match(preparation, new RegExp(`ticket\\.${field}`));
  }
  assert.match(verifier, /ticket is not bound to the tenant/);
  assert.match(verifier, /property and unit/);
  assert.match(delivery, /pushDeliveryState:\s*deliveryState/);
  assert.match(delivery, /sendEachForMulticast/);
});

test('frozen Tenant verifier adapter upgrades legacy selection, accepts exact reviewed selection, and refuses drift', () => {
  const legacySelection = [
    '    ticket.requestPhotoUrl,',
    '    ...(Array.isArray(ticket.photoUrls) ? ticket.photoUrls : []),',
    '    ...(Array.isArray(ticket.images) ? ticket.images : []),',
  ].join('\n');
  const reviewedSelection = [
    '    ticket.requestPhotoUrl,',
    '    ticket.primaryPhotoUrl,',
    '    ...(Array.isArray(ticket.photoUrls) ? ticket.photoUrls : []),',
    '    ...(Array.isArray(ticket.photos) ? ticket.photos : []),',
    '    ...(Array.isArray(ticket.beforePhotos) ? ticket.beforePhotos : []),',
    '    ...(Array.isArray(ticket.tenantPhotos) ? ticket.tenantPhotos : []),',
    '    ...(Array.isArray(ticket.initialPhotoUrls) ? ticket.initialPhotoUrls : []),',
    '    ...(Array.isArray(ticket.images) ? ticket.images : []),',
  ].join('\n');
  const adapted = transformFrozenTenantPhotoVerifier(`before\n${legacySelection}\nafter`);
  assert.match(adapted, /ticket\.primaryPhotoUrl/);
  assert.match(adapted, /Array\.isArray\(ticket\.photos\)/);
  assert.match(adapted, /Array\.isArray\(ticket\.beforePhotos\)/);
  assert.match(adapted, /Array\.isArray\(ticket\.tenantPhotos\)/);
  assert.match(adapted, /Array\.isArray\(ticket\.initialPhotoUrls\)/);
  const alreadyReviewed = `before\n${reviewedSelection}\nafter`;
  assert.equal(transformFrozenTenantPhotoVerifier(alreadyReviewed), alreadyReviewed);
  assert.throws(
    () => transformFrozenTenantPhotoVerifier(legacySelection.replace('ticket.images', 'ticket.attachments')),
    /exact legacy or reviewed selection is required/,
  );
  assert.throws(
    () => transformFrozenTenantPhotoVerifier(`${reviewedSelection}\n${reviewedSelection}`),
    /exact legacy or reviewed selection is required/,
  );
});

test('application evidence publish step passes GitHub token for protected owner-command provenance', async () => {
  const workflow = await read('.github/workflows/operational-application-evidence.yml');
  const start = workflow.indexOf('      - name: Auto-discover, verify, and publish application evidence');
  assert.ok(start >= 0);
  const end = workflow.indexOf('\n      - name:', start + 1);
  const step = workflow.slice(start, end > start ? end : workflow.length);
  assert.match(step, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(step, /node \.\.\/control-plane\/scripts\/run-frozen-release-evidence\.mjs scripts\/verify-operational-application-evidence-mfa\.mjs/);
});

test('reviewed application verifier still receives the cent-precision activation adapter', async () => {
  const wrapper = await read('scripts/run-frozen-release-evidence.mjs');
  const start = wrapper.indexOf('function installReviewedActivationAdapter');
  assert.ok(start >= 0);
  const end = wrapper.indexOf('\nfunction ', start + 1);
  const installer = wrapper.slice(start, end > start ? end : wrapper.length);
  assert.match(installer, /transformFrozenActivationVerifier\(source\)/);
  assert.doesNotMatch(installer, /state === 'reviewed'[\s\S]*return \(\) => \{\}/);
  assert.match(wrapper, /resolveLockedOwnerActivationSchedule/);
  assert.match(wrapper, /normalizeAedMoney/);
});

test('application verifier overlay accepts only frozen source or the exact reviewed verifier blob', async () => {
  const wrapper = await read('scripts/run-frozen-release-evidence.mjs');
  const workflow = await read('.github/workflows/operational-application-evidence.yml');
  assert.match(wrapper, /REVIEWED_APPLICATION_VERIFIER_BLOB = 'f8e37913ea7740b37a53c1a17590d60cb7102f5b'/);
  assert.match(wrapper, /gitBlobSha\(source\) === REVIEWED_APPLICATION_VERIFIER_BLOB/);
  assert.match(wrapper, /application verifier has unreviewed working-tree changes/);
  assert.match(wrapper, /state === 'reviewed'/);
  assert.match(workflow, /cp control-plane\/scripts\/verify-operational-application-evidence\.mjs release\/scripts\/verify-operational-application-evidence\.mjs/);
});

test('frozen broker payment adapter upgrades only the reviewed payment binding and refuses drift', () => {
  const legacy = [
    '  const paymentId = canonicalId(',
    '    contractBefore.data.approvedPaymentId || contractBefore.data.activationPaymentId || contractBefore.data.paymentId,',
    "    'payment_id',",
    '  );',
    "  const payment = await requireSnapshot(db.collection('payment_transactions').doc(paymentId), `payment_transactions/${paymentId}`);",
  ].join('\n');
  const adapted = transformFrozenBrokerPaymentVerifier(`before\n${legacy}\nafter`);
  assert.match(adapted, /where\('status', '==', 'APPROVED'\)/);
  assert.match(adapted, /paymentVerified === true/);
  assert.match(adapted, /unlocksDashboard === true/);
  assert.match(adapted, /text\(data\.contractId \|\| data\.intakeId\) === contractId/);
  assert.match(adapted, /const paymentId = canonicalId\(payment\.id, 'payment_id'\)/);
  assert.throws(
    () => transformFrozenBrokerPaymentVerifier(legacy.replace("paymentId),", "paymentId || 'fallback'),")),
    /exact legacy or reviewed selection is required/,
  );
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

// Local-only frozen-release repair regressions. Never write production evidence.
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  assertApplicationEvidenceCredentials,
  verifyFrozenActivationPayment,
  transformFrozenActivationVerifier,
  validateFrozenReleaseEvidenceContext,
  runFrozenReleaseEvidence,
} from '../../scripts/run-frozen-release-evidence.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const lockedContract = (annualContractValue = 10001, activationDeposit = 1500.15) => ({
  quoteSnapshot: { annualContractValue, activationDeposit },
});
const verifyMoney = (payment, contract = lockedContract(), root = repoRoot) => verifyFrozenActivationPayment(payment, contract, root);
const legacyMoneyCheck = [
  '  const annual = Number(payment.data.quoteSnapshot?.annualContractValue || contract.quoteSnapshot?.annualContractValue || contract.annualContractValue || 0);',
  '  const amount = Number(payment.data.amountReceived || payment.data.quoteSnapshot?.activationDeposit || payment.data.amount || 0);',
  "  if (!Number.isFinite(annual) || annual <= 0 || !Number.isFinite(amount) || Math.abs(amount - Math.round(annual * 0.15)) > 0.01) fail('activation amount is not the locked 15% deposit');",
].join('\n');

test('[frozen-cent] uses the pinned production policy for whole, fractional and half-cent deposits', () => {
  for (const [annual, deposit] of [[10000, 1500], [10001, 1500.15], [199.99, 30], [1.1, 0.17], [0.1, 0.02]]) {
    assert.deepEqual(verifyMoney({ amountReceived: deposit, currency: 'AED' }, lockedContract(annual, deposit)), {
      amount: deposit, amountMinor: Math.round(deposit * 100),
    });
  }
  assert.equal(verifyMoney({ amount: '1500.15' }).amountMinor, 150015);
});

test('[frozen-cent] rejects quote substitution, invalid receipts and one-cent mismatches', () => {
  for (const received of [1500, 1500.14, 1500.16, 0, -1, NaN, Infinity, null, '', ' ', true, {}, [], 'not-money']) {
    assert.throws(() => verifyMoney({ amountReceived: received, amount: 1500.15, quoteSnapshot: { activationDeposit: 1500.15 } }));
  }
  assert.throws(() => verifyMoney({ quoteSnapshot: { activationDeposit: 1500.15 } }), /recorded received amount/);
  assert.throws(() => verifyMoney({ amountReceived: 1500.15, currency: 'USD' }), /currency/);
});

test('[frozen-cent] requires the locked contract schedule and safe minor units', () => {
  for (const contract of [{}, lockedContract(0), lockedContract(10001, 1500), lockedContract(10001, 0), lockedContract(NaN)]) {
    assert.throws(() => verifyMoney({ amountReceived: 1500.15 }, contract));
  }
  assert.throws(() => verifyMoney({ amountReceived: 1.5e19 }, lockedContract(1e20, 1.5e19)), /safe AED-cent range/);
  assert.equal(verifyMoney({ amountReceived: 1500 }, lockedContract(10000.006, 1500)).amountMinor, 150000);
});

test('[frozen-cent] uses final verified repricing instead of stale payment quotes', () => {
  const hash = 'a'.repeat(64);
  const contract = {
    ...lockedContract(), quoteRepricedAfterInspection: true,
    finalVerifiedQuoteHash: hash, signedPreInspectionQuoteHash: 'b'.repeat(64),
    quoteVerificationState: 'FINAL_VERIFIED_AFTER_ALL_SITE_VISITS',
    finalVerifiedQuoteSnapshot: { annualContractValue: 10002, activationDeposit: 1500.30, quoteHash: hash },
  };
  assert.equal(verifyMoney({ amountReceived: 1500.30, quoteSnapshot: lockedContract().quoteSnapshot }, contract).amountMinor, 150030);
  assert.throws(() => verifyMoney({ amountReceived: 1500.15 }, contract), /does not match/);
  assert.throws(() => verifyMoney({ amountReceived: 1500.30 }, { ...contract, finalVerifiedQuoteHash: '' }), /final verified quote evidence/);
});

test('[frozen-cent] source transform is narrow, single-use and refuses drift', () => {
  const source = `// authorization unchanged\nasync function proof() {\n${legacyMoneyCheck}\n  return { amount };\n}\n// other gates unchanged\n`;
  const transformed = transformFrozenActivationVerifier(source);
  const start = source.indexOf(legacyMoneyCheck);
  assert.equal(transformed.slice(0, start), source.slice(0, start));
  assert.ok(transformed.endsWith(source.slice(start + legacyMoneyCheck.length)));
  assert.match(transformed, /verifyFrozenActivationPayment\(payment\.data, contract\)/);
  assert.doesNotMatch(transformed, /Math\.round\(annual \* 0\.15\)/);
  for (const input of [transformed, source + legacyMoneyCheck, source.replace('Math.round(annual', 'Math.floor(annual')]) {
    assert.throws(() => transformFrozenActivationVerifier(input), /source drift/);
  }
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: transformed });
});

function makeFrozenFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frozen-cent-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['scripts', 'functions/shared', 'launch_package', 'node_modules']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (const file of ['functions/shared/aedMoney.ts', 'functions/ownerActivationPaymentPolicy.ts']) fs.copyFileSync(path.join(repoRoot, file), path.join(root, file));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  const require = createRequire(import.meta.url);
  fs.symlinkSync(path.dirname(require.resolve('typescript/package.json')), path.join(root, 'node_modules/typescript'), 'junction');
  const verifierPath = path.join(root, 'scripts/verify-operational-application-evidence.mjs');
  const original = `async function proof() {\n  const payment = { data: { amountReceived: Number(process.env.FIXTURE_RECEIVED_AMOUNT ?? '1500.15') } };\n  const contract = ${JSON.stringify(lockedContract())};\n${legacyMoneyCheck}\n  if (amount !== 1500.15) throw new Error('wrong fixture amount');\n}\nawait proof();\n`;
  fs.writeFileSync(verifierPath, original);
  const entrypoint = 'scripts/verify-operational-application-evidence-mfa.mjs';
  fs.writeFileSync(path.join(root, entrypoint), "await import('./verify-operational-application-evidence.mjs');\nprocess.exit(Number(process.env.FIXTURE_EXIT_CODE || 0));\n");
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('add', 'scripts', 'functions', 'package.json');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'local-only fixture');
  const releaseSha = git('rev-parse', 'HEAD');
  const env = {
    GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW: 'Operational Application Evidence', GITHUB_JOB: 'verify-and-publish',
    CONTROL_PLANE_COMMIT_SHA: 'b'.repeat(40), GITHUB_SHA: 'b'.repeat(40),
    PRODUCTION_RELEASE_SHA: releaseSha, PRODUCTION_DEPLOY_RUN_ID: '123', CONTROL_PLANE_SCOPE_VERIFIED: 'true',
    OPERATIONAL_GATE: 'ownerPaymentActivation',
  };
  const deploymentPath = path.join(root, 'launch_package/production-deployment.json');
  const deployment = {
    status: 'passed', projectId: 'bin-group-57c60', deployedCommitSha: releaseSha, workflowRunId: '123',
    workflowRef: 'refs/heads/main', repository: env.GITHUB_REPOSITORY,
    validatedArtifactDigest: `sha256:${'c'.repeat(64)}`, deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment));
  return { root, env, entrypoint, verifierPath, original, deploymentPath, deployment };
}

test('[frozen-cent] refuses changed policy bytes and symlinked policy files', (t) => {
  const { root } = makeFrozenFixture(t);
  const file = path.join(root, 'functions/shared/aedMoney.ts');
  fs.appendFileSync(file, '\n// drift\n');
  assert.throws(() => verifyMoney({ amountReceived: 1500.15 }, lockedContract(), root), /unreviewed frozen payment policy/);
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(repoRoot, 'functions/shared/aedMoney.ts'), file);
  assert.throws(() => verifyMoney({ amountReceived: 1500.15 }, lockedContract(), root), /not a regular file/);
});

test('[frozen-cent] restores the verifier after success, nonzero exit and policy rejection', (t) => {
  const f = makeFrozenFixture(t);
  for (const status of [0, 19]) {
    assert.equal(runFrozenReleaseEvidence(f.entrypoint, { ...f.env, FIXTURE_EXIT_CODE: String(status) }, f.root), status);
    assert.equal(fs.readFileSync(f.verifierPath, 'utf8'), f.original);
  }
  assert.equal(runFrozenReleaseEvidence(f.entrypoint, { ...f.env, FIXTURE_RECEIVED_AMOUNT: '0' }, f.root), 1);
  assert.equal(fs.readFileSync(f.verifierPath, 'utf8'), f.original);
});

test('[frozen-cent] retains exact deployment, freshness, workflow and working-tree guards', (t) => {
  const f = makeFrozenFixture(t);
  for (const overrides of [
    { GITHUB_ACTIONS: 'false' }, { GITHUB_REF: 'refs/heads/test' }, { GITHUB_REPOSITORY: 'other/repo' },
    { GITHUB_SHA: 'd'.repeat(40) }, { CONTROL_PLANE_SCOPE_VERIFIED: 'false' },
    { PRODUCTION_RELEASE_SHA: 'e'.repeat(40) }, { PRODUCTION_DEPLOY_RUN_ID: '999' }, { GITHUB_WORKFLOW: 'unexpected' },
  ]) assert.throws(() => validateFrozenReleaseEvidenceContext({ ...f.env, ...overrides }, f.root, f.entrypoint));
  assert.throws(() => validateFrozenReleaseEvidenceContext(f.env, f.root, 'scripts/unknown.mjs'), /not authorized/);
  for (const overrides of [
    { status: 'failed' }, { projectId: 'other' }, { deployedCommitSha: 'f'.repeat(40) },
    { validatedArtifactDigest: 'invalid' }, { deployedAt: 'invalid' },
    { deployedAt: new Date(Date.now() - 8 * 86400000).toISOString() },
    { deployedAt: new Date(Date.now() + 3600000).toISOString() },
  ]) {
    fs.writeFileSync(f.deploymentPath, JSON.stringify({ ...f.deployment, ...overrides }));
    assert.throws(() => validateFrozenReleaseEvidenceContext(f.env, f.root, f.entrypoint));
  }
  fs.writeFileSync(f.deploymentPath, JSON.stringify(f.deployment));
  fs.writeFileSync(f.verifierPath, `${f.original}// unreviewed\n`);
  assert.throws(() => runFrozenReleaseEvidence(f.entrypoint, f.env, f.root), /unreviewed working-tree changes/);
  assert.equal(fs.readFileSync(f.verifierPath, 'utf8'), `${f.original}// unreviewed\n`);
});

test('[frozen-cent] Founder preflight is gate-aware and reports names, never values', () => {
  const valid = { E2E_FOUNDER_EMAIL: 'ceo@bin-groups.com', E2E_FOUNDER_PASSWORD: 'fixture-password-not-a-secret', E2E_FOUNDER_TOTP_SECRET: 'fixture-seed-not-a-secret', VITE_FIREBASE_API_KEY: 'fixture-api-key' };
  for (const gate of ['all', 'paymentUnlockExactlyOnce', 'brokerCommissionLockExactlyOnce']) {
    assert.doesNotThrow(() => assertApplicationEvidenceCredentials(gate, valid));
    for (const key of Object.keys(valid)) {
      assert.throws(() => assertApplicationEvidenceCredentials(gate, { ...valid, [key]: ' ' }), (error) => {
        assert.ok(error.message.includes(key));
        assert.ok(!error.message.includes(valid.E2E_FOUNDER_PASSWORD));
        assert.ok(!error.message.includes(valid.E2E_FOUNDER_TOTP_SECRET));
        return true;
      });
    }
    assert.throws(() => assertApplicationEvidenceCredentials(gate, { ...valid, E2E_FOUNDER_EMAIL: 'other@example.invalid' }), /canonical Founder/);
  }
  assert.doesNotThrow(() => assertApplicationEvidenceCredentials('ownerPaymentActivation', {}));
});

test('[frozen-source] the actual verifier matches the single reviewed replacement', async () => {
  const source = await read('scripts/verify-operational-application-evidence.mjs');
  assert.equal(source.split(legacyMoneyCheck).length, 2);
  const transformed = transformFrozenActivationVerifier(source);
  const start = source.indexOf(legacyMoneyCheck);
  assert.equal(transformed.slice(0, start), source.slice(0, start));
  assert.ok(transformed.endsWith(source.slice(start + legacyMoneyCheck.length)));
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: transformed });
});

test('[frozen-workflow] complete-batch binding preflight runs before production access', async () => {
  const workflow = await read('.github/workflows/operational-application-evidence.yml');
  const preflight = workflow.indexOf('assertApplicationEvidenceCredentials(process.env.SELECTED_GATE, process.env)');
  assert.ok(preflight > 0);
  assert.ok(preflight < workflow.indexOf('- name: Authenticate Google Cloud'));
  assert.ok(preflight < workflow.indexOf('for gate in "${gates[@]}"'));
  assert.match(workflow, /environment: \$\{\{ \(inputs\.founder_totp_operation == 'verify' \|\| inputs\.founder_totp_operation == 'repair-and-sync'\) && 'production' \|\| 'hard-public-launch' \}\}/);
  assert.match(workflow, /E2E_FOUNDER_TOTP_SECRET: \$\{\{ secrets\.E2E_FOUNDER_TOTP_SECRET \}\}/);
});