#!/usr/bin/env node

/**
 * Idempotent Phase 1 policy validator and generated-workflow producer.
 *
 * Production source remains unchanged in this step. The protected promotion
 * workflow consumes the generated copy and promotes it byte-for-byte only after
 * the source candidate passes its launch regressions.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { patchOwnerEvidenceWorkflow } from './apply-owner-inspection-first-evidence-workflow.mjs';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/firebase-production-deploy.yml');
const decisionPath = path.join(root, 'scripts/hard-launch-decision-gate.mjs');
const generatedPath = path.join(
  root,
  'launch_package/generated/firebase-production-deploy-phase1.yml',
);

const workflow = readFileSync(workflowPath, 'utf8');
const generatedWorkflow = patchOwnerEvidenceWorkflow(workflow, workflowPath);
const decision = readFileSync(decisionPath, 'utf8');

const requiredWorkflowBindings = [
  'payment_policy:',
  'phase1-manual',
  'phase2-stripe',
  'Verify Phase 1 manual Cash/Cheque production policy',
  'phase1-manual-payment-proof.json',
  'E2E_FOUNDER_EMAIL: ${{ secrets.E2E_FOUNDER_EMAIL }}',
  'E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}',
  'E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}',
  "E2E_REQUIRE_FOUNDER_MFA: 'true'",
];

for (const binding of requiredWorkflowBindings) {
  if (!generatedWorkflow.includes(binding)) {
    throw new Error(`Phase 1 production workflow binding missing: ${binding}`);
  }
}

for (const binding of [
  'E2E_FOUNDER_EMAIL: ${{ secrets.E2E_FOUNDER_EMAIL }}',
  'E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}',
  'E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}',
  "E2E_REQUIRE_FOUNDER_MFA: 'true'",
]) {
  const count = generatedWorkflow.split(binding).length - 1;
  if (count !== 2) throw new Error(`Phase 1 production workflow must contain exactly two ${binding} bindings; found ${count}.`);
}

const requiredDecisionBindings = [
  "const paymentProofOk = paymentPolicy === 'phase1-manual'",
  "paymentPolicy === 'phase2-stripe' && stripeLiveProof?.status === 'passed'",
  "launchMode === 'public' && postdeployCleared && paymentProofOk",
];

for (const binding of requiredDecisionBindings) {
  if (!decision.includes(binding)) {
    throw new Error(`Phase 1 hard-launch decision binding missing: ${binding}`);
  }
}

mkdirSync(path.dirname(generatedPath), { recursive: true });
writeFileSync(generatedPath, generatedWorkflow.endsWith('\n') ? generatedWorkflow : `${generatedWorkflow}\n`, 'utf8');

console.log('Phase 1 Cash/Cheque policy and inspection-first Founder MFA workflow are generated and verified.');
