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
export { getOwnerComplianceCalendar, sendComplianceReminders } from './ownerComplianceCalendar';
export { onLeaseRenewalDeclinedMarkVacating, onMoveOutInspectionMarkVacating, markEndedLeasesVacant, ownerPrepareUnitListing } from './unitVacancy';
export { notifyBrokersOfNewVacancy } from './brokerVacancyAlerts';
export { ownerInviteTenantToUnit, ownerListTenantInvitations } from './ownerTenantInvites';
export { getOwnerVendorScorecards, sendVendorCredentialAlerts } from './ownerVendorVerification';
export { getOwnerKpis } from './ownerKpis';
export { getOwnerTrustMetrics } from './ownerTrustMetrics';
export { createTenantJobLink, resolveTenantJobLink, reportViaTenantJobLink } from './tenantJobLinks';
export { financeRecordPdcStatus, getPdcRegister } from './pdcRegister';
export { onOwnerBankAccountChanged, onBrokerPayoutDetailsChanged } from './payoutChangeAlerts';
export { reopenMaintenanceTicket } from './ticketReopen';
export { getOwnerPrivacyCentre, ownerExportMyData, ownerSubmitCorrectionRequest, ownerCreateDataShare, ownerRevokeDataShare } from './ownerPrivacyCentre';
export { getOwnerPropertyLedger } from './ownerPropertyLedger';
export { ownerUpsertPropertyAsset, getOwnerPropertyPassport } from './ownerPropertyPassport';
export { getOwnerProofOfSpend } from './ownerProofOfSpend';
export { adminSetDesignPriceList } from './designPriceList';
