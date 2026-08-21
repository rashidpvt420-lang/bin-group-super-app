import * as admin from "firebase-admin";

export * from "./index";
export * from "./contractActivation";
export * from "./brokerCommissions";
export * from "./brokerKycProfile";
export * from "./brokerReferralAttribution";
export * from "./ownerOnboarding";
export * from "./ownerPortfolioQuote";
export * from "./secureOwnerRegistrationRequest";
// Security: keep inspectionFirstOwnerOnboarding on an explicit named export list.
// The legacy single-inspection completion export is intentionally excluded; only
// portfolio-safe Owner acquisition callables are deployed.
export {
  previewOwnerInspectionQuote,
  requestOwnerInspectionSignatureOtp,
  verifyOwnerInspectionSignatureOtp,
  uploadOwnerInspectionProofDocument,
  submitOwnerInspectionFirstOnboarding,
  adminRecordOwnerMobilizationPaymentEvidence,
} from "./inspectionFirstOwnerOnboarding";
export * from "./ownerInspectionAdminLink";
export * from "./ownerInspectionCompletion";
export * from "./ownerFinancialOperations";
export * from "./ownerMaintenanceOperations";
export * from "./onboardingProofUpload";
export * from "./stripePayment";
export * from "./adminOwnerOperations";
export * from "./adminPropertyReview";
export * from "./securePaymentApproval";
export * from "./paymentConfiguration";
export * from "./mailDelivery";
export * from "./notificationDelivery";
export * from "./technicianDispatchNotifications";
export * from "./technicianBeforeWorkEvidence";
export * from "./ticketNormalization";
export * from "./hrAutomation";
export * from "./technicianPayrollCompatibility";
export * from "./adminUserProvisioning";
export * from "./adminStaffLifecycle";
export * from "./adminHrOperations";
export * from "./adminBridgeAuth";
export * from "./adminSecurityProfile";
export * from "./adminMfaReadiness";
export * from "./secureAdminContractOperations";
export * from "./adminMfaRecovery";
export * from "./aiAssistant";
// Keep the retired generateAIDesignConceptImages callable fail-closed while
// exporting the separately reviewed Owner/Tenant and Admin replacement callables.
export * from "./aiDesignStudioLaunchHold";
export * from "./aiDesignStudio";
export * from "./aiDesignStudioCompat";
// Explicit aliases replace the legacy hard-failing implementations re-exported
// from index.ts without creating duplicate public callable names.
export { processTitleDeedOCRV2 as processTitleDeedOCR } from "./titleDeedOcrV2";
export { getMissionGuidanceV2 as getMissionGuidance } from "./missionGuidanceV2";
export * from "./contractSignatureOtpMailbox";
export * from "./ownerOnboardingLifecycleEmail";
export * from "./tenantHandoverInspections";
export * from "./ownerHandoverInspections";
export * from "./profileP1Workflows";
export * from "./publicRoleAssignment";
export * from "./userAuditOperations";
export * from "./clientTelemetry";
export * from "./tenantTicketReview";
export * from "./qrSecurity";
export * from "./technicianOfflineSync";
export * from "./scheduledServices";
export * from "./scheduledServiceAvailability";
export * from "./ticketDispatchOperations";
export * from "./paymentEvidence";
export * from "./tenantTicketOperations";
export * from "./aiUsageQuota";
export * from "./secureOwnerProfileOperations";
export * from "./ownerProfileReadiness";
export * from "./technicianLiveLocation";
export * from "./technicianLiveLocationOverflow";
export * from "./proofVerification";
export * from "./staffOperatingSystem";
export * from "./staffInventoryEngine";
export * from "./staffPdfReporting";

export {
  resumeTechnicianDuty,
  acceptTechnicianTicket,
  updateTicketLifecycle,
  getTechnicianOperationalReadiness,
} from "./secureTechnicianOperations";
export {
  updateTechnicianProfilePreferences,
  submitTechnicianCredentialRenewal,
  listTechnicianCredentialRenewals,
} from "./secureTechnicianProfileOperations";
export { adminAssignTechnician } from "./secureAdminTechnicianAssignment";
export { tenantRequestUnitLink } from "./secureTenantUnitLinkRequest";
export { adminResolveTenantUnitLink } from "./secureTenantUnitLinkOperations";
export { submitBrokerKycProfile, getBrokerKycProfileSummary } from "./secureBrokerKycSubmission";
export { adminReviewBrokerKyc } from "./secureBrokerKycReview";
export { adminReviewBrokerPayoutRequest } from "./adminBrokerPayoutReview";
export {
  requestBrokerPayoutOtp,
  verifyBrokerPayoutOtp,
  submitBrokerPayoutRequest,
} from "./secureBrokerPayoutOperations";
export {
  submitTenantCorrectionRequest,
  listTenantCorrectionRequests,
  listAdminTenantCorrectionRequests,
  adminResolveTenantCorrectionRequest,
} from "./tenantCorrectionOperations";

if (!admin.apps.length) {
  admin.initializeApp();
}
