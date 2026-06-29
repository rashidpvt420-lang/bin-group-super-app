import * as admin from "firebase-admin";

export * from "./index";
export * from "./contractActivation";
export * from "./brokerCommissions";
export * from "./ownerOnboarding";
export * from "./ownerRegistrationRequest";
export * from "./onboardingProofUpload";
export * from "./stripePayment";
export * from "./adminOwnerOperations";
export * from "./paymentTransactionApproval";
export * from "./mailDelivery";
export * from "./notificationDelivery";
export * from "./ticketNormalization";
export * from "./hrAutomation";
export * from "./adminUserProvisioning";
export * from "./adminBridgeAuth";
export * from "./aiAssistant";
export * from "./aiDesignStudio";
export * from "./contractSignatureOtp";
export * from "./tenantHandoverInspections";
export * from "./ownerHandoverInspections";
export * from "./profileP1Workflows";
export * from "./userAuditOperations";
export * from "./tenantTicketReview";
export * from "./qrSecurity";
export * from "./technicianOfflineSync";

if (!admin.apps.length) {
  admin.initializeApp();
}
