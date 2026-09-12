#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  protectedHostedAssetUrl,
  validateHostedReleaseBinding,
} from '../../scripts/hard-clearance-production-revalidation.mjs';
import { assertProtectedProductionContext } from '../../scripts/resolve-admin-app-check-site-key.mjs';
import { validateFrozenReleaseEvidenceContext } from '../../scripts/run-frozen-release-evidence.mjs';

const read = (file) => readFile(file, 'utf8');

test('hard clearance freshly revalidates production state without moving the frozen pilot release', async () => {
  const workflow = await read('.github/workflows/live-role-smoke.yml');

  assert.match(workflow, /hard-clearance-production-revalidation:/);
  assert.match(workflow, /name: Freshly revalidate protected production state/);
  assert.match(workflow, /hard-clearance-production-revalidation:[\s\S]*?environment: production/);
  assert.match(workflow, /hard-public-launch-clearance:[\s\S]*?needs: hard-clearance-production-revalidation[\s\S]*?environment: hard-public-launch/);
  assert.match(workflow, /Verify control-plane-only repair scope/);
  assert.match(workflow, /git -C control-plane merge-base --is-ancestor/);
  assert.match(workflow, /Non-control-plane file changed since pilot release/);

  const expectedAllowlist = [
    '.github/workflows/firebase-production-deploy.yml',
    '.github/workflows/live-role-smoke.yml',
    '.github/workflows/operational-application-evidence.yml',
    '.github/workflows/operational-provider-evidence.yml',
    '.github/workflows/privileged-access-rotation-evidence.yml',
    '.github/workflows/technician-physical-evidence.yml',
    'scripts/finalize-operational-provider-evidence.mjs',
    'scripts/launch-status.mjs',
    'scripts/hard-clearance-production-revalidation.mjs',
    'scripts/publish-direct-operational-proof.mjs',
    'scripts/publish-operational-application-evidence.mjs',
    'scripts/publish-operational-provider-evidence.mjs',
    'scripts/resolve-admin-app-check-site-key.mjs',
    'scripts/run-frozen-release-evidence.mjs',
    'scripts/verify-hard-launch-approval.mjs',
    'scripts/verify-operational-readiness.mjs',
    'tests/launch/ai-operational-contract.test.mjs',
    'tests/launch/external-gate-production-provenance.test.mjs',
    'tests/launch/final-operational-evidence-producers.test.mjs',
    'tests/launch/hard-clearance-revalidation.test.mjs',
    'tests/launch/operational-application-evidence-audit.test.mjs',
  ];
  const allowlistBody = workflow.match(/allowed='\^\(([^'\n]+)\)\$'/)?.[1];
  assert.ok(allowlistBody, 'control-plane allowlist declaration is missing');
  const actualAllowlist = allowlistBody
    .split('|')
    .map((value) => value.replaceAll('\\.', '.'))
    .sort();
  assert.deepEqual(actualAllowlist, [...expectedAllowlist].sort());

  assert.match(workflow, /Checkout frozen pilot release/);
  assert.match(workflow, /ref:\s*\$\{\{\s*inputs\.expected_commit_sha\s*\}\}/);
  assert.match(workflow, /path:\s*release/);
  assert.match(workflow, /Verify live-evidence run provenance and enforce a real 24-hour pilot/);
  assert.match(workflow, /node scripts\/resolve-live-pilot-window\.mjs/);
  assert.match(workflow, /hard-clearance-production-revalidation-\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /HARD_CLEARANCE_REVALIDATION_MODE: consume/);

  const revalidationJob = workflow.slice(
    workflow.indexOf('  hard-clearance-production-revalidation:'),
    workflow.indexOf('  hard-public-launch-clearance:'),
  );
  assert.match(revalidationJob, /cp control-plane\/scripts\/resolve-admin-app-check-site-key\.mjs release\/scripts\/resolve-admin-app-check-site-key\.mjs/);
  assert.match(workflow, /cp control-plane\/scripts\/verify-operational-readiness\.mjs release\/scripts\/verify-operational-readiness\.mjs/);
  assert.match(workflow, /CONTROL_PLANE_COMMIT_SHA: \$\{\{ github\.sha \}\}[\s\S]*?run: node scripts\/verify-operational-readiness\.mjs/);
  const authIndex = revalidationJob.indexOf('Authenticate Google Cloud');
  const installIndex = revalidationJob.indexOf('Install frozen-release dependencies');
  const resolveIndex = revalidationJob.indexOf('Resolve canonical Admin Enterprise App Check config');
  const generateIndex = revalidationJob.indexOf('Generate fresh production hard-clearance revalidation');
  assert.ok(authIndex >= 0 && installIndex > authIndex);
  assert.ok(resolveIndex > installIndex && generateIndex > resolveIndex);

  assert.doesNotThrow(() => assertProtectedProductionContext({
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKFLOW: 'Live Role Smoke Tests',
    GITHUB_JOB: 'hard-clearance-production-revalidation',
    DEPLOYMENT_ENVIRONMENT: 'production',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: 'a'.repeat(40),
    GCP_PROJECT_ID: 'bin-group-57c60',
    GITHUB_ENV: '/tmp/github-env',
  }));

  // The authorization job must no longer demand that the frozen release SHA
  // equal the newer, narrowly reviewed clearance-control commit.
  const hardJob = workflow.slice(workflow.indexOf('  hard-public-launch-clearance:'));
  assert.doesNotMatch(hardJob, /TARGET_SHA[^\n]*CURRENT_SHA|TARGET_SHA\" != \"\$CURRENT_SHA/);
});

