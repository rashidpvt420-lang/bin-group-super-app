import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orchestrator = readFileSync('.github/workflows/founder-release-orchestrator-one-shot.yml', 'utf8');
const readiness = readFileSync('.github/workflows/production-provider-readiness.yml', 'utf8');
const readinessScript = readFileSync('scripts/verify-production-smtp-provider.mjs', 'utf8');

test('protected release orchestrator is explicit and reuses only successful exact-SHA immutable evidence', () => {
  assert.match(orchestrator, /workflow_dispatch:/);
  assert.doesNotMatch(orchestrator, /\n\s*push:/);
  assert.match(orchestrator, /RUN_PROTECTED_RELEASE_BIN_GROUP/);
  assert.match(orchestrator, /GITHUB_SHA.*TARGET_SHA/);
  assert.match(orchestrator, /head_branch == "main"/);
  assert.match(orchestrator, /event == "workflow_dispatch"/);
  assert.match(orchestrator, /status == "completed" and \.conclusion == "success"/);
  assert.match(orchestrator, /production-deployment-\$TARGET_SHA/);
  assert.match(orchestrator, /live-launch-evidence-\$TARGET_SHA/);
  assert.match(orchestrator, /bin-group-android-release-\$TARGET_SHA/);
  assert.match(orchestrator, /launch_mode:"bank-pilot"/);
  assert.match(orchestrator, /run_public_release_gate:false/);
  assert.match(orchestrator, /mode:"live-evidence"/);
  assert.match(orchestrator, /BUILD_SIGNED_ANDROID_AAB_BIN_GROUP/);
  assert.match(orchestrator, /assert_main/);
});

test('provider readiness is manual, exact-SHA protected, and never deploys or sends email', () => {
  assert.match(readiness, /workflow_dispatch:/);
  assert.doesNotMatch(readiness, /\n\s*(?:push|schedule):/);
  assert.match(readiness, /environment: production/);
  assert.match(readiness, /VERIFY_PRODUCTION_PROVIDER_READINESS_BIN_GROUP/);
  assert.match(readiness, /GITHUB_SHA.*EXPECTED_SHA/);
  assert.match(readiness, /google-github-actions\/auth@/);
  assert.match(readiness, /setup-gcloud@/);
  assert.match(readiness, /verify-production-smtp-provider\.mjs/);
  assert.doesNotMatch(readiness, /firebase deploy/);
  assert.doesNotMatch(readiness, /sendMail\s*\(/);
  assert.match(readinessScript, /runSmtpProviderPreflight/);
  assert.doesNotMatch(readinessScript, /sendMail\s*\(/);
});
