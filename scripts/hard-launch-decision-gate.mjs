#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DECISION_KIND,
  HARD_LAUNCH_CONTROL_SCHEMA,
  readJsonStrict,
  sha256File,
  signDocument,
  validateAuthorizationDocument,
  validateDeploymentMetadata,
  validateIncidentDocument,
} from './lib/hard-launch-control.mjs';
import {
  PRODUCTION,
  REQUIRED_PILOT_EVIDENCE,
  evaluatePilotEligibility,
} from './lib/launch-honesty.mjs';
import {
  validatePilotIncidentReport,
} from './lib/hard-launch-gate.mjs';

const failures = [];

function requiredContext(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) failures.push(`${name} is required`);
  return value;
}

const workflowActor = requiredContext('GITHUB_ACTOR');
const authorizationActor = String(process.env.AUTHORIZATION_ACTOR || workflowActor).trim();

const context = {
  commitSha: requiredContext('GITHUB_SHA'),
  ref: requiredContext('GITHUB_REF'),
  repository: requiredContext('GITHUB_REPOSITORY'),
  runId: requiredContext('GITHUB_RUN_ID'),
  actor: authorizationActor,
  authorizedActors: requiredContext('AUTHORIZED_FOUNDER_ACTORS'),
  authorizedEmails: requiredContext('AUTHORIZED_FOUNDER_EMAILS'),
  hmacKey: requiredContext('HARD_LAUNCH_APPROVAL_HMAC_KEY'),
};

const paths = {
  authorization: path.resolve('launch_package/hard-launch-authorization.json'),
  incidents: path.resolve('launch_package/production-incidents.json'),
  deployment: path.resolve('launch_package/production-deployment.json'),
  evidence: path.resolve('launch_package/launch-evidence-batch.json'),
  launchStatus: path.resolve('launch_package/launch-status.json'),
  publicReleaseStatus: path.resolve('launch_package/public-release-status.json'),
  stripeLiveProof: path.resolve('launch_package/stripe-live-proof.json'),
  phase1ManualPaymentProof: path.resolve('launch_package/phase1-manual-payment-proof.json'),
  pilotIncidentReport: path.resolve('launch_package/pilot-incident-report.json'),
  decision: path.resolve('launch_package/hard-launch-decision.json'),
};

let authorization;
let incidents;
let deployment;
let evidence;
let launchStatus;

try {
  authorization = readJsonStrict(paths.authorization, 'hard-launch-authorization.json');
  failures.push(...validateAuthorizationDocument(authorization, context));
  if (authorization.workflowActor && String(authorization.workflowActor).toLowerCase() !== workflowActor.toLowerCase()) {
    failures.push('authorization workflow actor mismatch');
  }
} catch (error) {
  failures.push(error.message);
}

try {
  incidents = readJsonStrict(paths.incidents, 'production-incidents.json');
  failures.push(...validateIncidentDocument(incidents));
} catch (error) {
  failures.push(error.message);
}

try {
  deployment = readJsonStrict(paths.deployment, 'production-deployment.json');
  failures.push(...validateDeploymentMetadata(deployment, context));
} catch (error) {
  failures.push(error.message);
}

try {
  evidence = readJsonStrict(paths.evidence, 'launch-evidence-batch.json');
} catch (error) {
  failures.push(error.message);
}

try {
  launchStatus = readJsonStrict(paths.launchStatus, 'launch-status.json');
  if (launchStatus.commitSha !== context.commitSha) failures.push('launch-status commitSha does not match workflow SHA');
  if (launchStatus.automationOk !== true) failures.push('launch-status automationOk must equal true');
  if (launchStatus.pilotEligible !== true) failures.push('launch-status pilotEligible must equal true');
  if (launchStatus.hardLaunchClaim === true) failures.push('launch-status must not claim hard launch before final decision is written');
} catch (error) {
  failures.push(error.message);
}

if (evidence && deployment) {
  const eligibility = evaluatePilotEligibility({
    evidenceBatch: evidence,
    commitSha: context.commitSha,
    deploymentDoc: deployment,
    root: process.cwd(),
  });
  if (eligibility.pilotEligible !== true) {
    failures.push(...eligibility.missing.map((key) => `missing required live evidence: ${key}`));
    failures.push(...eligibility.invalid.map((reason) => `invalid live evidence: ${reason}`));
  }
}

if (context.ref !== 'refs/heads/main') failures.push('hard-launch decision may only be created from refs/heads/main');
if (!/^[0-9a-f]{40}$/.test(context.commitSha)) failures.push('GITHUB_SHA must be a lowercase 40-character SHA');

