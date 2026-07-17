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
const PAYMENT_PLANS = new Set(["annual", "quarterly", "monthly"]);

type ContractMode = "FM_ONLY" | "PM_ONLY" | "BOTH";

const CONTRACT_MODE_NAMES = new Map<ContractMode, string>([
  ["FM_ONLY", "MAINTENANCE ONLY"],
  ["PM_ONLY", "PROPERTY MANAGEMENT"],
  ["BOTH", "TOTAL CARE HYBRID"],
]);

const text = (value: unknown) => String(value || "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const compactUpper = (value: unknown) => upper(value).replace(/\s+/g, "");
const money = (value: unknown) => Math.round(Number(value) * 100) / 100;

function contractModeForProperty(property: any): ContractMode {
  const strategy = text(property?.strategy).toLowerCase();
  if (["pm_only", "rent"].includes(strategy)) return "PM_ONLY";
  if (["fm_only", "fm"].includes(strategy)) return "FM_ONLY";
  if (["both", "hybrid", "combined"].includes(strategy)) return "BOTH";
  throw new HttpsError("invalid-argument", "Every property must use maintenance, property management, or hybrid service mode.");
}

function assertCanonicalCommercialTerms(rawData: any) {
  const data = rawData && typeof rawData === "object" ? rawData : {};
  const properties = Array.isArray(data.properties) ? data.properties : [];
  if (!properties.length || properties.length > 100) {
    throw new HttpsError("invalid-argument", "One to 100 properties are required for the contract package.");
  }

  const resolvedModes = properties.map((property: any) => contractModeForProperty(property));
  const contractMode = resolvedModes[0];
  if (!contractMode || resolvedModes.some((mode: ContractMode) => mode !== contractMode)) {
    throw new HttpsError("failed-precondition", "A single contract cannot mix maintenance, property-management, and hybrid service modes.");
  }

  const canonicalPlanName = CONTRACT_MODE_NAMES.get(contractMode);
  if (!canonicalPlanName) {
    throw new HttpsError("failed-precondition", "The contract service mode could not be resolved.");
  }
  const submittedPlanName = upper(data?.serviceDetails?.selectedPlan);
  if (submittedPlanName !== canonicalPlanName) {
    throw new HttpsError("failed-precondition", "The selected contract plan does not match the server-priced property strategy.");
  }

  const paymentPlans = properties.map((property: any) => text(property?.paymentPlan || "annual").toLowerCase());
  if (paymentPlans.some((plan: string) => !PAYMENT_PLANS.has(plan))) {
    throw new HttpsError("invalid-argument", "Payment plan must be annual, quarterly, or monthly.");
  }
  const paymentPlan = paymentPlans[0];
  if (!paymentPlan || paymentPlans.some((plan: string) => plan !== paymentPlan)) {
    throw new HttpsError("failed-precondition", "All properties in one contract must use the same payment plan.");
  }

  const submittedCadences = [
    data.paymentPlan,
    data.serviceDetails?.paymentPlan,
    data.paymentManifest?.paymentPlan,
  ].map((value) => text(value).toLowerCase()).filter(Boolean);
  if (submittedCadences.some((plan) => !PAYMENT_PLANS.has(plan) || plan !== paymentPlan)) {
    throw new HttpsError("failed-precondition", "The submitted payment cadence does not match the server-priced property cadence.");
  }

  const totalUnits = properties.reduce((total: number, property: any) => {
    const units = Number(property?.units || property?.bedrooms || property?.beds || 0);
    return total + (Number.isFinite(units) && units > 0 ? units : 0);
  }, 0);
  const submittedServiceDetails = data.serviceDetails && typeof data.serviceDetails === "object"
    ? data.serviceDetails
    : {};
  const canonicalServiceDetails = Object.assign({}, submittedServiceDetails, {
    properties: properties.length,
    totalUnits,
    selectedPlan: canonicalPlanName,
    contractMode,
    paymentPlan,
  });
  const canonicalData = Object.assign({}, data, {
    serviceDetails: canonicalServiceDetails,
    paymentPlan,
  });

  return {
    data: canonicalData,
    contractMode,
    canonicalPlanName,
    paymentPlan,
    propertyCount: properties.length,
    totalUnits,
  };
}

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
  if (method === "BANK_TRANSFER" && (
    text(manifest.bankName) !== activeConfiguration.bankName ||
    compactUpper(manifest.accountNumber) !== compactUpper(activeConfiguration.accountNumber) ||
    compactUpper(manifest.iban) !== compactUpper(activeConfiguration.iban) ||
    compactUpper(manifest.swiftBic) !== compactUpper(activeConfiguration.swiftBic)
  )) {
    throw new HttpsError("failed-precondition", "The submitted bank-transfer instructions do not match the active corporate account.");
  }
  if (method === "CASH" && text(manifest.officeLocation) !== activeConfiguration.officeLocation) {
    throw new HttpsError("failed-precondition", "The submitted cash-payment location does not match the active corporate configuration.");
  }
  if (MANUAL_METHODS.has(method) && text(manifest.reference).length < 4) {
    throw new HttpsError("failed-precondition", "Manual payment instructions require a valid immutable reference.");
  }
}

