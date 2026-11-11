import * as admin from "firebase-admin";
import {
  OWNER_COMPLIMENTARY_MONTHS,
  OWNER_INITIAL_CANCELLATION_WINDOW_DAYS,
  formatOwnerInitialCancellationFee,
  ownerCancellationWindowCopy,
  ownerComplimentaryMonthCopy,
  ownerMobilisationRefundCopy,
  OWNER_CONTRACT_AUTO_RENEWAL,
  OWNER_CONTRACT_RENEWAL_REQUIRES_EXPLICIT_CONSENT,
  OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
  OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR,
  OWNER_INITIAL_MOBILISATION_REFUND_POLICY,
} from "./ownerInitialContractPolicy";

export const OWNER_INITIAL_CONTRACT_TERM_MONTHS = 13;
export const OWNER_RENEWAL_CONTRACT_TERM_MONTHS = 12;
export const OWNER_SERVICE_TERM_MONTHS = 12;
export const OWNER_INITIAL_REVIEW_MONTHS = 1;
export const OWNER_CONTRACT_CHANGE_WINDOW_MONTHS = 1;
export const OWNER_CONTRACT_TERM_MONTHS = OWNER_INITIAL_CONTRACT_TERM_MONTHS;

export type OwnerContractCycle = "INITIAL" | "RENEWAL";

export interface OwnerContractTermOptions {
  cycle?: OwnerContractCycle;
  approvalDate?: Date | null;
}

