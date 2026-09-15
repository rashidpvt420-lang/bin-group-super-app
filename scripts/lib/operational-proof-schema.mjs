#!/usr/bin/env node
import { PRODUCTION } from './launch-honesty.mjs';

const SHA256_RE = /^[0-9a-f]{64}$/i;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const OPERATIONAL_GATE_EVIDENCE_TYPES = Object.freeze({
  ownerPaymentActivation: new Set(['production-transaction']),
  paymentUnlockExactlyOnce: new Set(['production-transaction']),
  tenantNotificationDelivery: new Set(['production-transaction', 'workflow-artifact']),
  technicianPhysicalGpsEvidence: new Set(['physical-device-report']),
  brokerCommissionLockExactlyOnce: new Set(['production-transaction']),
  adminStaffClaims: new Set(['workflow-artifact', 'provider-console-export']),
  stripeLiveBilling: new Set(['production-transaction', 'provider-console-export']),
  appCheckEnforcement: new Set(['provider-console-export', 'workflow-artifact']),
  privilegedAccessRotation: new Set(['secret-rotation-record']),
  brandedEmailDelivery: new Set(['provider-console-export', 'workflow-artifact']),
  renewalScheduler: new Set(['scheduler-run']),
});

const SOURCE_SYSTEM_PATTERNS = Object.freeze({
  ownerPaymentActivation: [/firebase.*payment.*activation/i],
  paymentUnlockExactlyOnce: [/firebase.*adminapprovepayment.*replay/i],
  tenantNotificationDelivery: [/firebase.*notification.*fcm/i, /email.*delivery/i],
  technicianPhysicalGpsEvidence: [/firebase.*technician.*device.*storage/i, /physical.*device.*gps/i],
  brokerCommissionLockExactlyOnce: [/firebase.*broker.*commission.*replay/i],
  adminStaffClaims: [/firebase.*auth.*staff/i],
  stripeLiveBilling: [/stripe/i],
  appCheckEnforcement: [/firebase.*app\s*check/i, /app\s*check.*firebase/i],
  privilegedAccessRotation: [/google.*secret.*firebase.*authentication/i, /secret.*rotation/i],
  brandedEmailDelivery: [/email|mail|postmark|sendgrid|smtp/i],
  renewalScheduler: [/firebase.*renewal.*watcher/i, /cloud.*scheduler/i],
});

function requiredString(errors, doc, field) {
  if (String(doc?.[field] || '').trim().length < 3) errors.push(`${field} is required`);
}

function requiredTrue(errors, doc, field) {
  if (doc?.[field] !== true) errors.push(`${field} must be true`);
}

function requiredOne(errors, doc, field) {
  if (Number(doc?.[field]) !== 1) errors.push(`${field} must equal 1`);
}

function validateEvidenceType(errors, gateKey, evidenceType) {
  const allowed = OPERATIONAL_GATE_EVIDENCE_TYPES[gateKey];
  if (!allowed || !allowed.has(String(evidenceType || ''))) {
    errors.push(`evidenceType is not accepted for ${gateKey || '(missing gate)'}`);
  }
}

function validateSourceSystem(errors, gateKey, sourceSystem) {
  const value = String(sourceSystem || '').trim();
  if (!value) {
    errors.push('sourceSystem is required');
    return;
  }
  const patterns = SOURCE_SYSTEM_PATTERNS[gateKey] || [];
  if (!patterns.some((pattern) => pattern.test(value))) {
    errors.push(`sourceSystem is not accepted for ${gateKey || '(missing gate)'}`);
  }
}

