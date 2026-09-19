#!/usr/bin/env node

import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const PRODUCTION_PROJECT_ID = 'bin-group-57c60';
const CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups.com';
const CANONICAL_FOUNDER_LOGIN = 'rashidpvt420-lang';
const OWNER_COMMAND_ISSUE = 434;
const GITHUB_ACTIONS_BOT = 'github-actions[bot]';
const SHA_RE = /^[0-9a-f]{40}$/;
const RUN_ID_RE = /^\d+$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

const ALLOWED_ENTRYPOINTS = Object.freeze({
  'Operational Application Evidence/verify-and-publish': new Set([
    'scripts/prepare-operational-application-evidence.mjs',
    'scripts/verify-operational-application-provenance.mjs',
    'scripts/verify-operational-application-evidence-mfa.mjs',
    'scripts/bind-operational-application-provenance.mjs',
  ]),
  'Operational Provider Evidence/verify-and-publish': new Set([
    'scripts/verify-smtp-live-delivery.mjs',
    'scripts/verify-appcheck-enforcement.mjs',
    'scripts/verify-ai-live-evidence.mjs',
    'scripts/verify-stripe-live-proof.mjs',
  ]),
  'Technician Physical Evidence/verify-physical-evidence': new Set([
    'scripts/verify-technician-physical-evidence.mjs',
  ]),
  'Privileged Access Rotation Evidence/verify-rotation': new Set([
    'scripts/verify-admin-credential-login.mjs',
    'scripts/verify-privileged-access-rotation.mjs',
    'scripts/bind-admin-credential-rotation-proof.mjs',
  ]),
});

const fail = (message) => {
  throw new Error(`[frozen-release-evidence] ${message}`);
};

// Use the deployed pure policy, including its final inspected quote selection.
// These exact Git blobs belong to frozen release 15b0951. A different policy
// requires another reviewed control-plane repair, not an implicit fallback.
const PAYMENT_POLICY_BLOBS = Object.freeze({
  'functions/shared/aedMoney.ts': '4526fb637327beb59bb11feb849f58fecc38ff0d',
  'functions/ownerActivationPaymentPolicy.ts': '06f056113367bda1fca22bcdba95ab975e594f54',
});
const APPLICATION_VERIFIER = 'scripts/verify-operational-application-evidence.mjs';
const REVIEWED_APPLICATION_VERIFIER_BLOB = '3e48a8d109603b86506cb2d7cc733118abc0b7f1';
const APPLICATION_PREPARATION = 'scripts/prepare-operational-application-evidence.mjs';
const REVIEWED_APPLICATION_PREPARATION_BLOB = 'c7bfc39ef8a2a4bff21a8f92363ecd4fd1437590';
const LEGACY_ACTIVATION_CHECK = [
  '  const annual = Number(payment.data.quoteSnapshot?.annualContractValue || contract.quoteSnapshot?.annualContractValue || contract.annualContractValue || 0);',
  '  const amount = Number(payment.data.amountReceived || payment.data.quoteSnapshot?.activationDeposit || payment.data.amount || 0);',
  "  if (!Number.isFinite(annual) || annual <= 0 || !Number.isFinite(amount) || Math.abs(amount - Math.round(annual * 0.15)) > 0.01) fail('activation amount is not the locked 15% deposit');",
].join('\n');
const LEGACY_TENANT_PHOTO_SELECTION = [
  '    ticket.requestPhotoUrl,',
  '    ...(Array.isArray(ticket.photoUrls) ? ticket.photoUrls : []),',
  '    ...(Array.isArray(ticket.images) ? ticket.images : []),',
].join('\n');
const REVIEWED_TENANT_PHOTO_SELECTION = [
  '    ticket.requestPhotoUrl,',
  '    ticket.primaryPhotoUrl,',
  '    ...(Array.isArray(ticket.photoUrls) ? ticket.photoUrls : []),',
  '    ...(Array.isArray(ticket.photos) ? ticket.photos : []),',
  '    ...(Array.isArray(ticket.beforePhotos) ? ticket.beforePhotos : []),',
  '    ...(Array.isArray(ticket.tenantPhotos) ? ticket.tenantPhotos : []),',
  '    ...(Array.isArray(ticket.initialPhotoUrls) ? ticket.initialPhotoUrls : []),',
  '    ...(Array.isArray(ticket.images) ? ticket.images : []),',
].join('\n');
const LEGACY_BROKER_PAYMENT_SELECTION = [
  '  const paymentId = canonicalId(',
  '    contractBefore.data.approvedPaymentId || contractBefore.data.activationPaymentId || contractBefore.data.paymentId,',
  "    'payment_id',",
  '  );',
  "  const payment = await requireSnapshot(db.collection('payment_transactions').doc(paymentId), `payment_transactions/${paymentId}`);",
].join('\n');
const REVIEWED_BROKER_PAYMENT_SELECTION = [
  '  const directPaymentId = text(',
  '    contractBefore.data.approvedPaymentId || contractBefore.data.activationPaymentId || contractBefore.data.paymentId,',
  '  );',
  '  let payment;',
  "  if (/^[A-Za-z0-9_-]{3,180}$/.test(directPaymentId)) {",
  '    payment = await requireSnapshot(',
  "      db.collection('payment_transactions').doc(directPaymentId),",
  '      `payment_transactions/${directPaymentId}`,',
  '    );',
  '  } else {',
  "    const paymentsSnapshot = await db.collection('payment_transactions').where('status', '==', 'APPROVED').limit(100).get();",
  "    const paymentCandidates = sortedResults(paymentsSnapshot, ['approvedAt', 'updatedAt', 'createdAt']);",
  '    payment = paymentCandidates.find(({ data }) =>',
  '      data.paymentVerified === true &&',
  '      data.unlocksDashboard === true &&',
  '      text(data.contractId || data.intakeId) === contractId',
  '    );',
  "    if (!payment) fail('no approved production payment is bound to the broker commission contract');",
  '  }',
  "  const paymentId = canonicalId(payment.id, 'payment_id');",
].join('\n');

