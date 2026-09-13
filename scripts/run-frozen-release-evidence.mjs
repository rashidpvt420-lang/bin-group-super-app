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
const SHA_RE = /^[0-9a-f]{40}$/;
const RUN_ID_RE = /^\d+$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

const ALLOWED_ENTRYPOINTS = Object.freeze({
  'Operational Application Evidence/verify-and-publish': new Set([
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
const LEGACY_ACTIVATION_CHECK = [
  '  const annual = Number(payment.data.quoteSnapshot?.annualContractValue || contract.quoteSnapshot?.annualContractValue || contract.annualContractValue || 0);',
  '  const amount = Number(payment.data.amountReceived || payment.data.quoteSnapshot?.activationDeposit || payment.data.amount || 0);',
  "  if (!Number.isFinite(annual) || annual <= 0 || !Number.isFinite(amount) || Math.abs(amount - Math.round(annual * 0.15)) > 0.01) fail('activation amount is not the locked 15% deposit');",
].join('\n');

// The frozen AI verifier was written while the E2E Admin existed, but that
// account is intentionally retired after protected business evidence. The AI
// callable permits forced provider probes only for an admin-class role, and
// the canonical Founder is an approved admin-class production role. Adapt the
// disposable verifier checkout to that canonical principal without ever
// changing E2E_ADMIN_EMAIL or the E2E Admin lifecycle contract.
const AI_VERIFIER = 'scripts/verify-ai-live-evidence.mjs';
const FROZEN_AI_VERIFIER_BLOB = '6964c56352d6b50450c01bbc6e0d066c889c05e3';
const FROZEN_AI_ADMIN_BINDING = 'const adminEmail = text(process.env.E2E_ADMIN_EMAIL).toLowerCase();';
const FROZEN_AI_FOUNDER_BINDING = `const adminEmail = '${CANONICAL_FOUNDER_EMAIL}';`;

export function assertApplicationEvidenceCredentials(gate, env = process.env) {
  if (!['all', 'paymentUnlockExactlyOnce', 'brokerCommissionLockExactlyOnce'].includes(gate)) return;
  const required = ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'E2E_FOUNDER_TOTP_SECRET', 'VITE_FIREBASE_API_KEY'];
  const missing = required.filter((name) => !String(env[name] ?? '').trim());
  if (missing.length) fail(`missing protected application evidence bindings: ${missing.join(', ')}`);
  if (String(env.E2E_FOUNDER_EMAIL).trim().toLowerCase() !== CANONICAL_FOUNDER_EMAIL) {
    fail('application replay requires the canonical Founder identity');
  }
}

export function assertAiEvidenceIdentitySeparation(env = process.env) {
  const configuredE2eAdmin = String(env.E2E_ADMIN_EMAIL || '').trim().toLowerCase();
  if (configuredE2eAdmin === CANONICAL_FOUNDER_EMAIL) {
    fail('AI evidence refuses to alias E2E_ADMIN_EMAIL to the canonical Founder');
  }
}

function gitBlobSha(source) {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
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
  // A quoted deposit is not a receipt. Explicit zero/null/blank receipt values
  // must fail instead of falling back to a quote or another receipt field.
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

export function transformFrozenAiVerifier(source) {
  if (source.split(FROZEN_AI_ADMIN_BINDING).length !== 2) {
    fail('frozen AI verifier source drift; exact E2E Admin binding is required');
  }
  return source.replace(FROZEN_AI_ADMIN_BINDING, FROZEN_AI_FOUNDER_BINDING);
}

function installReviewedActivationAdapter(releaseRoot) {
  const file = path.join(releaseRoot, APPLICATION_VERIFIER);
  if (!lstatSync(file).isFile()) fail('frozen application verifier is not a regular file');
  const original = readFileSync(file, 'utf8');
  const committed = execFileSync('git', ['show', `HEAD:${APPLICATION_VERIFIER}`], { cwd: releaseRoot, encoding: 'utf8' });
  if (original !== committed) fail('frozen application verifier has unreviewed working-tree changes');
  const adapted = transformFrozenActivationVerifier(original);
  writeFileSync(file, adapted);
  console.log(`[frozen-release-evidence] reviewed activation-policy adapter sha256=${createHash('sha256').update(adapted).digest('hex')}`);
  // Adapt only the disposable evidence checkout. No deployment, production
  // record mutation, or change to any other verification condition is allowed.
  return () => writeFileSync(file, original);
}

function installReviewedAiFounderAdapter(releaseRoot) {
  const file = path.join(releaseRoot, AI_VERIFIER);
  if (!lstatSync(file).isFile()) fail('frozen AI verifier is not a regular file');
  const original = readFileSync(file, 'utf8');
  const committed = execFileSync('git', ['show', `HEAD:${AI_VERIFIER}`], { cwd: releaseRoot, encoding: 'utf8' });
  if (original !== committed) fail('frozen AI verifier has unreviewed working-tree changes');
  if (gitBlobSha(original) !== FROZEN_AI_VERIFIER_BLOB) fail('unreviewed frozen AI verifier');
  const adapted = transformFrozenAiVerifier(original);
  writeFileSync(file, adapted);
  console.log(`[frozen-release-evidence] reviewed AI Founder-principal adapter sha256=${createHash('sha256').update(adapted).digest('hex')}`);
  return () => writeFileSync(file, original);
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
  const aiVerification = env.GITHUB_WORKFLOW === 'Operational Provider Evidence'
    && env.GITHUB_JOB === 'verify-and-publish'
    && entrypoint === AI_VERIFIER;

  if (applicationVerification) assertApplicationEvidenceCredentials(env.OPERATIONAL_GATE, env);
  if (aiVerification) assertAiEvidenceIdentitySeparation(env);

  const restores = [];
  if (applicationVerification && env.OPERATIONAL_GATE === 'ownerPaymentActivation') {
    restores.push(installReviewedActivationAdapter(releaseRoot));
  }
  if (aiVerification) restores.push(installReviewedAiFounderAdapter(releaseRoot));

  try {
    const result = spawnSync(process.execPath, [path.resolve(releaseRoot, entrypoint)], {
      cwd: releaseRoot,
      env: {
        ...env,
        GITHUB_SHA: releaseSha,
        CLEARANCE_CONTROL_PLANE_SHA: controlPlaneSha,
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