test('operational evidence keeps current main as control plane while binding proof to the frozen deployment', async () => {
  const workflowFiles = [
    '.github/workflows/operational-application-evidence.yml',
    '.github/workflows/operational-provider-evidence.yml',
    '.github/workflows/privileged-access-rotation-evidence.yml',
    '.github/workflows/technician-physical-evidence.yml',
  ];
  const expectedAllowlist = [
    '.github/workflows/firebase-production-deploy.yml',
    '.github/workflows/live-role-smoke.yml',
    ...workflowFiles,
    'scripts/finalize-operational-provider-evidence.mjs',
    'scripts/launch-status.mjs',
    'scripts/hard-clearance-production-revalidation.mjs',
    'scripts/publish-direct-operational-proof.mjs',
    'scripts/publish-operational-application-evidence.mjs',
    'scripts/publish-operational-provider-evidence.mjs',
    'scripts/resolve-admin-app-check-site-key.mjs',
    'scripts/run-frozen-release-evidence.mjs',
    'scripts/verify-hard-launch-approval.mjs',
    'scripts/verify-operational-readiness.mjs',
    'tests/launch/ai-operational-contract.test.mjs',
    'tests/launch/external-gate-production-provenance.test.mjs',
    'tests/launch/final-operational-evidence-producers.test.mjs',
    'tests/launch/hard-clearance-revalidation.test.mjs',
    'tests/launch/operational-application-evidence-audit.test.mjs',
  ].sort();

  for (const workflowFile of workflowFiles) {
    const workflow = await read(workflowFile);
    assert.match(workflow, /expected_commit_sha:[\s\S]*?current control-plane main SHA/);
    assert.match(workflow, /frozen_release_sha:[\s\S]*?frozen production release SHA/);
    assert.match(workflow, /TARGET_SHA: \$\{\{ inputs\.expected_commit_sha \}\}/);
    assert.match(workflow, /\[\[ "\$TARGET_SHA" != "\$GITHUB_SHA" \]\]/);
    assert.match(workflow, /ref: \$\{\{ github\.sha \}\}[\s\S]*?path: control-plane[\s\S]*?fetch-depth: 0/);
    assert.match(workflow, /git -C control-plane merge-base --is-ancestor "\$RELEASE_SHA" "\$CONTROL_PLANE_SHA"/);
    assert.match(workflow, /ref: \$\{\{ inputs\.frozen_release_sha \}\}[\s\S]*?path: release/);
    assert.match(workflow, /name: production-deployment-\$\{\{ inputs\.frozen_release_sha \}\}/);
    assert.match(workflow, /node \.\.\/control-plane\/scripts\/run-frozen-release-evidence\.mjs scripts\//);
    assert.doesNotMatch(workflow, /GITHUB_SHA="\$PRODUCTION_RELEASE_SHA"/);
    assert.match(workflow, /Overlay reviewed dual-SHA publisher/);

    const allowlistBody = workflow.match(/allowed='\^\(([^'\n]+)\)\$'/)?.[1];
    assert.ok(allowlistBody, `${workflowFile} control-plane allowlist is missing`);
    const actualAllowlist = allowlistBody.split('|').map((value) => value.replaceAll('\\.', '.')).sort();
    assert.deepEqual(actualAllowlist, expectedAllowlist);
  }

  const providerWorkflow = await read('.github/workflows/operational-provider-evidence.yml');
  assert.match(providerWorkflow, /production_deploy_run_id:[\s\S]*?required: true/);
  assert.match(providerWorkflow, /all-baseline must not receive Stripe-only inputs/);
  assert.doesNotMatch(providerWorkflow, /all-baseline must not receive deployment/);

  const publishers = await Promise.all([
    read('scripts/publish-operational-application-evidence.mjs'),
    read('scripts/publish-operational-provider-evidence.mjs'),
    read('scripts/publish-direct-operational-proof.mjs'),
    read('scripts/finalize-operational-provider-evidence.mjs'),
  ]);
  for (const publisher of publishers) {
    assert.match(publisher, /PRODUCTION_RELEASE_SHA/);
    assert.match(publisher, /CONTROL_PLANE_COMMIT_SHA/);
    assert.match(publisher, /CONTROL_PLANE_SCOPE_VERIFIED/);
    assert.match(publisher, /releaseCommitSha/);
    assert.match(publisher, /controlPlaneCommitSha/);
  }

  const readiness = await read('scripts/verify-operational-readiness.mjs');
  assert.match(readiness, /gate\.releaseCommitSha !== commitSha/);
  assert.match(readiness, /gate\.controlPlaneCommitSha !== controlPlaneCommitSha/);
});

