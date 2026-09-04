import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCTION } from '../../scripts/lib/launch-honesty.mjs';
import {
  requiredOperationalGatesForPaymentPolicy,
  validateOperationalReadinessReport,
} from '../../scripts/lib/hard-launch-gate.mjs';

process.env.AUTHORIZED_FOUNDER_ACTORS = 'rashidpvt420-lang';

const commitSha = 'a'.repeat(40);
const now = Date.parse('2026-08-20T12:00:00.000Z');

const evidenceTypes = {
  ownerPaymentActivation: 'production-transaction',
  paymentUnlockExactlyOnce: 'production-transaction',
  tenantNotificationDelivery: 'production-transaction',
  technicianPhysicalGpsEvidence: 'physical-device-report',
  brokerCommissionLockExactlyOnce: 'production-transaction',
  adminStaffClaims: 'workflow-artifact',
  appCheckEnforcement: 'workflow-artifact',
  aiProviderHealth: 'workflow-artifact',
  privilegedAccessRotation: 'secret-rotation-record',
  brandedEmailDelivery: 'workflow-artifact',
  renewalScheduler: 'scheduler-run',
};

const sourceSystems = {
  ownerPaymentActivation: 'Firebase payment activation transaction',
  paymentUnlockExactlyOnce: 'Firebase adminApprovePayment replay verifier',
  tenantNotificationDelivery: 'Firebase notificationDelivery FCM trigger',
  technicianPhysicalGpsEvidence: 'Firebase technician lifecycle, device binding and Cloud Storage',
  brokerCommissionLockExactlyOnce: 'Firebase broker commission transaction and payment replay',
  adminStaffClaims: 'Firebase Auth and staff registries',
  appCheckEnforcement: 'Firebase App Check enforcement',
  aiProviderHealth: 'Firebase Sovereign AI callable with Gemini and OpenAI',
  privilegedAccessRotation: 'Google Secret Manager and Firebase Authentication',
  brandedEmailDelivery: 'Postmark email delivery',
  renewalScheduler: 'Firebase contract renewal watcher',
};

function phase1OperationalReport() {
  const gates = {};
  requiredOperationalGatesForPaymentPolicy('phase1-manual').forEach((key, index) => {
    const sourceRunId = String(910000 + index);
    gates[key] = {
      status: 'passed',
      commitSha,
      projectId: PRODUCTION.projectId,
      evidenceType: evidenceTypes[key],
      evidenceReference: `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/${sourceRunId}`,
      artifactHash: (index + 1).toString(16).padStart(64, '0'),
      sourceProofHash: (index + 101).toString(16).padStart(64, '0'),
      sourceSystem: sourceSystems[key],
      observedAt: '2026-08-20T10:00:00.000Z',
      sourceWorkflowRunId: sourceRunId,
      workflowRunId: String(920000 + index),
      githubRepository: 'rashidpvt420-lang/bin-group-super-app',
      verifiedBy: 'workflow',
      verifiedAt: '2026-08-20T10:05:00.000Z',
    };
  });

  return {
    schemaVersion: 1,
    status: 'passed',
    commitSha,
    projectId: PRODUCTION.projectId,
    source: 'firestore-system-health-admin-summaries',
    sourceDocument: 'system_health/admin_summaries',
    paymentPolicy: 'phase1-manual',
    paymentConfigSourceDocument: 'system_payment_config/current',
    paymentConfigVersion: 'phase1-manual-test',
    paymentConfigHash: 'f'.repeat(64),
    approvedPaymentMethods: ['CASH', 'CHEQUE'],
    bankTransferEnabled: false,
    stripeEnabled: false,
    gates,
    fetchedAt: '2026-08-20T10:10:00.000Z',
    generatedByWorkflow: true,
    githubRepository: 'rashidpvt420-lang/bin-group-super-app',
    githubRef: 'refs/heads/main',
    githubRunId: '930000',
  };
}

test('Phase 1 Cash/Cheque hard clearance does not require Stripe', () => {
  const required = requiredOperationalGatesForPaymentPolicy('phase1-manual');
  assert.ok(required.includes('ownerPaymentActivation'));
  assert.ok(required.includes('paymentUnlockExactlyOnce'));
  assert.ok(!required.includes('stripeLiveBilling'));

  const report = phase1OperationalReport();
  assert.deepEqual(validateOperationalReadinessReport(report, commitSha, { now }), []);
});

test('Phase 1 fails closed if Bank Transfer or Stripe is enabled', () => {
  const report = phase1OperationalReport();
  report.bankTransferEnabled = true;
  report.stripeEnabled = true;
  const errors = validateOperationalReadinessReport(report, commitSha, { now });
  assert.ok(errors.includes('phase1-manual bankTransferEnabled must equal false'));
  assert.ok(errors.includes('phase1-manual stripeEnabled must equal false'));
});