export function validateOperationalProofDocument(
  doc,
  { gateKey, evidenceType, commitSha, sourceRunId, now = Date.now() } = {},
) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['operational-proof.json missing or malformed'];
  if (doc.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (doc.status !== 'passed') errors.push('status must be passed');
  if (doc.generatedByWorkflow !== true) errors.push('generatedByWorkflow must be true');
  if (doc.gateKey !== gateKey) errors.push('gateKey mismatch');
  if (doc.evidenceType !== evidenceType) errors.push('evidenceType mismatch');
  validateEvidenceType(errors, gateKey, evidenceType);
  if (doc.commitSha !== commitSha) errors.push('commitSha mismatch');
  if (doc.projectId !== PRODUCTION.projectId) errors.push(`projectId must be ${PRODUCTION.projectId}`);
  if (!/^\d+$/.test(String(sourceRunId || ''))) errors.push('sourceRunId must be numeric');
  if (String(doc.sourceRunId || '') !== String(sourceRunId || '')) errors.push('sourceRunId mismatch');
  validateSourceSystem(errors, gateKey, doc.sourceSystem);

  const observedAt = Date.parse(String(doc.observedAt || ''));
  if (!Number.isFinite(observedAt)) errors.push('observedAt must be a valid timestamp');
  else {
    if (observedAt > now + 5 * 60 * 1000) errors.push('observedAt cannot be in the future');
    if (now - observedAt > MAX_AGE_MS) errors.push('operational proof is older than 7 days');
  }

  if (!Array.isArray(doc.checks) || doc.checks.length === 0) {
    errors.push('checks must contain at least one passed check');
  } else {
    for (const [index, check] of doc.checks.entries()) {
      if (!check || typeof check !== 'object') {
        errors.push(`checks[${index}] is malformed`);
        continue;
      }
      requiredString(errors, check, 'name');
      if (check.status !== 'passed') errors.push(`checks[${index}].status must be passed`);
      requiredString(errors, check, 'reference');
    }
  }

  switch (gateKey) {
    case 'ownerPaymentActivation':
      requiredTrue(errors, doc, 'paymentVerified');
      requiredTrue(errors, doc, 'adminApproved');
      requiredTrue(errors, doc, 'dashboardUnlocked');
      requiredString(errors, doc, 'activeContractId');
      break;
    case 'paymentUnlockExactlyOnce':
      requiredOne(errors, doc, 'activationCount');
      requiredOne(errors, doc, 'invoiceCount');
      requiredTrue(errors, doc, 'duplicateAttemptRejected');
      requiredString(errors, doc, 'idempotencyKey');
      break;
    case 'tenantNotificationDelivery':
      requiredTrue(errors, doc, 'requestCreated');
      requiredTrue(errors, doc, 'photoStored');
      requiredTrue(errors, doc, 'notificationDelivered');
      requiredString(errors, doc, 'ticketId');
      requiredString(errors, doc, 'messageId');
      break;
    case 'technicianPhysicalGpsEvidence':
      requiredTrue(errors, doc, 'physicalDevice');
      requiredTrue(errors, doc, 'gpsCaptured');
      requiredTrue(errors, doc, 'beforePhotoStored');
      requiredTrue(errors, doc, 'afterPhotoStored');
      requiredString(errors, doc, 'ticketId');
      if (!SHA256_RE.test(String(doc.deviceIdHash || ''))) errors.push('deviceIdHash must be SHA-256');
      break;
    case 'brokerCommissionLockExactlyOnce':
      requiredTrue(errors, doc, 'attributionVerified');
      requiredOne(errors, doc, 'commissionCount');
      requiredTrue(errors, doc, 'duplicateLockRejected');
      requiredString(errors, doc, 'commissionId');
      break;
    case 'adminStaffClaims':
      requiredTrue(errors, doc, 'staffCreated');
      requiredTrue(errors, doc, 'claimsVerified');
      requiredTrue(errors, doc, 'leastPrivilegeVerified');
      if (!SHA256_RE.test(String(doc.staffUidHash || ''))) errors.push('staffUidHash must be SHA-256');
      break;
    case 'stripeLiveBilling':
      if (String(doc.provider || '').toLowerCase() !== 'stripe') errors.push('provider must be stripe');
      requiredTrue(errors, doc, 'liveMode');
      if (String(doc.currency || '').toLowerCase() !== 'aed') errors.push('currency must be AED');
      requiredTrue(errors, doc, 'chargeSucceeded');
      requiredTrue(errors, doc, 'signedWebhookVerified');
      requiredTrue(errors, doc, 'amountMatched');
      requiredTrue(errors, doc, 'idempotencyVerified');
      requiredString(errors, doc, 'transactionId');
      break;
    case 'appCheckEnforcement': {
      requiredTrue(errors, doc, 'enforcementEnabled');
      requiredTrue(errors, doc, 'authenticatedRequestVerified');
      const services = new Set((Array.isArray(doc.services) ? doc.services : []).map((value) => String(value).toLowerCase()));
      for (const service of ['firestore', 'storage', 'functions']) {
        if (!services.has(service)) errors.push(`services must include ${service}`);
      }
      break;
    }
    case 'privilegedAccessRotation': {
      requiredTrue(errors, doc, 'previousCredentialsRevoked');
      requiredString(errors, doc, 'rotationRecordId');
      if (doc.phase1PaymentPolicy !== 'PHASE1_CASH_CHEQUE_V1') {
        errors.push('phase1PaymentPolicy must equal PHASE1_CASH_CHEQUE_V1');
      }
      const disabledProviders = Array.isArray(doc.disabledProvidersExcluded)
        ? doc.disabledProvidersExcluded.map((value) => String(value).toUpperCase())
        : [];
      const disabledProviderSet = new Set(disabledProviders);
      if (
        disabledProviders.length !== 2 ||
        disabledProviderSet.size !== 2 ||
        !disabledProviderSet.has('STRIPE') ||
        !disabledProviderSet.has('BANK_TRANSFER')
      ) {
        errors.push('disabledProvidersExcluded must contain only STRIPE and BANK_TRANSFER');
      }

      const rotatedSecrets = Array.isArray(doc.rotatedSecrets) ? doc.rotatedSecrets : [];
      if (rotatedSecrets.length !== 1 || String(rotatedSecrets[0]?.name || '') !== 'SMTP_PASS') {
        errors.push('rotatedSecrets must contain exactly the active SMTP_PASS credential');
      } else {
        const smtp = rotatedSecrets[0];
        if (!/^\d+$/.test(String(smtp.latestVersionId || ''))) errors.push('SMTP_PASS latestVersionId must be numeric');
        if (Number(smtp.previousRevokedCount || 0) < 1) errors.push('SMTP_PASS must have a revoked previous version');
        const rotatedAt = Date.parse(String(smtp.rotatedAt || ''));
        if (!Number.isFinite(rotatedAt) || rotatedAt > now + 5 * 60 * 1000 || now - rotatedAt > MAX_AGE_MS) {
          errors.push('SMTP_PASS rotatedAt must be within seven days');
        }
      }

      if (!SHA256_RE.test(String(doc.adminUidHash || ''))) errors.push('adminUidHash must be SHA-256');
      const tokensValidAfterTime = Date.parse(String(doc.adminTokensValidAfterTime || ''));
      if (
        !Number.isFinite(tokensValidAfterTime) ||
        tokensValidAfterTime > now + 5 * 60 * 1000 ||
        now - tokensValidAfterTime > MAX_AGE_MS
      ) {
        errors.push('adminTokensValidAfterTime must prove a revocation within seven days');
      }

      const login = doc.adminCredentialLogin;
      if (!login || typeof login !== 'object' || login.status !== 'passed') {
        errors.push('adminCredentialLogin must contain a passed live Firebase Auth result');
      } else {
        if (!SHA256_RE.test(String(login.adminUidHash || '')) || login.adminUidHash !== doc.adminUidHash) {
          errors.push('adminCredentialLogin adminUidHash must match the rotated Admin');
        }
        if (!SHA256_RE.test(String(login.adminEmailHash || ''))) errors.push('adminCredentialLogin adminEmailHash must be SHA-256');
        if (String(login.role || '').toLowerCase() !== 'admin') errors.push('adminCredentialLogin role must be admin');
        if (!['password-accepted-authenticated', 'password-accepted-mfa-challenge-issued'].includes(String(login.authOutcome || ''))) {
          errors.push('adminCredentialLogin authOutcome is invalid');
        }
        if (login.directAuthentication !== true && login.mfaChallengeIssued !== true) {
          errors.push('adminCredentialLogin must prove password acceptance');
        }
        if (login.directAuthentication === true && login.mfaChallengeIssued === true) {
          errors.push('adminCredentialLogin outcomes must be mutually exclusive');
        }
        if (login.mfaChallengeIssued === true && Number(login.enrolledMfaFactorCount || 0) < 1) {
          errors.push('adminCredentialLogin MFA challenge requires an enrolled factor');
        }
        const loginObservedAt = Date.parse(String(login.observedAt || ''));
        if (!Number.isFinite(loginObservedAt) || Math.abs(loginObservedAt - observedAt) > 30 * 60 * 1000) {
          errors.push('adminCredentialLogin must be observed in the same protected rotation window');
        }
      }
      break;
    }
    case 'brandedEmailDelivery':
      if (!String(doc.senderDomain || '').toLowerCase().endsWith('bin-groups.com')) {
        errors.push('senderDomain must use bin-groups.com');
      }
      requiredTrue(errors, doc, 'deliveryVerified');
      requiredString(errors, doc, 'messageId');
      break;
    case 'renewalScheduler':
      requiredTrue(errors, doc, 'watchCreated');
      requiredTrue(errors, doc, 'documentQueueCreated');
      requiredTrue(errors, doc, 'notificationDelivered');
      requiredString(errors, doc, 'renewalId');
      break;
    default:
      errors.push(`unsupported operational gate: ${gateKey}`);
  }

  return [...new Set(errors)];
}
