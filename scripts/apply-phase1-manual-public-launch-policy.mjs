#!/usr/bin/env node

/**
 * Idempotent Phase 1 policy validator.
 *
 * The source transformation that introduced the Phase 1 Cash/Cheque policy was
 * intentionally removed after promotion. Production coherence tests and the
 * Owner hardening command still require a stable validator at this path.
 * This script therefore verifies the promoted policy and emits the generated
 * workflow copy without mutating production source.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/firebase-production-deploy.yml');
const decisionPath = path.join(root, 'scripts/hard-launch-decision-gate.mjs');
const generatedPath = path.join(
  root,
  'launch_package/generated/firebase-production-deploy-phase1.yml',
);

const workflow = readFileSync(workflowPath, 'utf8');
const decision = readFileSync(decisionPath, 'utf8');

const requiredWorkflowBindings = [
  'payment_policy:',
  'phase1-manual',
  'phase2-stripe',
  'Verify Phase 1 manual Cash/Cheque production policy',
  'phase1-manual-payment-proof.json',
];

for (const binding of requiredWorkflowBindings) {
  if (!workflow.includes(binding)) {
    throw new Error(`Phase 1 production workflow binding missing: ${binding}`);
  }
}

// These exact expressions are part of the launch-honesty contract.
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
writeFileSync(generatedPath, workflow.endsWith('\n') ? workflow : `${workflow}\n`, 'utf8');

console.log('Phase 1 manual public-launch policy is already promoted and verified.');
