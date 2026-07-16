import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  previewOwnerOnboardingQuote,
  submitOwnerOnboardingPaymentPackage as legacySubmitOwnerOnboardingPaymentPackage,
  submitPendingOwnerRegistration,
} from "./ownerRegistrationRequest";
import { loadActivePaymentConfiguration } from "./paymentConfiguration";
import { assertOwnerPortfolioQuoteRecord } from "./ownerPortfolioQuote";

const SUPPORTED_METHODS = new Set(["STRIPE", "BANK_TRANSFER", "CHEQUE", "CASH"]);
const MANUAL_METHODS = new Set(["BANK_TRANSFER", "CHEQUE", "CASH"]);

const text = (value: unknown) => String(value || "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const compactUpper = (value: unknown) => upper(value).replace(/\s+/g, "");

async function assertCurrentPaymentConfiguration(data: any) {
  const method = upper(data?.paymentMethod || data?.paymentManifest?.method);
  if (!SUPPORTED_METHODS.has(method)) throw new HttpsError("invalid-argument", "Unsupported payment method.");

  const activeConfiguration = await loadActivePaymentConfiguration();
  const manifest = data?.paymentManifest || {};
  const submittedVersion = text(
    data?.paymentConfigVersion || data?.paymentConfigurationVersion || manifest.configVersion || manifest.paymentConfigVersion,
  );
  const submittedHash = text(
    data?.paymentConfigHash || data?.paymentConfigurationHash || manifest.configHash || manifest.paymentConfigHash,
  );

  if (
    submittedVersion !== activeConfiguration.version ||
    submittedHash !== activeConfiguration.configHash ||
    !activeConfiguration.approvedMethods.includes(method)
  ) {
    throw new HttpsError("failed-precondition", "The payment instructions are missing, stale or not approved. Generate a new payment manifest.");
  }

  if (text(manifest.legalBeneficiary || manifest.payableTo) !== activeConfiguration.legalBeneficiary) {
    throw new HttpsError("failed-precondition", "The submitted legal beneficiary does not match the active corporate configuration.");
  }
  if (upper(manifest.currency) !== activeConfiguration.currency) {
    throw new HttpsError("failed-precondition", "The submitted payment currency does not match the active corporate configuration.");
  }

  if (method === "BANK_TRANSFER") {
    if (
      text(manifest.bankName) !== activeConfiguration.bankName ||
      compactUpper(manifest.accountNumber) !== compactUpper(activeConfiguration.accountNumber) ||
      compactUpper(manifest.iban) !== compactUpper(activeConfiguration.iban) ||
      compactUpper(manifest.swiftBic) !== compactUpper(activeConfiguration.swiftBic)
    ) {
      throw new HttpsError("failed-precondition", "The submitted bank-transfer instructions do not match the active corporate account.");
    }
  }

  if (method === "CASH" && text(manifest.officeLocation) !== activeConfiguration.officeLocation) {
    throw new HttpsError("failed-precondition", "The submitted cash-payment location does not match the active corporate configuration.");
  }
  if (MANUAL_METHODS.has(method) && text(manifest.reference).length < 4) {
    throw new HttpsError("failed-precondition", "Manual payment instructions require a valid immutable reference.");
  }
}

export const submitOwnerOnboardingPaymentPackage = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication is required.");
    if (request.auth.token?.email_verified !== true) {
      throw new HttpsError("failed-precondition", "Verify the owner email before submitting payment evidence.");
    }
    if (request.auth.token?.suspended === true) {
      throw new HttpsError("permission-denied", "Suspended owner accounts cannot continue onboarding.");
    }

    const data = request.data || {};
    const quote = await assertOwnerPortfolioQuoteRecord(request.auth.uid, {
      quoteId: data.quoteId,
      quoteHash: data.quoteHash,
      inputHash: data.quoteInputHash || data.inputHash,
      portfolioAnnualTotal: data.annualContractValue,
      mobilisationDeposit: data.activationDeposit || data.amount,
    });
    if (Number(data.paymentManifest?.annualContractValue) !== quote.portfolioAnnualTotal ||
        Number(data.paymentManifest?.activationDeposit || data.paymentManifest?.amount) !== quote.mobilisationDeposit) {
      throw new HttpsError("failed-precondition", "The payment manifest does not match the active owner quote.");
    }

    await assertCurrentPaymentConfiguration(data);

    const legacyRunner = (legacySubmitOwnerOnboardingPaymentPackage as any).run;
    if (typeof legacyRunner !== "function") {
      throw new HttpsError("internal", "The protected onboarding package handler is unavailable.");
    }
    return legacyRunner(request);
  },
);

export {
  previewOwnerOnboardingQuote,
  submitPendingOwnerRegistration,
};
