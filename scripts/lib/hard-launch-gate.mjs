#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as base from './hard-launch-gate-base.mjs';

export * from './hard-launch-gate-base.mjs';

export const PHASE1_PAYMENT_POLICY = 'phase1-manual';
// Retained only as a recognizable future-migration identifier. It is disabled
// by the current product policy and cannot be activated with a workflow input.
export const PHASE2_STRIPE_PAYMENT_POLICY = 'phase2-stripe';

const BASE_REQUIRED_OPERATIONAL_GATES_CONTRACT = Object.freeze([
  'ownerPaymentActivation',
  'paymentUnlockExactlyOnce',
  'tenantNotificationDelivery',
  'technicianPhysicalGpsEvidence',
  'brokerCommissionLockExactlyOnce',
  'adminStaffClaims',
  'stripeLiveBilling',
  'appCheckEnforcement',
  'aiProviderHealth',
  'privilegedAccessRotation',
  'brandedEmailDelivery',
  'renewalScheduler',
]);

const BASE_GATE_EVIDENCE_CONTRACT = Object.freeze({
  technicianPhysicalGpsEvidence: new Set(['physical-device-report']),
  brandedEmailDelivery: new Set(['provider-console-export', 'workflow-artifact']),
});

const BASE_GATE_SOURCE_CONTRACT = Object.freeze({
  technicianPhysicalGpsEvidence: [/physical.*device.*gps/i],
});

export const APPROVED_EVIDENCE_REFERENCE_ERROR = 'evidenceReference must be an HTTPS URL on an approved evidence host';
export const GITHUB_REPOSITORY_MISMATCH_ERROR = 'githubRepository mismatch';

function assertBaseHardLaunchContract() {
  const actual = [...base.REQUIRED_OPERATIONAL_GATES];
  if (JSON.stringify(actual) !== JSON.stringify(BASE_REQUIRED_OPERATIONAL_GATES_CONTRACT)) {
    throw new Error('Base hard-launch operational gate contract drifted unexpectedly');
  }

  for (const [gate, expected] of Object.entries(BASE_GATE_EVIDENCE_CONTRACT)) {
    const actualTypes = base.GATE_EVIDENCE_REQUIREMENTS?.[gate];
    if (!(actualTypes instanceof Set) || JSON.stringify([...actualTypes]) !== JSON.stringify([...expected])) {
      throw new Error(`Base hard-launch evidence contract drifted for ${gate}`);
    }
  }

  const technicianPatterns = base.GATE_SOURCE_SYSTEM_PATTERNS?.technicianPhysicalGpsEvidence || [];
  for (const pattern of BASE_GATE_SOURCE_CONTRACT.technicianPhysicalGpsEvidence) {
    if (!technicianPatterns.some((candidate) => String(candidate) === String(pattern))) {
      throw new Error('Base hard-launch Technician GPS source contract drifted unexpectedly');
    }
  }
}

assertBaseHardLaunchContract();

const PHASE1_REQUIRED_OPERATIONAL_GATES = Object.freeze(
  base.REQUIRED_OPERATIONAL_GATES.filter((gate) => gate !== 'stripeLiveBilling'),
);

export function requiredOperationalGatesForPaymentPolicy(paymentPolicy) {
  const policy = String(paymentPolicy || '').trim().toLowerCase();
  if (policy === PHASE1_PAYMENT_POLICY) return PHASE1_REQUIRED_OPERATIONAL_GATES;
  if (policy === PHASE2_STRIPE_PAYMENT_POLICY) {
    throw new Error('phase2-stripe is disabled by PHASE1_CASH_CHEQUE_V1 and requires a separately reviewed source migration');
  }
  throw new Error(`Unsupported payment policy for hard-launch operations: ${policy || '(missing)'}`);
}

// Backward compatibility for base schema consumers only. Policy-aware runtime
// callers must use requiredOperationalGatesForPaymentPolicy().
export const REQUIRED_OPERATIONAL_GATES = base.REQUIRED_OPERATIONAL_GATES;

function unique(values) {
  return [...new Set(values)];
}

function isStripeOperationalError(error) {
  return error === 'operational gate missing: stripeLiveBilling'
    || String(error || '').startsWith('stripeLiveBilling.');
}

function normalizePaymentMethods(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((method) => String(method || '').trim().toUpperCase()).filter(Boolean))].sort();
}