async function assertServerQuote(request: any, data: any) {
  if (text(data.quoteId)) {
    return assertOwnerPortfolioQuoteRecord(request.auth.uid, {
      quoteId: data.quoteId,
      quoteHash: data.quoteHash,
      inputHash: data.quoteInputHash || data.inputHash,
      portfolioAnnualTotal: data.annualContractValue,
      mobilisationDeposit: data.activationDeposit || data.amount,
    });
  }

  const previewRunner = (previewOwnerOnboardingQuote as any).run;
  if (typeof previewRunner !== "function") throw new HttpsError("internal", "The server quote calculator is unavailable.");
  const previewResult = await previewRunner({
    ...request,
    data: {
      properties: data.properties,
      selectedAddOns: data.serviceDetails?.selectedAddOns || [],
    },
  });
  const quote = previewResult?.data || previewResult;
  if (
    !quote ||
    quote.currency !== "AED" ||
    Number(quote.expiresAtMs || 0) <= Date.now() ||
    text(quote.quoteHash) !== text(data.quoteHash) ||
    money(quote.annualContractValue) !== money(data.annualContractValue) ||
    money(quote.activationDeposit) !== money(data.activationDeposit || data.amount)
  ) {
    throw new HttpsError("failed-precondition", "The submitted onboarding quote is missing, expired or does not match the server calculation.");
  }
  return {
    valid: true,
    quoteId: null,
    quoteHash: quote.quoteHash,
    inputHash: null,
    portfolioAnnualTotal: money(quote.annualContractValue),
    mobilisationDeposit: money(quote.activationDeposit),
    currency: "AED" as const,
  };
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

    const commercial = assertCanonicalCommercialTerms(request.data || {});
    const data = commercial.data;
    const quote = await assertServerQuote(request, data);
    if (
      money(data.paymentManifest?.annualContractValue) !== quote.portfolioAnnualTotal ||
      money(data.paymentManifest?.activationDeposit || data.paymentManifest?.amount) !== quote.mobilisationDeposit
    ) {
      throw new HttpsError("failed-precondition", "The payment manifest does not match the active owner quote.");
    }

    await assertCurrentPaymentConfiguration(data);

    const legacyRunner = (legacySubmitOwnerOnboardingPaymentPackage as any).run;
    if (typeof legacyRunner !== "function") {
      throw new HttpsError("internal", "The protected onboarding package handler is unavailable.");
    }
    return legacyRunner({ ...request, data });
  },
);

export {
  previewOwnerOnboardingQuote,
  submitPendingOwnerRegistration,
};