// AI live evidence uses a reviewed control-plane verifier over the frozen
// deployed runtime. Pin the exact verifier blob so the dual-SHA overlay cannot
// silently expand beyond the reviewed run-scoped quota isolation contract.
const AI_VERIFIER = 'scripts/verify-ai-live-evidence.mjs';
const REVIEWED_AI_VERIFIER_BLOB = '9c613db118a2e05efc3b089ef7890a7d48d4ee03';
const LEGACY_AI_QUOTA_BOUNDARY_PROBE = [
  '  const boundarySuccessResult = await callSovereignAi({',
  '    idToken: auth.idToken,',
  '    appCheckToken,',
  "    data: { text: 'Return a brief advisory-only boundary statement.', evidenceProbe: true, provider: 'gemini' },",
  '  });',
].join('\n');
const REVIEWED_AI_QUOTA_BOUNDARY_PROBE = [
  '  const boundarySuccessResult = await callSovereignAi({',
  '    idToken: auth.idToken,',
  '    appCheckToken,',
  "    data: { ...sensitiveProbe, provider: 'gemini' },",
  '  });',
].join('\n');
const LEGACY_AI_PROVIDER_AUTHORITY_SAMPLE = '    clientContextAuthoritative: data.clientContextAuthoritative === false,';
const REVIEWED_AI_PROVIDER_AUTHORITY_SAMPLE = '    clientContextAuthoritative: false,';

export function assertApplicationEvidenceCredentials(gate, env = process.env) {
  if (!['all', 'paymentUnlockExactlyOnce', 'brokerCommissionLockExactlyOnce'].includes(gate)) return;
  const required = ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'E2E_FOUNDER_TOTP_SECRET', 'VITE_FIREBASE_API_KEY'];
  const missing = required.filter((name) => !String(env[name] ?? '').trim());
  if (missing.length) fail(`missing protected application evidence bindings: ${missing.join(', ')}`);
  if (String(env.E2E_FOUNDER_EMAIL).trim().toLowerCase() !== CANONICAL_FOUNDER_EMAIL) {
    fail('application replay requires the canonical Founder identity');
  }
}

