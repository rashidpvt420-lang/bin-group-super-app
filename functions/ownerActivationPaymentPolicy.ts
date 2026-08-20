import { normalizeAedMoney } from "./shared/aedMoney";

export type OwnerActivationPaymentMethod = "CASH" | "CHEQUE";

export interface OwnerActivationPaymentConfiguration {
  version: string;
  configHash: string;
  currency: "AED";
  approvedMethods: string[];
}

export interface OwnerActivationPaymentBinding {
  method: OwnerActivationPaymentMethod;
  paymentConfigVersion: string;
  paymentConfigHash: string;
}

export interface StoredOwnerActivationPaymentBinding {
  method: string;
  paymentConfigVersion: string;
  paymentConfigHash: string;
}

export interface LockedOwnerActivationSchedule {
  annualContractValue: number;
  mobilizationAmount: number;
}

export class OwnerActivationPaymentPolicyError extends Error {
  constructor(
    readonly reason:
      | "INVALID_METHOD"
      | "DISABLED_METHOD"
      | "INVALID_PROVIDER"
      | "INVALID_CURRENCY"
      | "MISSING_POLICY_BINDING"
      | "STALE_POLICY_BINDING"
      | "MISSING_LOCKED_SCHEDULE"
      | "INVALID_LOCKED_SCHEDULE"
      | "INVALID_SUBMITTED_AMOUNT"
      | "AMOUNT_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "OwnerActivationPaymentPolicyError";
  }
}

const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const PHASE1_OWNER_ACTIVATION_METHODS = new Set<OwnerActivationPaymentMethod>(["CASH", "CHEQUE"]);

export function resolveOwnerActivationPaymentBinding(
  requestData: Record<string, unknown>,
  activeConfiguration: OwnerActivationPaymentConfiguration,
): OwnerActivationPaymentBinding {
  const method = upper(requestData.method);
  if (!method || !/^[A-Z][A-Z_]{1,31}$/.test(method)) {
    throw new OwnerActivationPaymentPolicyError("INVALID_METHOD", "A valid Owner payment method is required.");
  }
  if (upper(requestData.provider) !== "MANUAL") {
    throw new OwnerActivationPaymentPolicyError("INVALID_PROVIDER", "Owner activation accepts approved manual payment evidence only.");
  }
  if (upper(requestData.currency) !== "AED" || activeConfiguration.currency !== "AED") {
    throw new OwnerActivationPaymentPolicyError("INVALID_CURRENCY", "Owner activation payments must use AED.");
  }

  const submittedVersion = text(requestData.paymentConfigVersion);
  const submittedHash = text(requestData.paymentConfigHash);
  if (!submittedVersion || !submittedHash) {
    throw new OwnerActivationPaymentPolicyError(
      "MISSING_POLICY_BINDING",
      "The payment policy binding is missing. Reload the approved payment methods before submitting evidence.",
    );
  }
  if (
    submittedVersion !== activeConfiguration.version ||
    submittedHash !== activeConfiguration.configHash
  ) {
    throw new OwnerActivationPaymentPolicyError(
      "STALE_POLICY_BINDING",
      "The payment policy is stale or invalid. Reload the approved payment methods before submitting evidence.",
    );
  }

  if (
    !activeConfiguration.approvedMethods.includes(method) ||
    !PHASE1_OWNER_ACTIVATION_METHODS.has(method as OwnerActivationPaymentMethod)
  ) {
    throw new OwnerActivationPaymentPolicyError(
      "DISABLED_METHOD",
      "This payment method is not approved for the current Owner activation policy.",
    );
  }

  return {
    method: method as OwnerActivationPaymentMethod,
    paymentConfigVersion: activeConfiguration.version,
    paymentConfigHash: activeConfiguration.configHash,
  };
}