test('Stripe remains mandatory for an explicit phase2-stripe policy', () => {
  const required = requiredOperationalGatesForPaymentPolicy('phase2-stripe');
  assert.ok(required.includes('stripeLiveBilling'));
});

test('unknown payment policy cannot weaken hard clearance', () => {
  assert.throws(
    () => requiredOperationalGatesForPaymentPolicy('something-else'),
    /Unsupported payment policy/,
  );
});

test('Owner onboarding exposes only Cash and Cheque in Phase 1', () => {
  const source = readFileSync('src/components/onboarding/PaymentSummaryStep.tsx', 'utf8');
  assert.match(source, /type PaymentMethod = 'CASH' \| 'CHEQUE'/);
  assert.match(source, /Phase 1 payment methods: Cash or Cheque/);
  assert.doesNotMatch(source, /BANK_TRANSFER|STRIPE|Secure Card Payment|Bank Transfer/);
});

test('server payment authority accepts exactly Cash and Cheque', () => {
  const source = readFileSync('functions/paymentConfiguration.ts', 'utf8');
  assert.match(source, /PHASE1_METHODS = \["CASH", "CHEQUE"\]/);
  assert.match(source, /Bank Transfer and Card payments are not available/);
  assert.match(source, /value\.bankTransferEnabled === true \|\| value\.stripeEnabled === true/);
});

test('operational snapshot binds hard clearance to the authoritative payment config', () => {
  const source = readFileSync('scripts/verify-operational-readiness.mjs', 'utf8');
  assert.match(source, /system_payment_config\/current/);
  assert.match(source, /requiredOperationalGatesForPaymentPolicy/);
  assert.match(source, /paymentConfigHash/);
  assert.match(source, /approvedPaymentMethods/);
});

test('Admin Production Configuration uses protected server evidence instead of a browser Firestore listener', () => {
  const settings = readFileSync('apps/admin-panel/src/pages/settings/SettingsPage.tsx', 'utf8');
  const callable = readFileSync('functions/adminLaunchConfiguration.ts', 'utf8');
  const runtime = readFileSync('functions/runtime.ts', 'utf8');
  const required = requiredOperationalGatesForPaymentPolicy('phase1-manual');

  assert.match(settings, /adminGetLaunchConfigurationSummary/);
  assert.match(settings, /getIdToken\(true\)/);
  assert.doesNotMatch(settings, /onSnapshot\s*\(/);
  assert.doesNotMatch(settings, /stripeLiveMode/);
  for (const gate of required) assert.match(settings, new RegExp(gate));

  assert.match(callable, /adminGetLaunchConfigurationSummary/);
  assert.match(callable, /enforceAppCheck:\s*true/);
  assert.match(callable, /actor\.customClaims/);
  assert.match(callable, /system_health\/admin_summaries/);
  assert.match(callable, /system_payment_config\/current/);
  assert.match(callable, /operationalEvidence/);
  assert.match(runtime, /export \* from "\.\/adminLaunchConfiguration"/);
});

test('Admin Technician registry is a protected operational directory with no employee-write authority', () => {
  const technicians = readFileSync('apps/admin-panel/src/pages/technicians/TechniciansManagementPage.tsx', 'utf8');
  const lifecycle = readFileSync('functions/adminStaffLifecycle.ts', 'utf8');

  assert.match(technicians, /adminGetTechnicianOperationsDirectory/);
  assert.match(technicians, /getIdToken\(true\)/);
  assert.match(technicians, /Employee identity, profile, onboarding, access and offboarding are owned by HR Command/);
  assert.match(technicians, /\/hr\?staff=/);
  assert.doesNotMatch(technicians, /collection\(db,\s*['"]users['"]\)/);
  assert.doesNotMatch(technicians, /onSnapshot\s*\(/);
  assert.doesNotMatch(technicians, /firebase\/firestore/);
  assert.doesNotMatch(technicians, /adminCreateUser/);
  assert.doesNotMatch(technicians, /adminUpdateStaffProfile/);
  assert.doesNotMatch(technicians, /adminOffboardStaff/);

  assert.match(lifecycle, /adminGetTechnicianOperationsDirectory = onCall/);
  assert.match(lifecycle, /enforceAppCheck:\s*true/);
  assert.match(lifecycle, /requireTechnicianDirectoryReader/);
  assert.match(lifecycle, /TECHNICIAN_DIRECTORY_ROLES/);
});