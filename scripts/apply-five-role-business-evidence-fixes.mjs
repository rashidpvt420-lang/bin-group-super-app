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

export function patchAdminBusinessEvidence(source, label = ADMIN_FILE) {
  if (source.includes("getByTestId('admin-payment-approve')") &&
      source.includes("getByTestId('admin-payment-approval-dialog')") &&
      source.includes("getByTestId('admin-payment-confirm-approval')")) return source;
  return legacyPatchAdminBusinessEvidence(source, label);
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
  console.log('[five-role-business-evidence] stable Admin contracts preserved; Tenant and Technician replay hardening applied');
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