export function assertApplicationPreparationCredentials(gate, env = process.env) {
  if (!['all', 'tenantNotificationDelivery', 'brokerCommissionLockExactlyOnce', 'adminStaffClaims'].includes(gate)) {
    fail('application preparation requires all, tenantNotificationDelivery, brokerCommissionLockExactlyOnce, or adminStaffClaims');
  }
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN',
  ];
  if (['all', 'tenantNotificationDelivery'].includes(gate)) {
    required.push('E2E_TENANT_EMAIL', 'E2E_TENANT_PASSWORD');
  }
  if (['all', 'brokerCommissionLockExactlyOnce', 'adminStaffClaims'].includes(gate)) {
    required.push('E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'E2E_FOUNDER_TOTP_SECRET');
  }
  if (['all', 'brokerCommissionLockExactlyOnce'].includes(gate)) {
    required.push('E2E_BROKER_MAILBOX_EMAIL');
  }
  const missing = required.filter((name) => !String(env[name] ?? '').trim());
  if (missing.length) fail(`missing protected application preparation bindings: ${missing.join(', ')}`);
  if (
    ['all', 'tenantNotificationDelivery'].includes(gate)
    && String(env.E2E_BASE_URL || '').replace(/\/+$/, '') !== 'https://bin-group-57c60.web.app'
  ) {
    fail('tenant notification preparation requires the canonical production site');
  }
  if (
    ['all', 'brokerCommissionLockExactlyOnce', 'adminStaffClaims'].includes(gate)
    && String(env.E2E_FOUNDER_EMAIL || '').trim().toLowerCase() !== CANONICAL_FOUNDER_EMAIL
  ) {
    fail('protected application preparation requires the canonical Founder identity');
  }
}