export function resolveStoredOwnerActivationPaymentBinding(
  payment: Record<string, any>,
  activeConfiguration: OwnerActivationPaymentConfiguration,
): StoredOwnerActivationPaymentBinding {
  const manifest = payment.paymentManifest || {};
  const method = upper(payment.paymentMethod || payment.method || manifest.selectedMethod || manifest.method);
  if (!method || !/^[A-Z][A-Z_]{1,31}$/.test(method)) {
    throw new OwnerActivationPaymentPolicyError("INVALID_METHOD", "The stored Owner payment method is invalid.");
  }

  const submittedVersion = text(
    payment.paymentConfigVersion ||
    payment.paymentConfigurationVersion ||
    manifest.configVersion ||
    manifest.paymentConfigVersion,
  );
  const submittedHash = text(
    payment.paymentConfigHash ||
    payment.paymentConfigurationHash ||
    manifest.configHash ||
    manifest.paymentConfigHash,
  );
  if (!submittedVersion || !submittedHash) {
    throw new OwnerActivationPaymentPolicyError(
      "MISSING_POLICY_BINDING",
      "The stored Owner payment policy binding is missing.",
    );
  }
  if (
    submittedVersion !== activeConfiguration.version ||
    submittedHash !== activeConfiguration.configHash
  ) {
    throw new OwnerActivationPaymentPolicyError(
      "STALE_POLICY_BINDING",
      "The stored Owner payment policy binding is stale or invalid.",
    );
  }
  if (!activeConfiguration.approvedMethods.includes(method)) {
    throw new OwnerActivationPaymentPolicyError(
      "DISABLED_METHOD",
      "The stored Owner payment method is not approved by the current policy.",
    );
  }

  return {
    method,
    paymentConfigVersion: activeConfiguration.version,
    paymentConfigHash: activeConfiguration.configHash,
  };
}

const firstPresent = (...values: unknown[]) => values.find(
  (value) => value !== undefined && value !== null && value !== "",
);

export function resolveLockedOwnerActivationSchedule(
  contract: Record<string, any>,
  submittedAmount: unknown,
): LockedOwnerActivationSchedule {
  const annualValue = firstPresent(
    contract.quoteSnapshot?.annualContractValue,
    contract.commercialSchedule?.annualContractValue,
    contract.paymentSchedule?.annualContractValue,
    contract.annualContractValue,
  );
  const lockedDeposit = firstPresent(
    contract.quoteSnapshot?.activationDeposit,
    contract.commercialSchedule?.mobilizationAmount,
    contract.paymentSchedule?.mobilizationAmount,
    contract.activationDeposit,
    contract.mobilizationAmount,
  );

  if (annualValue === undefined || lockedDeposit === undefined) {
    throw new OwnerActivationPaymentPolicyError(
      "MISSING_LOCKED_SCHEDULE",
      "The contract has no locked server payment schedule. Regenerate or migrate the authoritative quote before activation.",
    );
  }

  let annualContractValue: number;
  let mobilizationAmount: number;
  try {
    annualContractValue = normalizeAedMoney(annualValue);
    mobilizationAmount = normalizeAedMoney(lockedDeposit);
  } catch {
    throw new OwnerActivationPaymentPolicyError(
      "INVALID_LOCKED_SCHEDULE",
      "The locked server payment schedule contains an invalid AED amount.",
    );
  }
  if (annualContractValue <= 0 || mobilizationAmount <= 0) {
    throw new OwnerActivationPaymentPolicyError(
      "INVALID_LOCKED_SCHEDULE",
      "The locked server payment schedule must contain positive AED amounts.",
    );
  }

  const expectedMobilization = normalizeAedMoney(annualContractValue * 0.15);
  if (mobilizationAmount !== expectedMobilization) {
    throw new OwnerActivationPaymentPolicyError(
      "INVALID_LOCKED_SCHEDULE",
      "The locked activation deposit does not equal the authoritative 15% AED-cent amount.",
    );
  }

  if (submittedAmount === undefined || submittedAmount === null || submittedAmount === "") {
    throw new OwnerActivationPaymentPolicyError(
      "INVALID_SUBMITTED_AMOUNT",
      "The submitted Owner payment amount is required.",
    );
  }

  let normalizedSubmittedAmount: number;
  try {
    normalizedSubmittedAmount = normalizeAedMoney(submittedAmount);
  } catch {
    throw new OwnerActivationPaymentPolicyError(
      "INVALID_SUBMITTED_AMOUNT",
      "The submitted Owner payment amount must be a finite AED value.",
    );
  }
  if (normalizedSubmittedAmount <= 0) {
    throw new OwnerActivationPaymentPolicyError(
      "INVALID_SUBMITTED_AMOUNT",
      "The submitted Owner payment amount must be positive.",
    );
  }
  if (normalizedSubmittedAmount !== mobilizationAmount) {
    throw new OwnerActivationPaymentPolicyError(
      "AMOUNT_MISMATCH",
      "Submitted amount does not match the locked 15% mobilization deposit.",
    );
  }

  return { annualContractValue, mobilizationAmount };
}
