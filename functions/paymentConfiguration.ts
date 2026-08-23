import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const CONFIG_COLLECTION = "system_payment_config";
const CONFIG_DOCUMENT = "current";
const EXPECTED_BENEFICIARY = "BIN GROUP L.L.C - S.P.C";
const PHASE1_METHODS = ["CASH", "CHEQUE"] as const;
const PAYMENT_ACCESS_ROLES = new Set([
  "owner",
  "admin",
  "ceo",
  "super_admin",
  "operations_admin",
  "finance_admin",
]);

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizeText = (value: unknown) => String(value || "").trim();
const normalizeUpper = (value: unknown) => normalizeText(value).toUpperCase();

export interface ActivePaymentConfiguration {
  version: string;
  effectiveAtMs: number;
  legalBeneficiary: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  swiftBic: string;
  currency: "AED";
  officeLocation: string;
  approvedMethods: string[];
  configHash: string;
}

async function requirePaymentConfigurationAccess(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Owner login required.");
  if (auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "Suspended accounts cannot request payment instructions.");
  }

  let role = normalizeRole(auth.token?.role || auth.token?.userRole || auth.token?.primaryRole);
  if (!PAYMENT_ACCESS_ROLES.has(role)) {
    const profileSnap = await db.collection("users").doc(auth.uid).get();
    const profile = profileSnap.data() || {};
    if (profile.suspended === true || normalizeRole(profile.status) === "suspended") {
      throw new HttpsError("permission-denied", "Suspended accounts cannot request payment instructions.");
    }
    role = normalizeRole(profile.role || profile.userRole || profile.primaryRole);
  }

  if (!PAYMENT_ACCESS_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "Owner or authorised administrator access required.");
  }
}

const timestampToMillis = (value: unknown) => {
  if (value instanceof admin.firestore.Timestamp) return value.toMillis();
  if (typeof (value as any)?.toMillis === "function") return Number((value as any).toMillis());
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const canonicalHash = (configuration: Omit<ActivePaymentConfiguration, "configHash">) => crypto
  .createHash("sha256")
  .update(JSON.stringify(configuration))
  .digest("hex");

export function resolveActivePaymentConfiguration(value: Record<string, any>): ActivePaymentConfiguration {
  if (normalizeUpper(value.status) !== "ACTIVE") {
    throw new HttpsError(
      "failed-precondition",
      "Corporate payment instructions are not active. Cash and Cheque payments are disabled.",
    );
  }

  const legalBeneficiary = normalizeText(value.legalBeneficiary || value.beneficiaryName);
  const rawBankName = normalizeText(value.bankName);
  const rawAccountNumber = normalizeText(value.accountNumber).replace(/\s+/g, "");
  const rawIban = normalizeUpper(value.iban).replace(/\s+/g, "");
  const rawSwiftBic = normalizeUpper(value.swiftBic || value.swift || value.bic).replace(/\s+/g, "");
  const currency = normalizeUpper(value.currency);
  const version = normalizeText(value.version);
  const effectiveAtMs = timestampToMillis(value.effectiveAt || value.updatedAt);
  const officeLocation = normalizeText(value.officeLocation || value.cashOfficeLocation);
  const approvedMethods = Array.isArray(value.approvedMethods)
    ? Array.from(new Set(value.approvedMethods.map(normalizeUpper).filter(Boolean))).sort()
    : [];
  const bankTransferEnabled = approvedMethods.includes("BANK_TRANSFER");
  const stripeEnabled = approvedMethods.includes("STRIPE");
  const cashOrChequeEnabled = approvedMethods.some((method) => method === "CASH" || method === "CHEQUE");

  if (legalBeneficiary !== EXPECTED_BENEFICIARY) {
    throw new HttpsError("failed-precondition", "The configured legal beneficiary does not match the approved corporate identity.");
  }
  if (!version || !effectiveAtMs) {
    throw new HttpsError("failed-precondition", "The corporate payment configuration is incomplete.");
  }
  if (currency !== "AED") {
    throw new HttpsError("failed-precondition", "Owner onboarding payments must be configured in AED.");
  }
  if (value.bankTransferEnabled === true || value.stripeEnabled === true) {
    throw new HttpsError(
      "failed-precondition",
      "Phase 1 requires Bank Transfer and Card/Stripe to remain disabled.",
    );
  }

  // Preserve the defensive bank-routing validator for future policy migration, while
  // Phase 1 below rejects any configuration that actually enables Bank Transfer.
  if (bankTransferEnabled) {
    if (!rawBankName || !rawAccountNumber) {
      throw new HttpsError("failed-precondition", "The corporate bank-transfer configuration is incomplete.");
    }
    if (!/^AE\d{21}$/.test(rawIban)) {
      throw new HttpsError("failed-precondition", "The configured UAE IBAN is invalid.");
    }
    if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(rawSwiftBic)) {
      throw new HttpsError("failed-precondition", "The configured SWIFT/BIC is invalid.");
    }
  }

  if (JSON.stringify(approvedMethods) !== JSON.stringify([...PHASE1_METHODS].sort())) {
    throw new HttpsError(
      "failed-precondition",
      "Phase 1 owner onboarding must enable exactly Cash and Cheque. Bank Transfer and Card payments are not available.",
    );
  }
  if (bankTransferEnabled || stripeEnabled) {
    throw new HttpsError(
      "failed-precondition",
      "Phase 1 requires Bank Transfer and Card/Stripe to remain disabled.",
    );
  }
  if (cashOrChequeEnabled && !officeLocation) {
    throw new HttpsError("failed-precondition", "Cash and Cheque payments require an approved BIN GROUP office location.");
  }

  const configurationWithoutHash: Omit<ActivePaymentConfiguration, "configHash"> = {
    version,
    effectiveAtMs,
    legalBeneficiary,
    bankName: bankTransferEnabled ? rawBankName : "",
    accountNumber: bankTransferEnabled ? rawAccountNumber : "",
    iban: bankTransferEnabled ? rawIban : "",
    swiftBic: bankTransferEnabled ? rawSwiftBic : "",
    currency: "AED",
    officeLocation,
    approvedMethods,
  };

  return {
    ...configurationWithoutHash,
    configHash: canonicalHash(configurationWithoutHash),
  };
}

export async function loadActivePaymentConfiguration(): Promise<ActivePaymentConfiguration> {
  const snapshot = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOCUMENT).get();
  if (!snapshot.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Corporate payment instructions are not configured. Cash and Cheque payments are disabled.",
    );
  }
  return resolveActivePaymentConfiguration(snapshot.data() || {});
}

export const getOwnerPaymentConfiguration = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    await requirePaymentConfigurationAccess(request.auth);
    return loadActivePaymentConfiguration();
  },
);