test('frozen-release evidence runner refuses forged control-plane context and arbitrary entrypoints', async () => {
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW: 'Operational Application Evidence',
    GITHUB_JOB: 'verify-and-publish',
    GITHUB_SHA: 'a'.repeat(40),
    CONTROL_PLANE_COMMIT_SHA: 'b'.repeat(40),
    PRODUCTION_RELEASE_SHA: 'c'.repeat(40),
    PRODUCTION_DEPLOY_RUN_ID: '34500748478',
    CONTROL_PLANE_SCOPE_VERIFIED: 'true',
  };
  assert.throws(
    () => validateFrozenReleaseEvidenceContext(env, process.cwd(), 'scripts/publish-operational-application-evidence.mjs'),
    /control-plane SHA must equal the protected workflow GITHUB_SHA/,
  );
  assert.throws(
    () => validateFrozenReleaseEvidenceContext(
      { ...env, CONTROL_PLANE_COMMIT_SHA: env.GITHUB_SHA },
      process.cwd(),
      'scripts/arbitrary.mjs',
    ),
    /entrypoint is not authorized/,
  );
  const runner = await read('scripts/run-frozen-release-evidence.mjs');
  assert.match(runner, /entrypoint is not authorized for this protected job/);
  assert.match(runner, /production deployment is older than seven days/);
  assert.match(runner, /GITHUB_SHA: releaseSha/);
});

