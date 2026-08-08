#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  patchAdminBusinessEvidence as legacyPatchAdminBusinessEvidence,
  patchTenantBusinessEvidence as legacyPatchTenantBusinessEvidence,
  patchTechnicianBusinessEvidence as legacyPatchTechnicianBusinessEvidence,
} from './apply-five-role-business-evidence-fixes-legacy.mjs';

const ADMIN_FILE = 'tests/e2e/business-admin.spec.ts';
const TENANT_FILE = 'tests/e2e/business-tenant.spec.ts';
const TECHNICIAN_FILE = 'tests/e2e/business-technician.spec.ts';
const ADMIN_PHASE1_MARKER = "const phase1PaymentConfigurationSnap = await db.collection('system_payment_config').doc('current').get();";

function replaceExactlyOnce(source, before, after, label, purpose) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`[five-role-business-evidence] ${label}: expected exactly one ${purpose} anchor, found ${matches}`);
  }
  return source.replace(before, after);
}

function patchAdminPhase1PaymentFixture(source, label = ADMIN_FILE) {
  if (source.includes(ADMIN_PHASE1_MARKER)) return source;

  const seedAnchor = `  const freshGps = admin.firestore.Timestamp.now();

  await Promise.all([`;
  const seedReplacement = `  const freshGps = admin.firestore.Timestamp.now();

  // Protected Phase 1 Admin evidence must use the live Cash/Cheque policy, not
  // the retired Stripe activation fixture. Seed one real immutable CASH receipt
  // and bind it to the exact active payment-configuration hash. The Admin UI
  // still performs the approval itself under the canonical Founder MFA session.
  const phase1PaymentConfigurationSnap = await db.collection('system_payment_config').doc('current').get();
  if (!phase1PaymentConfigurationSnap.exists) throw new Error('Protected Phase 1 payment configuration is missing.');
  const phase1PaymentConfigurationRaw = phase1PaymentConfigurationSnap.data() || {};
  const phase1Upper = (value: unknown) => String(value || '').trim().toUpperCase();
  const phase1ApprovedMethods = Array.isArray(phase1PaymentConfigurationRaw.approvedMethods)
    ? Array.from(new Set(
      phase1PaymentConfigurationRaw.approvedMethods
        .map((value: unknown) => phase1Upper(value))
        .filter((value: string) => ['BANK_TRANSFER', 'CHEQUE', 'CASH', 'STRIPE'].includes(value)),
    ))
    : [];
  if (!phase1ApprovedMethods.includes('CASH')) {
    throw new Error('Protected Phase 1 Admin payment evidence requires CASH to be active.');
  }
  const phase1BankTransferEnabled = phase1ApprovedMethods.includes('BANK_TRANSFER');
  const phase1EffectiveAt = phase1PaymentConfigurationRaw.effectiveAt || phase1PaymentConfigurationRaw.updatedAt;
  const phase1EffectiveAtMs = typeof phase1EffectiveAt?.toMillis === 'function'
    ? Number(phase1EffectiveAt.toMillis())
    : Date.parse(String(phase1EffectiveAt || ''));
  const phase1PaymentConfiguration = {
    version: String(phase1PaymentConfigurationRaw.version || '').trim(),
    effectiveAtMs: phase1EffectiveAtMs,
    legalBeneficiary: String(phase1PaymentConfigurationRaw.legalBeneficiary || phase1PaymentConfigurationRaw.beneficiaryName || '').trim(),
    bankName: phase1BankTransferEnabled ? String(phase1PaymentConfigurationRaw.bankName || '').trim() : '',
    accountNumber: phase1BankTransferEnabled ? String(phase1PaymentConfigurationRaw.accountNumber || '').replace(/\\s+/g, '') : '',
    iban: phase1BankTransferEnabled ? phase1Upper(phase1PaymentConfigurationRaw.iban).replace(/\\s+/g, '') : '',
    swiftBic: phase1BankTransferEnabled ? phase1Upper(phase1PaymentConfigurationRaw.swiftBic || phase1PaymentConfigurationRaw.swift || phase1PaymentConfigurationRaw.bic).replace(/\\s+/g, '') : '',
    currency: 'AED',
    officeLocation: String(phase1PaymentConfigurationRaw.officeLocation || phase1PaymentConfigurationRaw.cashOfficeLocation || '').trim(),
    approvedMethods: phase1ApprovedMethods,
  };
  if (!phase1PaymentConfiguration.version || !Number.isFinite(phase1PaymentConfiguration.effectiveAtMs)) {
    throw new Error('Protected Phase 1 payment configuration is incomplete.');
  }
  const phase1PaymentConfigHash = createHash('sha256').update(JSON.stringify(phase1PaymentConfiguration)).digest('hex');
  const phase1PaymentReferenceId = 'CASH-' + RUN_ID;
  const phase1ReceiptPayload = Buffer.from('%PDF-1.4\\n% BIN GROUP protected Phase 1 CASH receipt evidence\\n%%EOF\\n');
  const phase1ReceiptHash = createHash('sha256').update(phase1ReceiptPayload).digest('hex');
  const phase1ReceiptPath = 'payment-references/owners/' + PAYMENT_OWNER_UID + '/' + PAYMENT_ID + '/' + PREFIX + '-cash-receipt.pdf';
  const phase1ReceiptToken = randomBytes(16).toString('hex');
  const phase1Bucket = admin.storage().bucket();
  await phase1Bucket.file(phase1ReceiptPath).save(phase1ReceiptPayload, {
    resumable: false,
    contentType: 'application/pdf',
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: phase1ReceiptToken,
        ownerUid: PAYMENT_OWNER_UID,
        paymentId: PAYMENT_ID,
        intakeId: PAYMENT_ID,
        evidenceType: 'owner_payment_receipt',
        receiptHash: phase1ReceiptHash,
        uploadedByAdmin: 'protected-e2e-seed',
        uploadedAt: new Date().toISOString(),
      },
    },
  });
  const [phase1ReceiptMetadata] = await phase1Bucket.file(phase1ReceiptPath).getMetadata();
  const phase1ReceiptGeneration = String(phase1ReceiptMetadata.generation || '').trim();
  if (!phase1ReceiptGeneration) throw new Error('Protected Phase 1 CASH receipt has no immutable Storage generation.');
  const phase1ReceiptUrl = 'https://firebasestorage.googleapis.com/v0/b/' + phase1Bucket.name + '/o/' + encodeURIComponent(phase1ReceiptPath) + '?alt=media&token=' + phase1ReceiptToken;

  await Promise.all([`;

  let patched = replaceExactlyOnce(source, seedAnchor, seedReplacement, label, 'Admin seed');

  const stripeFixture = `      paymentMethod: 'STRIPE',
      stripeSessionId: \`cs_e2e_\${RUN_ID}\`,
      verified: true,
      paymentVerified: true,
      status: 'PENDING',
      paymentStatus: 'PAID',`;
  const phase1CashFixture = `      paymentMethod: 'CASH',
      method: 'CASH',
      paymentReferenceId: phase1PaymentReferenceId,
      paymentReference: phase1PaymentReferenceId,
      verified: false,
      paymentVerified: false,
      paymentConfigVersion: phase1PaymentConfiguration.version,
      paymentConfigurationVersion: phase1PaymentConfiguration.version,
      paymentConfigHash: phase1PaymentConfigHash,
      paymentConfigurationHash: phase1PaymentConfigHash,
      paymentManifest: {
        configVersion: phase1PaymentConfiguration.version,
        configHash: phase1PaymentConfigHash,
        legalBeneficiary: phase1PaymentConfiguration.legalBeneficiary,
        currency: phase1PaymentConfiguration.currency,
        officeLocation: phase1PaymentConfiguration.officeLocation,
        approvedMethods: phase1PaymentConfiguration.approvedMethods,
        selectedMethod: 'CASH',
        capturedAt: new Date().toISOString(),
      },
      paymentProofUrl: phase1ReceiptUrl,
      paymentProofPath: phase1ReceiptPath,
      paymentProofHash: phase1ReceiptHash,
      paymentProofGeneration: phase1ReceiptGeneration,
      paymentProofEvidence: {
        receiptUrl: phase1ReceiptUrl,
        storagePath: phase1ReceiptPath,
        receiptHash: phase1ReceiptHash,
        generation: phase1ReceiptGeneration,
        recordedBy: 'protected-e2e-seed',
      },
      receiptUrl: phase1ReceiptUrl,
      receiptPath: phase1ReceiptPath,
      receiptHash: phase1ReceiptHash,
      receiptGeneration: phase1ReceiptGeneration,
      status: 'PENDING',
      paymentStatus: 'PENDING_ADMIN_APPROVAL',`;
  patched = replaceExactlyOnce(patched, stripeFixture, phase1CashFixture, label, 'retired Stripe activation fixture');

  const cleanupAnchor = `  await Promise.all(BROKER_STORAGE_PATHS.map((storagePath) => admin.storage().bucket().file(storagePath).delete({ ignoreNotFound: true }).catch(() => undefined)));
  await deleteQuery('invoice_registry', 'entityId', PAYMENT_INVOICE_ID).catch(() => undefined);`;
  const cleanupReplacement = `  await Promise.all(BROKER_STORAGE_PATHS.map((storagePath) => admin.storage().bucket().file(storagePath).delete({ ignoreNotFound: true }).catch(() => undefined)));
  await admin.storage().bucket().file('payment-references/owners/' + PAYMENT_OWNER_UID + '/' + PAYMENT_ID + '/' + PREFIX + '-cash-receipt.pdf').delete({ ignoreNotFound: true }).catch(() => undefined);
  await deleteQuery('invoice_registry', 'entityId', PAYMENT_INVOICE_ID).catch(() => undefined);`;
  patched = replaceExactlyOnce(patched, cleanupAnchor, cleanupReplacement, label, 'Admin receipt cleanup');

  return patched;
}