function validatePaymentPolicyBinding(doc) {
  const errors = [];
  const policy = String(doc?.paymentPolicy || '').trim().toLowerCase();
  if (!policy) return errors;

  if (policy === PHASE1_PAYMENT_POLICY) {
    const methods = normalizePaymentMethods(doc?.approvedPaymentMethods);
    if (JSON.stringify(methods) !== JSON.stringify(['CASH', 'CHEQUE'])) {
      errors.push('phase1-manual approvedPaymentMethods must be exactly CASH and CHEQUE');
    }
    if (doc?.bankTransferEnabled !== false) {
      errors.push('phase1-manual bankTransferEnabled must equal false');
    }
    if (doc?.stripeEnabled !== false) {
      errors.push('phase1-manual stripeEnabled must equal false');
    }
    if (!String(doc?.paymentConfigVersion || '').trim()) {
      errors.push('phase1-manual paymentConfigVersion is required');
    }
    if (!/^[0-9a-f]{64}$/i.test(String(doc?.paymentConfigHash || '').trim())) {
      errors.push('phase1-manual paymentConfigHash must be SHA-256');
    }
    if (String(doc?.paymentConfigSourceDocument || '') !== 'system_payment_config/current') {
      errors.push('phase1-manual paymentConfigSourceDocument mismatch');
    }
    if (doc?.gates?.stripeLiveBilling) {
      errors.push('stripeLiveBilling must be absent while phase1-manual disables Stripe');
    }
    return errors;
  }

  if (policy === PHASE2_STRIPE_PAYMENT_POLICY) {
    errors.push('phase2-stripe is disabled by PHASE1_CASH_CHEQUE_V1; enable it only through a separately reviewed source migration');
    return errors;
  }

  errors.push(`unsupported operational paymentPolicy: ${policy}`);
  return errors;
}

export function validateOperationalReadinessReport(doc, commitSha, options = {}) {
  const policy = String(doc?.paymentPolicy || '').trim().toLowerCase();
  const baseErrors = base.validateOperationalReadinessReport(doc, commitSha, options);

  // Missing policy stays under the stricter base schema and cannot become a
  // bypass. Current runtime evidence must state phase1-manual explicitly.
  if (!policy) return baseErrors;

  const policyErrors = validatePaymentPolicyBinding(doc);
  if (policy !== PHASE1_PAYMENT_POLICY) {
    return unique([...baseErrors, ...policyErrors]);
  }

  return unique([
    ...baseErrors.filter((error) => !isStripeOperationalError(error)),
    ...policyErrors,
  ]);
}

export function evaluateHardLaunchEligibility(args = {}) {
  const root = args.root || process.cwd();
  const resolvedOperational = args.operationalReport === undefined
    ? base.readHardLaunchInputs(root).operationalReport
    : args.operationalReport;
  const policy = String(resolvedOperational?.paymentPolicy || '').trim().toLowerCase();
  const baseResult = base.evaluateHardLaunchEligibility({
    ...args,
    operationalReport: resolvedOperational,
  });

  if (!policy) return baseResult;

  const policyErrors = validateOperationalReadinessReport(
    resolvedOperational,
    args.commitSha,
    { now: args.now, env: args.env },
  );

  const errors = unique([
    ...baseResult.errors.filter((error) => (
      policy === PHASE1_PAYMENT_POLICY ? !isStripeOperationalError(error) : true
    )),
    ...policyErrors,
  ]);

  return {
    ...baseResult,
    hardLaunchEligible: baseResult.pilotEligible && policy === PHASE1_PAYMENT_POLICY && errors.length === 0,
    hardLaunchClaim: false,
    errors,
  };
}

const directPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (directPath && directPath === fileURLToPath(import.meta.url)) {
  const contextErrors = base.validateProtectedHardLaunchWorkflowContext(process.env);
  if (contextErrors.length) {
    console.error('[hard-launch-validator] REFUSED — protected workflow context failed');
    for (const error of contextErrors) console.error(`- ${error}`);
    process.exit(1);
  }

  const commitSha = String(process.env.GITHUB_SHA || '').trim();
  const result = evaluateHardLaunchEligibility({
    ...base.readHardLaunchInputs(process.cwd()),
    commitSha,
    root: process.cwd(),
    env: process.env,
  });

  if (!result.hardLaunchEligible) {
    console.error('[hard-launch-validator] NO-GO');
    for (const error of result.errors) console.error(`- ${error}`);
    console.error('hardLaunchClaim=false');
    process.exit(1);
  }

  console.log('[hard-launch-validator] READY FOR FINAL SIGNED DECISION');
  console.log('hardLaunchClaim=false');
}
