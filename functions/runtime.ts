import * as admin from "firebase-admin";

export * from "./index";
export * from "./contractActivation";
export * from "./brokerCommissions";
export * from "./brokerKycProfile";
export * from "./brokerReferralAttribution";
export * from "./ownerOnboarding";
export * from "./ownerPortfolioQuote";
export * from "./secureOwnerRegistrationRequest";
// Phase 1 keeps the retired callable name fail-closed so stale clients cannot
// reactivate the pre-inspection payment path. This explicit export overrides the
// historical wildcard implementation above without removing quote/onboarding helpers.
export { submitOwnerOnboardingPaymentPackage } from "./ownerOnboardingPaymentPhase1Hold";
// Security: keep inspectionFirstOwnerOnboarding on an explicit named export list.
// Canonical property submission is wrapped separately so identity claims are
// reserved before the proven inspection-first implementation writes property state.
export {
  previewOwnerInspectionQuote,
  requestOwnerInspectionSignatureOtp,
  verifyOwnerInspectionSignatureOtp,
  uploadOwnerInspectionProofDocument,
  adminRecordOwnerMobilizationPaymentEvidence,
} from "./inspectionFirstOwnerOnboarding";
export { submitOwnerInspectionFirstOnboarding } from "./canonicalOwnerSubmission";
export * from "./ownerInspectionAdminLink";
// Preserve the proven immutable evidence recorder, but route portfolio completion
// through the canonical wrapper that promotes physical arrival GPS and evidence
// into server-authoritative dispatch geography.
export { adminRecordOwnerPropertyInspectionEvidence } from "./ownerInspectionCompletion";
export { adminCompleteOwnerPortfolioInspections } from "./canonicalOwnerInspectionCompletion";
export * from "./ownerFinancialOperations";
export * from "./ownerMaintenanceOperations";
export * from "./onboardingProofUpload";
// Phase 1 payment policy is Cash + Cheque only. Keep the historical Stripe
// implementation in source for a future reviewed migration, but deploy only the
// fail-closed compatibility endpoints so environment/secret drift cannot enable it.
export * from "./stripePaymentPhase1Hold";
export * from "./adminOwnerOperations";
// The legacy property-review implementation remains a compatibility dependency,
// but only the canonical fail-closed wrapper is publicly exported.
export { adminReviewOwnerProperty } from "./canonicalAdminPropertyReview";
export * from "./securePaymentApproval";
export * from "./paymentConfiguration";
export * from "./mailDelivery";
export * from "./notificationDelivery";
export * from "./technicianDispatchNotifications";
export * from "./technicianBeforeWorkEvidence";
export * from "./technicianAfterWorkEvidence";
export * from "./ticketNormalization";
export * from "./hrAutomation";
export * from "./technicianPayrollCompatibility";
export * from "./adminUserProvisioning";
export * from "./adminStaffLifecycle";
export * from "./adminHrOperations";
export * from "./adminLaunchConfiguration";
export * from "./adminBridgeAuth";
export * from "./adminSecurityProfile";
export * from "./adminMfaReadiness";
export * from "./secureAdminContractOperations";
export * from "./adminMfaRecovery";
export * from "./aiAssistant";
export * from "./homeDiscovery";
// Keep the retired generateAIDesignConceptImages callable fail-closed while
// exporting the separately reviewed Owner/Tenant and Admin replacement callables.
export * from "./aiDesignStudioLaunchHold";
export * from "./aiDesignStudio";
export * from "./aiDesignStudioCompat";
// Explicit aliases replace the legacy hard-failing implementations re-exported
// from index.ts without creating duplicate public callable names.
export { processTitleDeedOCRV2 as processTitleDeedOCR } from "./titleDeedOcrV2";
export { processFloorPlanAI } from "./floorPlanAnalyzer";
export { processPropertyDescriptionAI } from "./propertyDescriptionAnalyzer";
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
export { registerTechnicianDevice } from "./technicianInstallationBinding";
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
