import * as admin from "firebase-admin";

export * from "./index";
export * from "./contractActivation";
export * from "./brokerCommissions";
export * from "./brokerKycProfile";
export * from "./ownerOnboarding";
export * from "./ownerPortfolioQuote";
export * from "./secureOwnerRegistrationRequest";
export * from "./ownerFinancialOperations";
export * from "./ownerMaintenanceOperations";
export * from "./onboardingProofUpload";
export * from "./stripePayment";
export * from "./adminOwnerOperations";
export * from "./securePaymentApproval";
export * from "./paymentConfiguration";
export * from "./mailDelivery";
export * from "./notificationDelivery";
export * from "./ticketNormalization";
export * from "./hrAutomation";
export * from "./adminUserProvisioning";
export * from "./adminBridgeAuth";
export * from "./adminSecurityProfile";
export * from "./aiAssistant";
export * from "./aiDesignStudio";
export * from "./contractSignatureOtp";
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
export * from "./secureBrokerPayoutOperations";

export {
  resumeTechnicianDuty,
  acceptTechnicianTicket,
  updateTicketLifecycle,
} from "./secureTechnicianOperations";
export { adminResolveTenantUnitLink } from "./secureTenantUnitLinkOperations";

if (!admin.apps.length) {
  admin.initializeApp();
}