const launchMode = String(process.env.LAUNCH_MODE || '').trim().toLowerCase();
if (launchMode !== 'bank-pilot' && launchMode !== 'public') {
  failures.push('LAUNCH_MODE must be bank-pilot or public');
}

let publicReleaseStatus = null;
let stripeLiveProof = null;
let phase1ManualPaymentProof = null;
const paymentPolicy = String(process.env.PAYMENT_POLICY || '').trim().toLowerCase();
if (launchMode === 'public') {
  if (!['phase1-manual', 'phase2-stripe'].includes(paymentPolicy)) failures.push('PAYMENT_POLICY must be phase1-manual or phase2-stripe for public launch');
  try {
    publicReleaseStatus = readJsonStrict(paths.publicReleaseStatus, 'public-release-status.json');
    if (
      publicReleaseStatus.status !== 'passed' || publicReleaseStatus.publicReleaseCleared !== true ||
      publicReleaseStatus.hardLaunchClaim === true || publicReleaseStatus.commitSha !== context.commitSha ||
      String(publicReleaseStatus.releaseId || '') !== `${context.runId}-${process.env.GITHUB_RUN_ATTEMPT}` ||
      publicReleaseStatus.validatedArtifactDigest !== deployment?.validatedArtifactDigest ||
      publicReleaseStatus.paymentPolicy !== paymentPolicy ||
      !Array.isArray(publicReleaseStatus.failures) || publicReleaseStatus.failures.length !== 0
    ) failures.push('public-release-status.json is not a clear, same-run, exact-artifact payment-policy-bound result');
  } catch (error) { failures.push(error.message); }

  if (paymentPolicy === 'phase2-stripe') {
    try {
      stripeLiveProof = readJsonStrict(paths.stripeLiveProof, 'stripe-live-proof.json');
      const proofAgeMs = Date.now() - Date.parse(stripeLiveProof.observedAt || '');
      if (
        stripeLiveProof.status !== 'passed' || stripeLiveProof.source !== 'stripe-api-live-verifier' ||
        stripeLiveProof.liveMode !== true || stripeLiveProof.webhookProcessed !== true ||
        stripeLiveProof.currency !== 'AED' || Number(stripeLiveProof.amountMinor || 0) <= 0 ||
        stripeLiveProof.commitSha !== context.commitSha || stripeLiveProof.repository !== context.repository ||
        String(stripeLiveProof.workflowRunId || '') !== context.runId ||
        stripeLiveProof.releaseId !== `${context.runId}-${process.env.GITHUB_RUN_ATTEMPT}` ||
        stripeLiveProof.validatedArtifactDigest !== deployment?.validatedArtifactDigest ||
        !Number.isFinite(proofAgeMs) || proofAgeMs < 0 || proofAgeMs > 72 * 60 * 60 * 1000 ||
        stripeLiveProof.hardLaunchClaim === true
      ) failures.push('stripe-live-proof.json is stale, non-live, unprocessed, or not bound to this run and artifact');
    } catch (error) { failures.push(error.message); }
  }

  if (paymentPolicy === 'phase1-manual') {
    try {
      phase1ManualPaymentProof = readJsonStrict(paths.phase1ManualPaymentProof, 'phase1-manual-payment-proof.json');
      const proofAgeMs = Date.now() - Date.parse(phase1ManualPaymentProof.observedAt || '');
      if (
        phase1ManualPaymentProof.status !== 'passed' ||
        phase1ManualPaymentProof.source !== 'firebase-production-manual-payment-policy-verifier' ||
        phase1ManualPaymentProof.paymentPolicy !== 'phase1-manual' ||
        phase1ManualPaymentProof.projectId !== PRODUCTION.projectId ||
        phase1ManualPaymentProof.currency !== 'AED' ||
        JSON.stringify(phase1ManualPaymentProof.approvedMethods) !== JSON.stringify(['CASH', 'CHEQUE']) ||
        phase1ManualPaymentProof.bankTransferEnabled !== false || phase1ManualPaymentProof.stripeEnabled !== false ||
        phase1ManualPaymentProof.sensitiveValuesExcluded !== true ||
        !/^[0-9a-f]{64}$/.test(String(phase1ManualPaymentProof.configHash || '')) ||
        !String(phase1ManualPaymentProof.configVersion || '').trim() ||
        phase1ManualPaymentProof.commitSha !== context.commitSha || phase1ManualPaymentProof.repository !== context.repository ||
        String(phase1ManualPaymentProof.workflowRunId || '') !== context.runId ||
        phase1ManualPaymentProof.releaseId !== `${context.runId}-${process.env.GITHUB_RUN_ATTEMPT}` ||
        phase1ManualPaymentProof.validatedArtifactDigest !== deployment?.validatedArtifactDigest ||
        !Number.isFinite(proofAgeMs) || proofAgeMs < 0 || proofAgeMs > 72 * 60 * 60 * 1000 ||
        phase1ManualPaymentProof.hardLaunchClaim === true
      ) failures.push('phase1-manual-payment-proof.json is invalid, stale, or not bound to this run and artifact');
    } catch (error) { failures.push(error.message); }
  }

  try {
    const pilotIncidentReport = readJsonStrict(paths.pilotIncidentReport, 'pilot-incident-report.json');
    failures.push(...validatePilotIncidentReport(pilotIncidentReport, context.commitSha));
  } catch (error) { failures.push(error.message); }
}

