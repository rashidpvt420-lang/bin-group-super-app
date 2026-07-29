import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dispatcher = readFileSync('.github/workflows/phase1-public-dispatch.yml', 'utf8');
const deploy = readFileSync('.github/workflows/phase1-public-production-deploy.yml', 'utf8');
const liveJourney = readFileSync('scripts/run-phase1-public-owner-launch-evidence.mjs', 'utf8');

test('Phase 1 dispatcher is credential-free and requires an Owner-created open draft exact-main request', () => {
  assert.match(dispatcher, /pull_request:/);
  assert.match(dispatcher, /github\.event\.pull_request\.draft == true/);
  assert.match(dispatcher, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(dispatcher, /Authorize protected Phase 1 public release/);
  assert.match(dispatcher, /ops\/dispatch-phase1-public-/);
  assert.match(dispatcher, /Request must change only \.github\/phase1-public-dispatch-request/);
  assert.match(dispatcher, /main_sha.*PR_BASE_SHA/s);
  assert.match(dispatcher, /actions:\s*write/);
  assert.doesNotMatch(dispatcher, /environment:\s*production/);
  assert.doesNotMatch(dispatcher, /id-token:\s*write/);
  assert.doesNotMatch(dispatcher, /secrets\./);
});

test('Phase 1 request explicitly limits payment to Cash and Cheque', () => {
  for (const source of [dispatcher, deploy]) {
    assert.match(source, /payment_methods=CASH,CHEQUE/);
    assert.match(source, /bank_transfer_enabled=false/);
    assert.match(source, /stripe_enabled=false/);
  }
  assert.doesNotMatch(deploy, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|cs_live_|stripe_live_checkout_session_id/);
});

test('protected deploy requires exact SHA production environment and complete build', () => {
  assert.match(deploy, /workflow_dispatch:/);
  assert.match(deploy, /environment:\s*production/);
  assert.match(deploy, /GITHUB_SHA.*EXPECTED_SHA/s);
  assert.match(deploy, /git ls-remote --exit-code origin refs\/heads\/main/);
  assert.match(deploy, /google-github-actions\/auth@v2/);
  assert.match(deploy, /npm run test:launch-honesty/);
  assert.match(deploy, /npm run typecheck/);
  assert.match(deploy, /npm run build:functions/);
  assert.match(deploy, /npm run test:rules/);
  assert.match(deploy, /node scripts\/deploy-firebase-production\.mjs/);
});

test('YES-GO can only be written after clean App Check and full Owner/Admin MFA live evidence', () => {
  assert.match(deploy, /production-clean-browser-appcheck\.spec\.ts/);
  assert.match(deploy, /unset VITE_FIREBASE_APPCHECK_DEBUG_TOKEN FIREBASE_APPCHECK_DEBUG_TOKEN/);
  assert.match(deploy, /run-phase1-public-owner-launch-evidence\.mjs/);
  assert.match(deploy, /deployment\.deployedCommitSha !== sha/);
  assert.match(deploy, /appCheck\.debugTokenPresent !== false/);
  assert.match(deploy, /journey\.hardLaunchDecision !== 'YES-GO'/);
  assert.match(deploy, /decision:\s*'YES-GO'/);
  assert.match(deploy, /noGoBlockersRemaining:\s*\[\]/);
});

test('live Owner journey covers server property IDs private documents verified visits payment config MFA and activation', () => {
  assert.match(liveJourney, /id:\s*'prop-1'/);
  assert.match(liveJourney, /canonicalPropertyId = `\$\{intakeId\}_property_1`/);
  assert.match(liveJourney, /firebaseStorageDownloadTokens/);
  assert.match(liveJourney, /requestOwnerInspectionSignatureOtp/);
  assert.match(liveJourney, /readGmailOtp/);
  assert.match(liveJourney, /adminRecordOwnerPortfolioVisitEvidence/);
  assert.match(liveJourney, /gpsWithinRadius|arrivalDistanceMetres/);
  assert.match(liveJourney, /adminRecordOwnerMobilizationPaymentEvidence/);
  assert.match(liveJourney, /paymentConfigHash/);
  assert.match(liveJourney, /signInWithRequiredTotpMfa/);
  assert.match(liveJourney, /adminApprovePayment/);
  assert.match(liveJourney, /dashboardUnlocked: true/);
  assert.match(liveJourney, /hardLaunchDecision: 'YES-GO'/);
});