export function patchAdminBusinessEvidence(source, label = ADMIN_FILE) {
  let patched = source;
  if (!(source.includes("getByTestId('admin-payment-approve')") &&
      source.includes("getByTestId('admin-payment-approval-dialog')") &&
      source.includes("getByTestId('admin-payment-confirm-approval')"))) {
    patched = legacyPatchAdminBusinessEvidence(source, label);
  }
  return patchAdminPhase1PaymentFixture(patched, label);
}

export function patchTenantBusinessEvidence(source, label = TENANT_FILE) {
  return legacyPatchTenantBusinessEvidence(source, label);
}

export function patchTechnicianBusinessEvidence(source, label = TECHNICIAN_FILE) {
  return legacyPatchTechnicianBusinessEvidence(source, label);
}

export function patchBusinessEvidenceFiles() {
  const adminSource = readFileSync(ADMIN_FILE, 'utf8');
  const tenantSource = readFileSync(TENANT_FILE, 'utf8');
  const technicianSource = readFileSync(TECHNICIAN_FILE, 'utf8');
  const adminPatched = patchAdminBusinessEvidence(adminSource);
  const tenantPatched = patchTenantBusinessEvidence(tenantSource);
  const technicianPatched = patchTechnicianBusinessEvidence(technicianSource);
  writeFileSync(ADMIN_FILE, adminPatched, 'utf8');
  writeFileSync(TENANT_FILE, tenantPatched, 'utf8');
  writeFileSync(TECHNICIAN_FILE, technicianPatched, 'utf8');
  console.log('[five-role-business-evidence] Phase 1 CASH Admin fixture bound to immutable receipt/config; Tenant and Technician replay hardening applied');
}

/*
response.url().includes('createTenantServiceTicket')
callablePayload?.result?.ticketId
db.collection('maintenanceTickets').doc(ticketId).get()
String(data.status || '').toUpperCase()
(?:CLOSED|COMPLETED)
const verifyAndUnlockButton = activationRow.getByRole('button', { name: /Verify & Unlock/i })
currentActivationState
APPROVED|ACTIVE|ACTIVE|true|ACTIVE
Missing Verify & Unlock button is acceptable only when this exact owner activation is already idempotently approved
registeredPushReady ? /SUCCESS|PARTIAL/ : /NO_REGISTERED_TOKEN/
pushDeliveryState: 'NO_REGISTERED_TOKEN'
where('recipientId', '==', technicianUid)
const tokenFreshnessFloor
const registeredPushReady = pushReadiness.ready
*/

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  patchBusinessEvidenceFiles();
}
