#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { PRODUCTION, sha256File } from './lib/launch-honesty.mjs';
import { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_WORKFLOW = 'Operational Provider Evidence';
const EXPECTED_JOB = 'verify-and-publish';
const BRANDED_FROM = 'BIN GROUP <ceo@bin-groups.com>';
const BRANDED_REPLY_TO = 'BIN GROUP Admin <ceo@bin-groups.com>';

const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => {
  console.error(`[operational-provider-evidence] FAIL — ${message}`);
  process.exit(1);
};
const validTime = (value) => {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
};

const manifests = {
  brandedEmailDelivery: {
    path: 'launch_package/smtp-live-proof.json',
    evidenceType: 'production-transaction',
    sourceSystem: 'Firebase Cloud Functions SMTP',
    reference: (proof) => `firestore://system_health/mail/${proof.mailId}#${proof.providerMessageId}`,
    sourceProof: (proof) => ({
      source: proof.source,
      mailId: proof.mailId,
      providerMessageId: proof.providerMessageId,
      from: proof.from,
      replyTo: proof.replyTo,
      acceptedCount: proof.acceptedCount,
      rejectedCount: proof.rejectedCount,
      deliveryState: proof.deliveryState,
      observedAt: proof.observedAt,
    }),
    validate: (proof, context) => {
      const errors = [];
      if (proof.schemaVersion !== 1 || proof.status !== 'passed') errors.push('SMTP proof must be schemaVersion 1 and passed');
      if (proof.source !== 'cloud-function-smtp-live-verifier') errors.push('SMTP proof source mismatch');
      if (proof.commitSha !== context.commitSha || proof.projectId !== PRODUCTION.projectId) errors.push('SMTP proof commit/project mismatch');
      if (text(proof.workflowRunId) !== context.runId) errors.push('SMTP proof workflow run mismatch');
      if (proof.deliveryState !== 'SUCCESS' || !text(proof.providerMessageId)) errors.push('SMTP provider delivery is not successful');
      if (proof.from !== BRANDED_FROM || proof.replyTo !== BRANDED_REPLY_TO) errors.push('SMTP branded sender identity mismatch');
      if (Number(proof.acceptedCount || 0) < 1 || Number(proof.rejectedCount || 0) !== 0) errors.push('SMTP recipient acceptance proof invalid');
      if (!validTime(proof.observedAt)) errors.push('SMTP observedAt invalid');
      return errors;
    },
  },
  stripeLiveBilling: {
    path: 'launch_package/stripe-live-proof.json',
    evidenceType: 'production-transaction',
    sourceSystem: 'Stripe API and Firebase stripeWebhook',
    reference: (proof) => `stripe://events/${proof.webhookEventId}#checkout=${proof.checkoutSessionId}`,
    sourceProof: (proof) => ({
      source: proof.source,
      checkoutSessionId: proof.checkoutSessionId,
      webhookEventId: proof.webhookEventId,
      paymentIntentId: proof.paymentIntentId,
      amountMinor: proof.amountMinor,
      currency: proof.currency,
      webhookAttemptsBeforeReplay: proof.webhookAttemptsBeforeReplay,
      webhookAttemptsAfterReplay: proof.webhookAttemptsAfterReplay,
      replayHttpStatus: proof.replayHttpStatus,
      replayDuplicate: proof.replayDuplicate,
      duplicateReplaySafe: proof.duplicateReplaySafe,
      observedAt: proof.observedAt,
    }),
    validate: (proof, context) => {
      const errors = [];
      if (proof.schemaVersion !== 1 || proof.status !== 'passed') errors.push('Stripe proof must be schemaVersion 1 and passed');
      if (proof.source !== 'stripe-api-live-verifier' || proof.liveMode !== true) errors.push('Stripe live source/mode mismatch');
      if (proof.commitSha !== context.commitSha || proof.repository !== EXPECTED_REPOSITORY) errors.push('Stripe proof commit/repository mismatch');
      if (text(proof.workflowRunId) !== context.runId) errors.push('Stripe proof workflow run mismatch');
      if (proof.webhookProcessed !== true || proof.currency !== 'AED' || Number(proof.amountMinor || 0) <= 0) errors.push('Stripe payment/webhook proof invalid');
      if (proof.duplicateReplaySafe !== true || proof.replayDuplicate !== true || Number(proof.replayHttpStatus) !== 200) errors.push('Stripe duplicate replay was not safely acknowledged');
      if (Number(proof.webhookAttemptsBeforeReplay) !== 1 || Number(proof.webhookAttemptsAfterReplay) !== 1) errors.push('Stripe event was not processed exactly once');
      if (!validTime(proof.observedAt)) errors.push('Stripe observedAt invalid');
      return errors;
    },
  },
  appCheckEnforcement: {
    path: 'launch_package/appcheck-enforcement-proof.json',
    evidenceType: 'workflow-artifact',
    sourceSystem: 'Firebase App Check and Firestore REST',
    reference: (proof) => `firebase-app-check://projects/${proof.projectId}/apps/${proof.appId}#firestore-enforcement`,
    sourceProof: (proof) => ({
      source: proof.source,
      appId: proof.appId,
      service: proof.service,
      invalidTokenStatus: proof.invalidTokenStatus,
      invalidTokenRejected: proof.invalidTokenRejected,
      validTokenStatus: proof.validTokenStatus,
      validTokenAccepted: proof.validTokenAccepted,
      authenticatedUidHash: proof.authenticatedUidHash,
      observedAt: proof.observedAt,
    }),
    validate: (proof, context) => {
      const errors = [];
      if (proof.schemaVersion !== 1 || proof.status !== 'passed') errors.push('App Check proof must be schemaVersion 1 and passed');
      if (proof.source !== 'firebase-appcheck-enforcement-verifier') errors.push('App Check proof source mismatch');
      if (proof.commitSha !== context.commitSha || proof.projectId !== PRODUCTION.projectId) errors.push('App Check proof commit/project mismatch');
      if (text(proof.workflowRunId) !== context.runId) errors.push('App Check proof workflow run mismatch');
      if (proof.service !== 'cloud-firestore') errors.push('App Check service must be Cloud Firestore');
      if (proof.invalidTokenRejected !== true || ![401, 403].includes(Number(proof.invalidTokenStatus))) errors.push('Invalid App Check token was not rejected');
      if (proof.validTokenAccepted !== true || Number(proof.validTokenStatus) !== 200) errors.push('Valid App Check token was not accepted');
      if (!/^[a-f0-9]{64}$/.test(text(proof.authenticatedUidHash))) errors.push('Authenticated UID hash invalid');
      if (!validTime(proof.observedAt)) errors.push('App Check observedAt invalid');
      return errors;
    },
  },
  aiProviderHealth: {
    path: 'launch_package/ai-provider-health-proof.json',
    evidenceType: 'workflow-artifact',
    sourceSystem: 'Firebase Sovereign AI callable with Gemini and OpenAI',
    reference: (proof) => `firebase-ai://projects/${proof.projectId}/locations/${proof.functionRegion}/functions/${proof.functionName}#gemini-openai`,
    sourceProof: (proof) => ({
      source: proof.source,
      productionDeployRunId: proof.productionDeployRunId,
      validatedArtifactDigest: proof.validatedArtifactDigest,
      functionName: proof.functionName,
      functionRegion: proof.functionRegion,
      authenticatedUidHash: proof.authenticatedUidHash,
      appCheck: proof.appCheck,
      providers: proof.providers,
      privacy: proof.privacy,
      authorityBoundary: proof.authorityBoundary,
      quota: proof.quota,
      slo: proof.slo,
      tokenAndCostControls: proof.tokenAndCostControls,
      observedAt: proof.observedAt,
    }),
    validate: (proof, context) => {
      const errors = [];
      if (proof.schemaVersion !== 1 || proof.status !== 'passed') errors.push('AI proof must be schemaVersion 1 and passed');
      if (proof.source !== 'sovereign-ai-live-verifier') errors.push('AI proof source mismatch');
      if (proof.commitSha !== context.commitSha || proof.projectId !== PRODUCTION.projectId) errors.push('AI proof commit/project mismatch');
      if (text(proof.workflowRunId) !== context.runId) errors.push('AI proof workflow run mismatch');
      if (!/^\d+$/.test(text(proof.productionDeployRunId))) errors.push('AI proof production deployment run ID invalid');
      if (!/^sha256:[a-f0-9]{64}$/.test(text(proof.validatedArtifactDigest).toLowerCase())) errors.push('AI proof deployment digest invalid');
      if (proof.functionName !== 'runSovereignAI' || proof.functionRegion !== 'europe-west3') errors.push('AI function identity mismatch');
      if (!/^[a-f0-9]{64}$/.test(text(proof.authenticatedUidHash))) errors.push('AI authenticated UID hash invalid');
      if (proof.appCheck?.invalidTokenRejected !== true || proof.appCheck?.validTokenAccepted !== true) errors.push('AI App Check acceptance/rejection proof invalid');
      for (const provider of ['gemini', 'openai']) {
        const sample = proof.providers?.[provider] || {};
        if (sample.provider !== provider || !text(sample.model)) errors.push(`${provider} live provider/model proof invalid`);
        if (Number(sample.providerLatencyMs) > 20000 || Number(sample.roundTripMs) > 30000) errors.push(`${provider} latency SLO invalid`);
        if (sample.advisoryOnly !== true || sample.clientContextAuthoritative !== false) errors.push(`${provider} authority boundary invalid`);
      }
      if (proof.privacy?.comprehensiveFreeTextRedactionVerified !== true || proof.privacy?.nestedInnocentKeyRedactionVerified !== true || proof.privacy?.protectedValuesNotEchoed !== true) errors.push('AI privacy proof invalid');
      if (Number(proof.privacy?.minimumRedactionsObserved || 0) < 4) errors.push('AI privacy proof did not observe enough redactions');
      if (proof.authorityBoundary?.advisoryOnly !== true || proof.authorityBoundary?.clientContextAuthoritative !== false || proof.authorityBoundary?.operationalApprovalsDelegatedToAi !== false) errors.push('AI authority boundary proof invalid');
      if (proof.quota?.providerSuccessChargesVerified !== true || proof.quota?.boundaryRejected !== true || proof.quota?.rejectedAttemptUncharged !== true || proof.quota?.reservationsCleared !== true || proof.quota?.originalUsageRestored !== true) errors.push('AI quota proof invalid');
      if (Number(proof.quota?.exactBoundary) !== 50) errors.push('AI quota boundary mismatch');
      const observed = proof.slo?.observed || {};
      const thresholds = proof.slo?.thresholds || {};
      if (proof.slo?.passed !== true) errors.push('AI SLO proof not passed');
      if (Number(observed.providerSuccessRate) < Number(thresholds.minProviderSuccessRate)) errors.push('AI provider success rate below SLO');
      if (Number(observed.fallbackRate) > Number(thresholds.maxFallbackRate)) errors.push('AI fallback rate above SLO');
      if (Number(observed.invalidOutputRate) > Number(thresholds.maxInvalidOutputRate)) errors.push('AI invalid-output rate above SLO');
      if (Number(observed.functionErrorRate) > Number(thresholds.maxFunctionErrorRate)) errors.push('AI function-error rate above SLO');
      if (Number(observed.maxProviderLatencyMs) > Number(thresholds.maxProviderLatencyMs)) errors.push('AI provider latency above SLO');
      if (Number(observed.maxRoundTripMs) > Number(thresholds.maxRoundTripMs)) errors.push('AI round-trip latency above SLO');
      if (Number(proof.tokenAndCostControls?.maxOutputTokensPerProviderResponse) !== 700 || Number(proof.tokenAndCostControls?.dailyChatRequestsPerUser) !== 50 || Number(proof.tokenAndCostControls?.dailyTotalAiUnitsPerUser) !== 75) errors.push('AI token/cost controls invalid');
      if (proof.tokenAndCostControls?.aggregateTelemetryCollection !== 'ai_health_daily') errors.push('AI aggregate telemetry binding invalid');
      if (!validTime(proof.observedAt)) errors.push('AI observedAt invalid');
      return errors;
    },
  },
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('publisher may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY) fail('unexpected repository');
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('publisher requires refs/heads/main');
if (process.env.GITHUB_WORKFLOW !== EXPECTED_WORKFLOW || process.env.GITHUB_JOB !== EXPECTED_JOB) fail('publisher requires the protected provider evidence job');
try { requireAuthorizedApprover(process.env.GITHUB_ACTOR); } catch (error) { fail(error.message); }

const gate = text(process.env.OPERATIONAL_GATE);
const manifest = manifests[gate];
if (!manifest) fail(`unsupported operational gate: ${gate || '(missing)'}`);
const commitSha = text(process.env.GITHUB_SHA);
const runId = text(process.env.GITHUB_RUN_ID);
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(runId)) fail('exact commit SHA and numeric workflow run ID are required');

const proofPath = path.resolve(manifest.path);
let proof;
try { proof = JSON.parse(readFileSync(proofPath, 'utf8')); }
catch (error) { fail(`${manifest.path} missing or malformed: ${error.message}`); }

const context = { commitSha, runId };
const errors = manifest.validate(proof, context);
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  fail(`${gate} proof validation failed`);
}

const observedAt = validTime(proof.observedAt);
if (!observedAt) fail('proof observedAt is invalid');
const artifactHash = sha256File(proofPath);
const sourceProofHash = sha256(JSON.stringify(manifest.sourceProof(proof)));
const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PRODUCTION.projectId) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);

const record = {
  status: 'passed',
  commitSha,
  projectId,
  evidenceType: manifest.evidenceType,
  evidenceReference: manifest.reference(proof),
  artifactHash,
  sourceProofHash,
  sourceSystem: manifest.sourceSystem,
  observedAt: admin.firestore.Timestamp.fromDate(observedAt),
  sourceWorkflowRunId: runId,
  workflowRunId: runId,
  verifiedBy: 'workflow',
  verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
};

const ref = admin.firestore().doc('system_health/admin_summaries');
await admin.firestore().runTransaction(async (transaction) => {
  const snapshot = await transaction.get(ref);
  const current = snapshot.data() || {};
  transaction.set(ref, {
    operationalEvidence: {
      ...(current.operationalEvidence && typeof current.operationalEvidence === 'object' ? current.operationalEvidence : {}),
      [gate]: record,
    },
    operationalEvidenceCommitSha: commitSha,
    operationalEvidenceProjectId: projectId,
    operationalEvidenceLastWorkflowRunId: runId,
    operationalEvidenceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
});

console.log(`[operational-provider-evidence] PASS gate=${gate} artifact=${artifactHash.slice(0, 12)}… source=${sourceProofHash.slice(0, 12)}…`);