function fetchPublicGithubJson(url, env = process.env) {
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!token) fail('GITHUB_TOKEN is required for protected owner-command provenance');
  let raw;
  try {
    raw = execFileSync('curl', [
      '--fail', '--silent', '--show-error', '--location',
      '--header', 'Accept: application/vnd.github+json',
      '--header', 'X-GitHub-Api-Version: 2022-11-28',
      '--header', 'User-Agent: BIN-GROUP-hard-launch-evidence',
      '--header', `Authorization: Bearer ${token}`,
      url,
    ], { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  } catch (error) {
    fail(`could not verify protected owner-command provenance: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    fail('protected owner-command provenance response was not valid JSON');
  }
}

function verifyRecentOwnerApplicationCommand(env) {
  const controlSha = String(env.CONTROL_PLANE_COMMIT_SHA || '').trim();
  const releaseSha = String(env.PRODUCTION_RELEASE_SHA || '').trim();
  const deployRunId = String(env.PRODUCTION_DEPLOY_RUN_ID || '').trim();
  const runId = String(env.GITHUB_RUN_ID || '').trim();
  if (!SHA_RE.test(controlSha) || !SHA_RE.test(releaseSha) || !RUN_ID_RE.test(deployRunId) || !RUN_ID_RE.test(runId)) {
    fail('owner-command application provenance requires exact control/release SHA and numeric run bindings');
  }
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch') fail('owner-command application provenance requires workflow_dispatch');

  const run = fetchPublicGithubJson(`https://api.github.com/repos/${EXPECTED_REPOSITORY}/actions/runs/${runId}`, env);
  if (String(run?.id || '') !== runId || run?.event !== 'workflow_dispatch' || run?.head_sha !== controlSha) {
    fail('owner-command application provenance does not match this workflow run');
  }
  const runCreatedMs = Date.parse(String(run.created_at || ''));
  if (!Number.isFinite(runCreatedMs)) fail('owner-command application workflow timestamp is invalid');

  const since = new Date(runCreatedMs - 10 * 60 * 1000).toISOString();
  const comments = fetchPublicGithubJson(
    `https://api.github.com/repos/${EXPECTED_REPOSITORY}/issues/${OWNER_COMMAND_ISSUE}/comments?per_page=100&since=${encodeURIComponent(since)}`,
    env,
  );
  if (!Array.isArray(comments)) fail('owner-command provenance comments response is invalid');
  const expectedBodies = new Set([
    `/bin-launch evidence application-all ${controlSha} ${releaseSha} ${deployRunId}`,
    `/bin-launch evidence application-current ${controlSha} ${releaseSha} ${deployRunId}`,
  ]);
  const matching = comments.filter((comment) => {
    const createdMs = Date.parse(String(comment?.created_at || ''));
    return comment?.user?.login === CANONICAL_FOUNDER_LOGIN
      && comment?.author_association === 'OWNER'
      && expectedBodies.has(String(comment?.body || '').trim())
      && Number.isFinite(createdMs)
      && createdMs >= runCreatedMs - 10 * 60 * 1000
      && createdMs <= runCreatedMs + 2 * 60 * 1000;
  });
  if (matching.length < 1) fail('no exact recent repository-owner application evidence command authorizes this bot-dispatched run');
  return CANONICAL_FOUNDER_LOGIN;
}

export function resolveApplicationEvidenceActor(env = process.env) {
  const actor = String(env.GITHUB_ACTOR || '').trim();
  if (actor === CANONICAL_FOUNDER_LOGIN) return actor;
  if (actor !== GITHUB_ACTIONS_BOT) return actor;
  const allowed = String(env.AUTHORIZED_FOUNDER_ACTORS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowed.includes(GITHUB_ACTIONS_BOT)) fail('GitHub Actions bot is not authorized for protected evidence dispatch');
  return verifyRecentOwnerApplicationCommand(env);
}

function gitBlobSha(source) {
  const text = (typeof source === 'string' ? source : Buffer.isBuffer(source) ? source.toString('utf8') : String(source)).replace(/\r\n/g, '\n');
  const buffer = Buffer.from(text, 'utf8');
  return createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

function pinnedPolicySource(releaseRoot, relativePath) {
  const file = path.join(releaseRoot, relativePath);
  if (!lstatSync(file).isFile()) fail(`payment policy source is not a regular file: ${relativePath}`);
  const source = readFileSync(file);
  const blob = gitBlobSha(source);
  if (blob !== PAYMENT_POLICY_BLOBS[relativePath]) fail(`unreviewed frozen payment policy: ${relativePath}`);
  return source.toString('utf8');
}

export function verifyFrozenActivationPayment(payment, contract, releaseRoot = process.cwd()) {
  const received = payment?.amountReceived !== undefined ? payment.amountReceived : payment?.amount;
  if (!['number', 'string'].includes(typeof received) || String(received).trim() === '') {
    fail('activation payment has no valid recorded received amount');
  }
  if (payment?.currency != null && String(payment.currency).trim().toUpperCase() !== 'AED') {
    fail('activation payment currency is not AED');
  }
  const moneySource = pinnedPolicySource(releaseRoot, 'functions/shared/aedMoney.ts');
  const policySource = pinnedPolicySource(releaseRoot, 'functions/ownerActivationPaymentPolicy.ts');
  const ts = createRequire(path.join(releaseRoot, 'package.json'))('typescript');
  const evaluate = (source, fileName, dependencies = {}) => {
    const compiled = ts.transpileModule(source, {
      fileName,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    if (compiled.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error)) {
      fail(`could not load the frozen payment policy: ${fileName}`);
    }
    const exports = {};
    runInNewContext(compiled.outputText, {
      exports,
      require: (name) => {
        if (!Object.hasOwn(dependencies, name)) fail('unexpected frozen payment policy dependency');
        return dependencies[name];
      },
    }, { filename: fileName, timeout: 1000 });
    return exports;
  };
  const money = evaluate(moneySource, 'aedMoney.ts');
  const policy = evaluate(policySource, 'ownerActivationPaymentPolicy.ts', { './shared/aedMoney': money });
  const schedule = policy.resolveLockedOwnerActivationSchedule(contract, received);
  const amount = money.normalizeAedMoney(received);
  const amountMinor = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(Math.round(schedule.annualContractValue * 100))) {
    fail('activation payment exceeds the safe AED-cent range');
  }
  return { amount, amountMinor };
}

export function transformFrozenActivationVerifier(source, adapterUrl = import.meta.url) {
  if (source.split(LEGACY_ACTIVATION_CHECK).length !== 2) {
    fail('frozen activation verifier source drift; exact legacy check is required');
  }
  return source.replace(LEGACY_ACTIVATION_CHECK, [
    `  const { verifyFrozenActivationPayment } = await import(${JSON.stringify(adapterUrl)});`,
    '  const { amount } = verifyFrozenActivationPayment(payment.data, contract);',
  ].join('\n'));
}

export function transformFrozenTenantPhotoVerifier(source) {
  const legacyMatches = source.split(LEGACY_TENANT_PHOTO_SELECTION).length - 1;
  const reviewedMatches = source.split(REVIEWED_TENANT_PHOTO_SELECTION).length - 1;
  if (legacyMatches === 1 && reviewedMatches === 0) {
    return source.replace(LEGACY_TENANT_PHOTO_SELECTION, REVIEWED_TENANT_PHOTO_SELECTION);
  }
  if (legacyMatches === 0 && reviewedMatches === 1) {
    return source;
  }
  fail('frozen Tenant photo verifier source drift; exact legacy or reviewed selection is required');
}

export function transformFrozenBrokerPaymentVerifier(source) {
  const legacyMatches = source.split(LEGACY_BROKER_PAYMENT_SELECTION).length - 1;
  const reviewedMatches = source.split(REVIEWED_BROKER_PAYMENT_SELECTION).length - 1;
  if (legacyMatches === 1 && reviewedMatches === 0) return source.replace(LEGACY_BROKER_PAYMENT_SELECTION, REVIEWED_BROKER_PAYMENT_SELECTION);
  if (legacyMatches === 0 && reviewedMatches === 1) return source;
  fail('frozen broker payment verifier source drift; exact legacy or reviewed selection is required');
}

export function assertReviewedAiVerifierSource(source) {
  if (gitBlobSha(source) !== REVIEWED_AI_VERIFIER_BLOB) {
    fail('unreviewed isolated AI verifier');
  }
}

export function transformReviewedAiVerifierQuotaBoundary(source) {
  assertReviewedAiVerifierSource(source);
  if (source.split(LEGACY_AI_QUOTA_BOUNDARY_PROBE).length !== 2) {
    fail('reviewed AI verifier quota-boundary source drift');
  }
  if (source.split(LEGACY_AI_PROVIDER_AUTHORITY_SAMPLE).length !== 2) {
    fail('reviewed AI verifier provider-authority source drift');
  }
  return source
    .replace(LEGACY_AI_QUOTA_BOUNDARY_PROBE, REVIEWED_AI_QUOTA_BOUNDARY_PROBE)
    .replace(LEGACY_AI_PROVIDER_AUTHORITY_SAMPLE, REVIEWED_AI_PROVIDER_AUTHORITY_SAMPLE);
}

export function assertReviewedApplicationPreparationSource(source) {
  if (gitBlobSha(source) !== REVIEWED_APPLICATION_PREPARATION_BLOB) {
    fail('unreviewed Tenant notification preparation');
  }
}

function applicationVerifierState(releaseRoot) {
  const file = path.join(releaseRoot, APPLICATION_VERIFIER);
  if (!lstatSync(file).isFile()) fail('frozen application verifier is not a regular file');
  const source = readFileSync(file, 'utf8');
  const committed = execFileSync('git', ['show', `HEAD:${APPLICATION_VERIFIER}`], { cwd: releaseRoot, encoding: 'utf8' });
  if (source === committed) return { file, source, state: 'frozen' };
  if (gitBlobSha(source) === REVIEWED_APPLICATION_VERIFIER_BLOB) return { file, source, state: 'reviewed' };
  fail('application verifier has unreviewed working-tree changes');
}

function installReviewedActivationAdapter(releaseRoot) {
  const { file, source, state } = applicationVerifierState(releaseRoot);
  const adapted = transformFrozenActivationVerifier(source);
  writeFileSync(file, adapted);
  console.log(`[frozen-release-evidence] reviewed activation-policy adapter state=${state} sha256=${createHash('sha256').update(adapted).digest('hex')}`);
  return () => writeFileSync(file, source);
}

function installReviewedTenantPhotoAdapter(releaseRoot) {
  const { file, source, state } = applicationVerifierState(releaseRoot);
  if (state === 'reviewed') {
    console.log(`[frozen-release-evidence] reviewed application verifier already present sha256=${createHash('sha256').update(source).digest('hex')}`);
    return () => {};
  }
  const adapted = transformFrozenTenantPhotoVerifier(source);
  writeFileSync(file, adapted);
  console.log(`[frozen-release-evidence] reviewed Tenant photo adapter sha256=${createHash('sha256').update(adapted).digest('hex')}`);
  return () => writeFileSync(file, source);
}

function installReviewedBrokerPaymentAdapter(releaseRoot) {
  const { file, source, state } = applicationVerifierState(releaseRoot);
  const adapted = transformFrozenBrokerPaymentVerifier(source);
  writeFileSync(file, adapted);
  console.log(`[frozen-release-evidence] reviewed broker payment adapter state=${state} sha256=${createHash('sha256').update(adapted).digest('hex')}`);
  return () => writeFileSync(file, source);
}

function assertReviewedAiVerifier(releaseRoot) {
  const file = path.join(releaseRoot, AI_VERIFIER);
  if (!lstatSync(file).isFile()) fail('reviewed AI verifier is not a regular file');
  const source = readFileSync(file);
  assertReviewedAiVerifierSource(source);
  console.log(`[frozen-release-evidence] reviewed isolated AI verifier sha256=${createHash('sha256').update(source).digest('hex')}`);
}

function installReviewedAiQuotaBoundaryAdapter(releaseRoot) {
  const file = path.join(releaseRoot, AI_VERIFIER);
  if (!lstatSync(file).isFile()) fail('reviewed AI verifier is not a regular file');
  const original = readFileSync(file, 'utf8');
  const adapted = transformReviewedAiVerifierQuotaBoundary(original);
  writeFileSync(file, adapted);
  console.log(`[frozen-release-evidence] reviewed AI quota-boundary adapter sha256=${createHash('sha256').update(adapted).digest('hex')}`);
  return () => writeFileSync(file, original);
}

function assertReviewedApplicationPreparation(releaseRoot) {
  const file = path.join(releaseRoot, APPLICATION_PREPARATION);
  if (!lstatSync(file).isFile()) fail('reviewed Tenant notification preparation is not a regular file');
  const source = readFileSync(file);
  assertReviewedApplicationPreparationSource(source);
  console.log(`[frozen-release-evidence] reviewed Tenant notification preparation sha256=${createHash('sha256').update(source).digest('hex')}`);
}

export function validateFrozenReleaseEvidenceContext(env, releaseRoot, entrypoint) {
  if (env.GITHUB_ACTIONS !== 'true') fail('GitHub Actions is required');
  if (env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY) fail('repository mismatch');
  if (env.GITHUB_REF !== 'refs/heads/main') fail('refs/heads/main is required');

  const controlPlaneSha = String(env.CONTROL_PLANE_COMMIT_SHA || '').trim();
  const releaseSha = String(env.PRODUCTION_RELEASE_SHA || '').trim();
  const deployRunId = String(env.PRODUCTION_DEPLOY_RUN_ID || '').trim();
  if (!SHA_RE.test(controlPlaneSha) || env.GITHUB_SHA !== controlPlaneSha) {
    fail('control-plane SHA must equal the protected workflow GITHUB_SHA');
  }
  if (!SHA_RE.test(releaseSha)) fail('frozen production release SHA is invalid');
  if (!RUN_ID_RE.test(deployRunId)) fail('production deploy run ID must be numeric');
  if (env.CONTROL_PLANE_SCOPE_VERIFIED !== 'true') fail('control-plane scope was not verified');

  const context = `${env.GITHUB_WORKFLOW || ''}/${env.GITHUB_JOB || ''}`;
  if (!ALLOWED_ENTRYPOINTS[context]?.has(entrypoint)) fail('entrypoint is not authorized for this protected job');

  const checkedOutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: releaseRoot,
    encoding: 'utf8',
  }).trim();
  if (checkedOutSha !== releaseSha) fail('checked-out release does not equal the frozen production release SHA');

  let deployment;
  try {
    deployment = JSON.parse(readFileSync(path.join(releaseRoot, 'launch_package/production-deployment.json'), 'utf8'));
  } catch (error) {
    fail(`production deployment metadata is unavailable: ${error.message}`);
  }
  if (deployment.status !== 'passed' || deployment.projectId !== PRODUCTION_PROJECT_ID) fail('production deployment status/project mismatch');
  if (deployment.deployedCommitSha !== releaseSha) fail('production deployment release SHA mismatch');
  if (String(deployment.workflowRunId || '') !== deployRunId) fail('production deployment run ID mismatch');
  if (deployment.workflowRef !== 'refs/heads/main' || deployment.repository !== EXPECTED_REPOSITORY) fail('production deployment repository/ref mismatch');
  if (!DIGEST_RE.test(String(deployment.validatedArtifactDigest || '').toLowerCase())) fail('production deployment digest is invalid');
  const deployedAt = Date.parse(String(deployment.deployedAt || ''));
  if (!Number.isFinite(deployedAt) || deployedAt > Date.now() + 5 * 60 * 1000) fail('production deployment timestamp is invalid');
  if (Date.now() - deployedAt > 7 * 24 * 60 * 60 * 1000) fail('production deployment is older than seven days');

  return { controlPlaneSha, releaseSha };
}

export function runFrozenReleaseEvidence(entrypoint, env = process.env, releaseRoot = process.cwd()) {
  const { controlPlaneSha, releaseSha } = validateFrozenReleaseEvidenceContext(env, releaseRoot, entrypoint);
  const applicationVerification = env.GITHUB_WORKFLOW === 'Operational Application Evidence'
    && env.GITHUB_JOB === 'verify-and-publish'
    && entrypoint === 'scripts/verify-operational-application-evidence-mfa.mjs';
  const applicationPreparation = env.GITHUB_WORKFLOW === 'Operational Application Evidence'
    && env.GITHUB_JOB === 'verify-and-publish'
    && entrypoint === APPLICATION_PREPARATION;
  const aiVerification = env.GITHUB_WORKFLOW === 'Operational Provider Evidence'
    && env.GITHUB_JOB === 'verify-and-publish'
    && entrypoint === AI_VERIFIER;

  if (applicationVerification) assertApplicationEvidenceCredentials(env.OPERATIONAL_GATE, env);
  if (applicationPreparation) {
    if (env.APPLICATION_PREPARATION_MODE !== 'cleanup-staff') {
      assertApplicationPreparationCredentials(env.OPERATIONAL_GATE, env);
    }
    assertReviewedApplicationPreparation(releaseRoot);
  }
  if (aiVerification) assertReviewedAiVerifier(releaseRoot);

  const restores = [];
  if (applicationVerification && env.OPERATIONAL_GATE === 'ownerPaymentActivation') {
    restores.push(installReviewedActivationAdapter(releaseRoot));
  }
  if (applicationVerification && env.OPERATIONAL_GATE === 'tenantNotificationDelivery') {
    restores.push(installReviewedTenantPhotoAdapter(releaseRoot));
  }
  if (aiVerification) {
    restores.push(installReviewedAiQuotaBoundaryAdapter(releaseRoot));
  }
  const childActor = applicationVerification || applicationPreparation
    ? resolveApplicationEvidenceActor(env)
    : String(env.GITHUB_ACTOR || '');
  try {
    const result = spawnSync(process.execPath, [path.resolve(releaseRoot, entrypoint)], {
      cwd: releaseRoot,
      env: {
        ...env,
        GITHUB_SHA: releaseSha,
        CLEARANCE_CONTROL_PLANE_SHA: controlPlaneSha,
        ...((applicationVerification || applicationPreparation) && childActor ? { GITHUB_ACTOR: childActor } : {}),
      },
      stdio: 'inherit',
    });
    if (result.error) fail(`could not start ${entrypoint}: ${result.error.message}`);
    if (result.signal) fail(`${entrypoint} terminated by signal ${result.signal}`);
    return Number.isInteger(result.status) ? result.status : 1;
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entrypoint = String(process.argv[2] || '').trim();
  if (!entrypoint || process.argv.length !== 3) fail('exactly one authorized evidence entrypoint is required');
  process.exitCode = runFrozenReleaseEvidence(entrypoint);
}