test('production deploy consumes frozen clearance under a separate current-main control-plane SHA', async () => {
  const workflow = await read('.github/workflows/firebase-production-deploy.yml');

  assert.match(workflow, /EXPECTED_COMMIT_SHA: \$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /CURRENT_COMMIT_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /\[\[ "\$EXPECTED_COMMIT_SHA" == "\$CURRENT_COMMIT_SHA" \]\]/);
  assert.match(workflow, /FROZEN_HARD_CLEARANCE_RELEASE_SHA_INPUT: \$\{\{ fromJSON\(inputs\.deployment_payload_json\)\.frozen_hard_clearance_release_sha \}\}/);
  assert.match(workflow, /\[\[ "\$FROZEN_HARD_CLEARANCE_RELEASE_SHA_INPUT" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(workflow, /\[\[ "\$HARD_CLEARANCE_RUN_ID_INPUT" =~ \^\[0-9\]\+\$ \]\]/);

  const provenanceChecks = workflow.match(/\.name == "Live Role Smoke Tests" and[\s\S]*?\.head_branch == "main" and[\s\S]*?\.head_sha == \$sha and[\s\S]*?\.conclusion == "success"/g) || [];
  assert.equal(provenanceChecks.length, 2);

  const frozenArtifactNames = workflow.match(/name: hard-public-launch-clearance-\$\{\{ fromJSON\(inputs\.deployment_payload_json\)\.frozen_hard_clearance_release_sha \}\}/g) || [];
  assert.equal(frozenArtifactNames.length, 2);
  const frozenArtifactVerifiers = workflow.match(/EXPECTED_COMMIT_SHA: \$\{\{ fromJSON\(inputs\.deployment_payload_json\)\.frozen_hard_clearance_release_sha \}\}/g) || [];
  assert.equal(frozenArtifactVerifiers.length, 2);

  const dualBindings = workflow.match(/\.releaseCommitSha == \$release and[\s\S]*?\.controlPlaneCommitSha == \$control and[\s\S]*?\.controlPlaneScopeVerified == true/g) || [];
  assert.equal(dualBindings.length, 2);

  assert.match(workflow, /PAYMENT_POLICY_INPUT[\s\S]*?phase1-manual/);
  assert.match(workflow, /\[\[ -z "\$STRIPE_LIVE_SESSION_ID_INPUT" && -z "\$STRIPE_LIVE_EVENT_ID_INPUT" \]\]/);
});

test('fresh revalidation keeps mutable production checks strict instead of extending their expiry', async () => {
  const revalidation = await read('scripts/hard-clearance-production-revalidation.mjs');
  const phone = await read('scripts/verify-firebase-phone-auth-production.mjs');
  const admin = await read('scripts/verify-admin-mfa-production.mjs');
  const hosted = await read('scripts/verify-hosted-client-config.mjs');

  assert.match(revalidation, /runProductionOtpMailboxPreflight/);
  assert.match(revalidation, /verifyFirebasePhoneAuthProduction/);
  assert.match(revalidation, /verifyAdminMfaProduction/);
  assert.match(revalidation, /summarizeHostedClientBundle/);
  assert.match(revalidation, /validateHostedClientConfigEvidence/);
  assert.match(revalidation, /CONTROL_PLANE_SCOPE_VERIFIED/);
  assert.match(revalidation, /MAX_REVALIDATION_AGE_MS = 2 \* 60 \* 60 \* 1000/);
  assert.match(revalidation, /mailboxesVerified, 2/);
  assert.match(revalidation, /peppersVerified, 2/);
  assert.match(revalidation, /secretValuesLogged, false/);
  assert.match(revalidation, /hardLaunchClaim: false/);

  // Fresh proof may be labeled with the frozen SHA only after current Hosting
  // is cryptographically bound to the frozen release's rebuilt deployable bytes.
  assert.match(revalidation, /computeValidatedArtifactDigest/);
  assert.match(revalidation, /hostedReleaseBinding/);
  assert.match(revalidation, /rebuiltArtifactDigest/);
  assert.match(revalidation, /exactBytesVerified/);
  assert.match(revalidation, /request as httpsRequest/);
  assert.match(revalidation, /return 'bin-group-57c60\.web\.app'/);
  assert.match(revalidation, /return 'bin-group-admin-panel\.web\.app'/);
  assert.match(revalidation, /requestedUrl\.hostname !== hostname/);
  assert.match(revalidation, /status < 200 \|\| status >= 300/);
  assert.match(revalidation, /received > MAX_HOSTING_FILE_BYTES/);
  assert.doesNotMatch(revalidation, /\bfetch\s*\(/);
  assert.match(revalidation, /allowedHostedAssetUrls\.includes\(requestedHref\)/);
  assert.doesNotMatch(revalidation, /fetchProtectedHostedAsset/);
  assert.match(revalidation, /frozen-release-rebuild-and-live-byte-comparison/);
  assert.match(revalidation, /\['run', 'prepare:rules'\]/);

  // The repair must never solve the 24-hour contradiction by weakening the
  // original freshness guards. It generates new evidence instead.
  assert.match(phone, /EVIDENCE_MAX_AGE_MS = 1000 \* 60 \* 60 \* 24/);
  assert.match(admin, /EVIDENCE_MAX_AGE_MS = 1000 \* 60 \* 60 \* 24/);
  assert.match(hosted, /EVIDENCE_MAX_AGE_MS = 1000 \* 60 \* 60 \* 24/);
});

test('hosted byte verifier can only address fixed production origins', () => {
  assert.equal(
    protectedHostedAssetUrl('main', 'assets/index.js').href,
    'https://bin-group-57c60.web.app/assets/index.js',
  );
  assert.equal(
    protectedHostedAssetUrl('admin', 'static/js/main.js').href,
    'https://bin-group-admin-panel.web.app/static/js/main.js',
  );
  for (const candidate of [
    'https://attacker.example/payload.js',
    '//attacker.example/payload.js',
    '../payload.js',
    'assets/../../payload.js',
    'assets//payload.js',
    '/assets/index.js',
  ]) {
    assert.throws(() => protectedHostedAssetUrl('main', candidate), /unsafe main hosted asset path/);
  }
  assert.throws(() => protectedHostedAssetUrl('other', 'assets/index.js'), /unsupported hosted site/);
});

test('fresh hosted proof binds original artifact digest to exact live bytes', () => {
  const releaseSha = 'a'.repeat(40);
  const artifactDigest = `sha256:${'b'.repeat(64)}`;
  const main = {
    site: 'main',
    origin: 'https://bin-group-57c60.web.app',
    releaseCommitSha: releaseSha,
    fileCount: 3,
    totalBytes: 1_024,
    javascriptAssetCount: 1,
    rebuiltDigest: artifactDigest,
    liveDigest: artifactDigest,
    exactBytesVerified: true,
  };
  const binding = {
    schemaVersion: 1,
    status: 'passed',
    source: 'frozen-release-rebuild-and-live-byte-comparison',
    algorithm: 'sha256-path-null-content-v1',
    releaseCommitSha: releaseSha,
    originalArtifactDigest: artifactDigest,
    rebuiltArtifactDigest: artifactDigest,
    exactBytesVerified: true,
    main,
    admin: {
      ...main,
      site: 'admin',
      origin: 'https://bin-group-admin-panel.web.app',
    },
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };
  const deploymentDoc = {
    artifactDigest,
    validatedArtifactDigest: artifactDigest,
  };
  assert.deepEqual(validateHostedReleaseBinding(binding, { releaseSha, deploymentDoc }), []);

  const borrowedProof = structuredClone(binding);
  borrowedProof.admin.liveDigest = `sha256:${'c'.repeat(64)}`;
  borrowedProof.admin.exactBytesVerified = false;
  assert.deepEqual(
    validateHostedReleaseBinding(borrowedProof, { releaseSha, deploymentDoc }),
    [
      'admin hosted release binding exactBytesVerified mismatch',
      'admin hosted release binding byte digest mismatch',
    ],
  );
});

test('launch status consumes the same-run proof rather than reusing stale deployment-local auth evidence', async () => {
  const status = await read('scripts/launch-status.mjs');
  assert.match(status, /HARD_CLEARANCE_REVALIDATION_MODE/);
  assert.match(status, /hardClearanceProductionRevalidation/);
  assert.match(status, /hard-clearance-production-revalidation\.mjs', '--verify'/);
  assert.match(status, /consumeHardClearanceRevalidation[\s\S]*?\? \[\]/);
  assert.match(status, /productionDeployment/);
  assert.match(status, /hardClearanceRevalidationConsumed/);
});

test('hard launch status binds eligibility to the checked-out frozen release SHA', async () => {
  const approval = await read('scripts/verify-hard-launch-approval.mjs');
  assert.match(approval, /import \{ gitSha \} from '\.\/lib\/launch-honesty\.mjs'/);
  assert.match(approval, /const commitSha = gitSha\(root\)/);
  assert.match(approval, /HARD_LAUNCH_EXPECTED_SHA/);
  assert.match(approval, /expectedSha !== commitSha/);
  assert.doesNotMatch(approval, /const commitSha = String\(process\.env\.GITHUB_SHA/);
});
