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
export { runContractRenewalWatch, rebuildContractRenewalWatch } from './contractRenewalPdfSystem';
export { sendMonthlyOwnerPropertyReports, rebuildMonthlyOwnerPropertyReports } from './monthlyOwnerPropertyReportSystem';
