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
export { ownerSetRentSchedule, sendRentDueReminders, onRentPaymentDecision } from './rentSchedule';
export { onOwnerApprovalDecision, submitOwnerApprovalDecision } from './ownerTrustWorkflow';
export { runContractRenewalWatch, rebuildContractRenewalWatch } from './contractRenewalPdfSystem';
export { sendMonthlyOwnerPropertyReports, rebuildMonthlyOwnerPropertyReports } from './monthlyOwnerPropertyReportSystem';
export { listUnifiedDocumentVault, getUnifiedDocumentFile } from './unifiedDocumentVault';
export { ownerRecordLeaseAgreement } from './leaseAgreements';
export { ownerProposeLeaseRenewal, tenantRespondLeaseRenewal } from './leaseRenewals';
export { onLeaseRenewalDeclinedMarkVacating, onMoveOutInspectionMarkVacating, markEndedLeasesVacant, ownerPrepareUnitListing } from './unitVacancy';
export { notifyBrokersOfNewVacancy } from './brokerVacancyAlerts';
export { ownerInviteTenantToUnit, ownerListTenantInvitations } from './ownerTenantInvites';
export { getOwnerKpis } from './ownerKpis';
export { createTenantJobLink, resolveTenantJobLink, reportViaTenantJobLink } from './tenantJobLinks';
export { financeRecordPdcStatus, getPdcRegister } from './pdcRegister';
export { onOwnerBankAccountChanged, onBrokerPayoutDetailsChanged } from './payoutChangeAlerts';
export { reopenMaintenanceTicket } from './ticketReopen';
export { getOwnerPropertyLedger } from './ownerPropertyLedger';
export { adminSetDesignPriceList } from './designPriceList';