const postdeployCleared = publicReleaseStatus?.publicReleaseCleared === true;
const paymentProofOk = paymentPolicy === 'phase1-manual'
  ? phase1ManualPaymentProof?.status === 'passed'
  : paymentPolicy === 'phase2-stripe' && stripeLiveProof?.status === 'passed';

if (failures.length) {
  console.error('\n[hard-launch-decision] FAIL — hard public launch is not approved');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

const evidenceHashes = {
  authorization: sha256File(paths.authorization),
  incidents: sha256File(paths.incidents),
  deployment: sha256File(paths.deployment),
  liveEvidence: sha256File(paths.evidence),
  ...(launchMode === 'public' ? {
    publicReleaseStatus: sha256File(paths.publicReleaseStatus),
    ...(paymentPolicy === 'phase1-manual' ? { phase1ManualPaymentProof: sha256File(paths.phase1ManualPaymentProof) } : {}),
    ...(paymentPolicy === 'phase2-stripe' ? { stripeLiveProof: sha256File(paths.stripeLiveProof) } : {}),
    pilotIncidentReport: sha256File(paths.pilotIncidentReport),
  } : {}),
};

let status = 'recorded';
let hardLaunchClaim = false;
let decisionRule =
  'same-main-commit deployment + live evidence + App Check + clear incidents + signed founder authorization';

if (launchMode === 'bank-pilot') {
  status = 'bank-pilot-no-public-claim';
  hardLaunchClaim = false;
  decisionRule = 'bank-pilot mode records a signed decision without claiming hard public launch';
} else if (launchMode === 'public' && (!postdeployCleared || !paymentProofOk)) {
  status = 'public-awaiting-postdeploy-clearance';
  hardLaunchClaim = false;
  decisionRule =
    'public mode requires postdeploy release clearance and payment-policy-bound production proof before hardLaunchClaim may become true';
} else if (launchMode === 'public' && postdeployCleared && paymentProofOk) {
  status = 'approved';
  hardLaunchClaim = true;
  decisionRule =
    `same-main-commit deployment + live evidence + App Check + clear incidents + signed founder authorization + postdeploy clearance + ${'${paymentPolicy}'} production payment proof`;
}

const payload = {
  schemaVersion: HARD_LAUNCH_CONTROL_SCHEMA,
  kind: DECISION_KIND,
  status,
  hardLaunchClaim,
  launchMode,
  paymentPolicy: launchMode === 'public' ? paymentPolicy : null,
  commitSha: context.commitSha,
  ref: context.ref,
  repository: context.repository,
  workflowRunId: context.runId,
  workflowRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
  approvedByActor: context.actor,
  founder: authorization.founder,
  approvedAt: new Date().toISOString(),
  production: {
    projectId: PRODUCTION.projectId,
    mainUrl: PRODUCTION.mainUrl,
    adminUrl: PRODUCTION.adminUrl,
  },
  requiredEvidence: [...REQUIRED_PILOT_EVIDENCE],
  evidenceHashes,
  decisionRule,
};

const decision = signDocument(payload, context.hmacKey);
mkdirSync(path.dirname(paths.decision), { recursive: true });
writeFileSync(paths.decision, `${JSON.stringify(decision, null, 2)}\n`, { mode: 0o600 });
console.log(`[hard-launch-decision] wrote ${paths.decision}`);
console.log(`[hard-launch-decision] status=${status} commit=${context.commitSha}`);
console.log(`[hard-launch-decision] hardLaunchClaim=${hardLaunchClaim}`);