export function addMonthsPreservingTime(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function addDaysPreservingTime(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function asDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    const parsed = new Date(Number(value.seconds) * 1000);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function stampFromDate(date: Date) {
  return admin.firestore.Timestamp.fromDate(date);
}

export function termFieldsFromStart(start: Date, options: OwnerContractTermOptions = {}) {
  const cycle: OwnerContractCycle = options.cycle || "INITIAL";
  const isInitial = cycle === "INITIAL";
  const termMonths = isInitial ? OWNER_INITIAL_CONTRACT_TERM_MONTHS : OWNER_RENEWAL_CONTRACT_TERM_MONTHS;
  const approvalWindowStart = options.approvalDate || start;
  const finish = addMonthsPreservingTime(start, termMonths);
  const firstMonthEnds = addDaysPreservingTime(approvalWindowStart, OWNER_INITIAL_CANCELLATION_WINDOW_DAYS);
  const complimentaryMonthEnds = addMonthsPreservingTime(start, OWNER_COMPLIMENTARY_MONTHS);
  const servicePeriodEnds = isInitial ? addMonthsPreservingTime(complimentaryMonthEnds, OWNER_SERVICE_TERM_MONTHS) : finish;

  const startStamp = stampFromDate(start);
  const finishStamp = stampFromDate(finish);
  const firstMonthStamp = stampFromDate(firstMonthEnds);

  return {
    contractCycle: cycle,
    contractTermMonths: termMonths,
    contractTermLabel: isInitial
      ? `${termMonths} months initial term: ${OWNER_COMPLIMENTARY_MONTHS} complimentary service month + ${OWNER_SERVICE_TERM_MONTHS} months paid service`
      : `${termMonths} months renewal term`,
    initialContractTermMonths: OWNER_INITIAL_CONTRACT_TERM_MONTHS,
    renewalContractTermMonths: OWNER_RENEWAL_CONTRACT_TERM_MONTHS,
    serviceTermMonths: isInitial ? OWNER_SERVICE_TERM_MONTHS : OWNER_RENEWAL_CONTRACT_TERM_MONTHS,
    reviewWindowMonths: isInitial ? OWNER_INITIAL_REVIEW_MONTHS : 0,
    effectiveFrom: startStamp,
    validFrom: startStamp,
    startedAt: startStamp,
    servicePeriodEndsAt: stampFromDate(servicePeriodEnds),
    effectiveTo: finishStamp,
    validTo: finishStamp,
    expiresAt: finishStamp,
    firstMonthWindowStartsAt: stampFromDate(approvalWindowStart),
    firstMonthWindowEndsAt: firstMonthStamp,
    ownerCanRequestPlanChangeUntil: firstMonthStamp,
    ownerCanRequestCancelOrUpgradeUntil: firstMonthStamp,
    complimentaryMonthStartsAt: startStamp,
    complimentaryMonthEndsAt: stampFromDate(complimentaryMonthEnds),
    complimentaryMonthPolicy: isInitial ? {
      policyCode: "OWNER_INITIAL_COMPLIMENTARY_SERVICE_MONTH",
      complimentaryMonths: OWNER_COMPLIMENTARY_MONTHS,
      recurringServiceFeeAed: 0,
      mobilisationStillDue: true,
      appliesToRenewals: false,
      startsAtIso: start.toISOString(),
      endsAtIso: complimentaryMonthEnds.toISOString(),
      noteEn: ownerComplimentaryMonthCopy(false),
      noteAr: ownerComplimentaryMonthCopy(true),
    } : {
      policyCode: "OWNER_RENEWAL_NO_COMPLIMENTARY_MONTH",
      complimentaryMonths: 0,
      appliesToRenewals: false,
    },
    renewalPolicy: {
      firstContractTermMonths: OWNER_INITIAL_CONTRACT_TERM_MONTHS,
      renewalTermMonths: OWNER_RENEWAL_CONTRACT_TERM_MONTHS,
      initialServiceMonths: OWNER_SERVICE_TERM_MONTHS,
      initialReviewMonths: OWNER_INITIAL_REVIEW_MONTHS,
      complimentaryMonths: isInitial ? OWNER_COMPLIMENTARY_MONTHS : 0,
      note: "The first owner contract is 13 months: one complimentary service month plus 12 months of paid service. The contract does not auto-renew; any renewal requires the owner's explicit consent and then runs for 12 months unless changed by written agreement.",
      autoRenewal: OWNER_CONTRACT_AUTO_RENEWAL,
      renewalRequiresExplicitConsent: OWNER_CONTRACT_RENEWAL_REQUIRES_EXPLICIT_CONSENT,
    },
    renewalNoticePolicy: {
      enabled: true,
      noticeDaysBeforeExpiry: [60, 30, 7, 1],
    },
    cancellationUpgradePolicy: {
      policyCode: "OWNER_INITIAL_30_DAY_CANCEL_OR_UPGRADE_WINDOW",
      allowedWindowMonths: OWNER_CONTRACT_CHANGE_WINDOW_MONTHS,
      allowedWindowDays: OWNER_INITIAL_CANCELLATION_WINDOW_DAYS,
      ownerCanRequestCancelOrUpgrade: true,
      requestWindowStartsAtIso: approvalWindowStart.toISOString(),
      requestWindowEndsAtIso: firstMonthEnds.toISOString(),
      cancellationFeeAed: formatOwnerInitialCancellationFee().aed,
      cancellationFeeStatus: formatOwnerInitialCancellationFee().status,
      cancellationFeeDisplayEn: formatOwnerInitialCancellationFee().displayEn,
      cancellationFeeDisplayAr: formatOwnerInitialCancellationFee().displayAr,
      cancellationFeeNatureEn: OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
      cancellationFeeNatureAr: OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR,
      mobilisationRefundPolicy: OWNER_INITIAL_MOBILISATION_REFUND_POLICY,
      mobilisationRefundNoteEn: ownerMobilisationRefundCopy(false),
      mobilisationRefundNoteAr: ownerMobilisationRefundCopy(true),
      autoApproveCancellation: false,
      aiMayApproveMoneyOrContracts: false,
      autoRenewal: OWNER_CONTRACT_AUTO_RENEWAL,
      renewalRequiresExplicitConsent: OWNER_CONTRACT_RENEWAL_REQUIRES_EXPLICIT_CONSENT,
      noteEn: ownerCancellationWindowCopy(false),
      noteAr: ownerCancellationWindowCopy(true),
      note: ownerCancellationWindowCopy(false),
    },
    termSummary: {
      cycle,
      months: termMonths,
      effectiveFromIso: start.toISOString(),
      servicePeriodEndsAtIso: servicePeriodEnds.toISOString(),
      validToIso: finish.toISOString(),
      firstMonthWindowStartsAtIso: approvalWindowStart.toISOString(),
      firstMonthWindowEndsAtIso: firstMonthEnds.toISOString(),
      ownerCanRequestCancelOrUpgradeUntilIso: firstMonthEnds.toISOString(),
      complimentaryMonthEndsAtIso: complimentaryMonthEnds.toISOString(),
      cancellationWindowDays: isInitial ? OWNER_INITIAL_CANCELLATION_WINDOW_DAYS : 0,
      renewalTermMonths: OWNER_RENEWAL_CONTRACT_TERM_MONTHS,
    },
  };
}

export function adminStampFields(adminUid: string) {
  const stamped = new Date();
  const stampedAt = stampFromDate(stamped);
  return {
    binGroupsApproved: true,
    binGroupsApprovedAt: stampedAt,
    binGroupsApprovedAtIso: stamped.toISOString(),
    binGroupsApprovedBy: adminUid || "admin",
    binGroupsApprovalLabel: "BIN GROUP ADMIN APPROVED / DIGITAL STAMP",
    binGroupStamp: {
      stamped: true,
      stampedAt,
      stampedAtIso: stamped.toISOString(),
      stampedBy: adminUid || "admin",
      label: "BIN GROUP ADMIN APPROVED / DIGITAL STAMP",
    },
  };
}
