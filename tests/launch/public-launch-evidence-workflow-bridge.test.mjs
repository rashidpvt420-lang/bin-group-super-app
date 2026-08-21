import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const builder = readFileSync('scripts/build-command-center-evidence-manifest.mjs', 'utf8');
const publisher = readFileSync('scripts/record-firestore-evidence.js', 'utf8');
const backfillWorkflow = readFileSync('.github/workflows/public-launch-evidence-backfill.yml', 'utf8');
const automaticWorkflow = readFileSync('.github/workflows/public-launch-evidence-bridge.yml', 'utf8');
const verifier = readFileSync('scripts/verify-command-center-firestore-evidence.mjs', 'utf8');

test('Command Center bridge only auto-maps gates backed by exact execution evidence', () => {
  const supported = [
    'ownerOnboardingFullPath',
    'ownerPaymentApproveReject',
    'tenantPhotoMaintenanceRequest',
    'technicianMissionLifecycle',
    'technicianGpsAndDeniedFallback',
    'brokerReferralCommissionLifecycle',
    'adminFreshLoginAndCorePages',
    'adminStaffProvisioning',
    'adminPaymentUnlockAudit',
    'firebaseAuth',
    'firebaseCloudMessaging',
  ];
  for (const gate of supported) {
    assert.match(builder, new RegExp(`gateId: '${gate}'`));
  }

  const unsupported = [
    'ownerPostPaymentDashboard',
    'tenantSosAdminVisibility',
    'tenantUnitBindingAndArabic',
    'technicianCompletionAudit',
    'brokerDocsPolicyFraud',
    'firebaseFunctionsLiveSmoke',
    'paymentGatewayOrManualBank',
    'arabicRtlAllCoreScreens',
    'everyButtonWritesFirestoreOrStorage',
    'logoutAllDashboards',
  ];
  for (const gate of unsupported) {
    assert.doesNotMatch(builder, new RegExp(`gateId: '${gate}'`));
  }
});

test('publisher removes legacy fabricated proof and is append-only/idempotent', () => {
  assert.doesNotMatch(publisher, /firebase_auth_passed_20260620\.png/);
  assert.doesNotMatch(publisher, /tenant-test|technician-test/);
  assert.match(publisher, /batch\.create\(/);
  assert.match(publisher, /exact evidence already published/);
  assert.match(publisher, /SOURCE_EVIDENCE_MODE/);
  assert.match(publisher, /EXPECTED_CONTROL_ISSUE = 434/);
  assert.match(publisher, /commenter !== EXPECTED_OWNER/);
});

test('current production backfill is owner-only, exact-run bound, and verifies Firestore after write', () => {
  assert.match(backfillWorkflow, /issue_comment:/);
  assert.match(backfillWorkflow, /github\.event\.issue\.number == 434/);
  assert.match(backfillWorkflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(backfillWorkflow, /Firebase Production Deploy/);
  assert.match(backfillWorkflow, /\.conclusion == "success"/);
  assert.match(backfillWorkflow, /\.head_sha == \$sha/);
  assert.match(backfillWorkflow, /production-deployment-\$\{SOURCE_SHA\}-\$\{SOURCE_RUN_ID\}/);
  assert.match(backfillWorkflow, /SOURCE_EVIDENCE_VERIFIED: 'true'/);
  assert.match(backfillWorkflow, /verify-command-center-firestore-evidence\.mjs/);
});

test('future Live Role Smoke evidence publishes automatically only after successful workflow_run', () => {
  assert.match(automaticWorkflow, /workflow_run:/);
  assert.match(automaticWorkflow, /Live Role Smoke Tests/);
  assert.match(automaticWorkflow, /conclusion == 'success'/);
  assert.match(automaticWorkflow, /head_branch == 'main'/);
  assert.match(automaticWorkflow, /live-launch-evidence-\$\{SOURCE_SHA\}/);
  assert.match(automaticWorkflow, /SOURCE_EVIDENCE_MODE: live-role-smoke/);
  assert.match(automaticWorkflow, /record-firestore-evidence\.js .* --write/);
});

test('post-write verifier requires all five signed-in smoke roles and conservative gate set', () => {
  for (const role of ['owner', 'tenant', 'technician', 'broker', 'admin']) {
    assert.match(verifier, new RegExp(`'${role}'`));
  }
  assert.match(verifier, /passedGateCount: expectedGates\.size/);
  assert.match(verifier, /passedSmokeRoleCount: expectedRoles\.size/);
});
