#!/usr/bin/env node

import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';

const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const WORKFLOW = 'Operational Application Evidence';
const JOB = 'verify-and-publish';
const PROOF_PATH = 'launch_package/application-proof.json';
const PROVENANCE_PATH = 'launch_package/application-provenance.json';
const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = (message) => {
  console.error(`[bind-application-provenance] FAIL — ${message}`);
  process.exit(1);
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('binder may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') fail('binder requires protected main');
if (process.env.GITHUB_WORKFLOW !== WORKFLOW || process.env.GITHUB_JOB !== JOB) fail('unexpected protected workflow context');
try { requireAuthorizedApprover(process.env.GITHUB_ACTOR); } catch (error) { fail(error.message); }

const gate = text(process.env.OPERATIONAL_GATE);
const commitSha = text(process.env.GITHUB_SHA);
const workflowRunId = text(process.env.GITHUB_RUN_ID);
const productionDeployRunId = text(process.env.PRODUCTION_DEPLOY_RUN_ID);
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(workflowRunId) || !/^\d+$/.test(productionDeployRunId)) {
  fail('exact commit and numeric workflow/deployment run IDs are required');
}

let proof;
let provenance;
try { proof = JSON.parse(readFileSync(PROOF_PATH, 'utf8')); }
catch (error) { fail(`${PROOF_PATH} is malformed: ${error.message}`); }
try { provenance = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8')); }
catch (error) { fail(`${PROVENANCE_PATH} is malformed: ${error.message}`); }

if (proof.status !== 'passed' || proof.gate !== gate || proof.commitSha !== commitSha || text(proof.workflowRunId) !== workflowRunId) {
  fail('application proof envelope is not bound to this workflow execution');
}
if (
  provenance.status !== 'passed' ||
  provenance.gate !== gate ||
  provenance.commitSha !== commitSha ||
  text(provenance.workflowRunId) !== workflowRunId ||
  text(provenance.productionDeployRunId) !== productionDeployRunId
) {
  fail('deployment provenance envelope is not bound to this workflow execution');
}
if (!proof.evidence || typeof proof.evidence !== 'object') fail('application proof evidence is missing');

let semanticHash = '';
if (gate === 'ownerPaymentActivation' || gate === 'paymentUnlockExactlyOnce') {
  semanticHash = sha256(text(proof.evidence.paymentId));
} else if (gate === 'tenantNotificationDelivery') {
  semanticHash = sha256(text(proof.evidence.notificationId));
} else if (gate === 'brokerCommissionLockExactlyOnce') {
  semanticHash = sha256(text(proof.evidence.commissionId));
} else if (gate === 'adminStaffClaims') {
  semanticHash = text(proof.evidence.staffUidHash).toLowerCase();
} else if (gate === 'renewalScheduler') {
  semanticHash = sha256(text(proof.evidence.watchId));
} else {
  fail(`unsupported application gate: ${gate || '(missing)'}`);
}
if (!/^[a-f0-9]{64}$/.test(semanticHash)) fail('application proof semantic identity is missing or invalid');
if (semanticHash !== text(provenance.subjectHash).toLowerCase()) fail('application proof selected a different production record than the deployment provenance verifier');

const selectedObservedAt = Date.parse(text(provenance.selectedObservedAt));
const productionDeployedAt = Date.parse(text(provenance.productionDeployedAt));
const proofObservedAt = Date.parse(text(proof.observedAt));
if (![selectedObservedAt, productionDeployedAt, proofObservedAt].every(Number.isFinite)) fail('proof or provenance timestamps are invalid');
if (selectedObservedAt < productionDeployedAt) fail('selected production record predates the exact deployment');
if (proofObservedAt < selectedObservedAt) fail('application proof was observed before its selected production record');
if (!/^sha256:[a-f0-9]{64}$/.test(text(provenance.deploymentArtifactDigest).toLowerCase())) fail('deployment artifact digest is invalid');

proof.evidence.deploymentProvenance = {
  productionDeployRunId,
  productionDeployedAt: text(provenance.productionDeployedAt),
  deploymentArtifactDigest: text(provenance.deploymentArtifactDigest).toLowerCase(),
  subjectKind: text(provenance.subjectKind),
  subjectHash: semanticHash,
  selectedObservedAt: text(provenance.selectedObservedAt),
  releaseBindingPresent: provenance.releaseBindingPresent === true,
};
writeFileSync(PROOF_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[bind-application-provenance] PASS gate=${gate} deployRun=${productionDeployRunId}`);
