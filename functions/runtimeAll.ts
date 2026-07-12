import { onInit } from 'firebase-functions/v2/core';
import * as admin from 'firebase-admin';

// Defer Admin SDK init until after discovery when possible. Modules that call
// admin.firestore() at module scope still need a safe bootstrap, so initialize
// once here if nothing else has yet.
onInit(() => {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
});

export * from './runtime';
export * from './whatsappWebhook';
export * from './rentLedgerMirror';
export { onOwnerApprovalDecision, submitOwnerApprovalDecision } from './ownerTrustWorkflow';
export { listOwnerHandoverInspections, updateOwnerHandoverInspection } from './ownerHandoverInspections';
export { submitTenantMoveInspection } from './tenantHandoverInspections';
export { runContractRenewalWatch, rebuildContractRenewalWatch } from './contractRenewalPdfSystem';
export { adminCreateUser, syncStaffCustomClaims } from './adminUserProvisioning';
export { sendMonthlyOwnerPropertyReports, rebuildMonthlyOwnerPropertyReports } from './monthlyOwnerPropertyReportSystem';
export { updateTicketLifecycleV2 } from './ticketLifecycleV2';
