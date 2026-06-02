import * as admin from "firebase-admin";

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
  const firstMonthEnds = addMonthsPreservingTime(approvalWindowStart, OWNER_CONTRACT_CHANGE_WINDOW_MONTHS);
  const servicePeriodEnds = isInitial ? addMonthsPreservingTime(start, OWNER_SERVICE_TERM_MONTHS) : finish;

  const startStamp = stampFromDate(start);
  const finishStamp = stampFromDate(finish);
  const firstMonthStamp = stampFromDate(firstMonthEnds);

  return {
    contractCycle: cycle,
    contractTermMonths: termMonths,
    contractTermLabel: isInitial
      ? `${termMonths} months initial term: ${OWNER_SERVICE_TERM_MONTHS} months service + ${OWNER_INITIAL_REVIEW_MONTHS} month real-time review window`
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
    renewalPolicy: {
      firstContractTermMonths: OWNER_INITIAL_CONTRACT_TERM_MONTHS,
      renewalTermMonths: OWNER_RENEWAL_CONTRACT_TERM_MONTHS,
      initialServiceMonths: OWNER_SERVICE_TERM_MONTHS,
      initialReviewMonths: OWNER_INITIAL_REVIEW_MONTHS,
      note: "The first owner contract is 13 months. Renewals after the first term run for 12 months unless changed by written agreement.",
    },
    renewalNoticePolicy: {
      enabled: true,
      noticeDaysBeforeExpiry: [60, 30, 7, 1],
    },
    cancellationUpgradePolicy: {
      policyCode: "OWNER_FIRST_MONTH_CANCEL_OR_UPGRADE_WINDOW",
      allowedWindowMonths: OWNER_CONTRACT_CHANGE_WINDOW_MONTHS,
      ownerCanRequestCancelOrUpgrade: true,
      requestWindowStartsAtIso: approvalWindowStart.toISOString(),
      requestWindowEndsAtIso: firstMonthEnds.toISOString(),
      note: "Owner may request cancellation, contract correction, or package upgrade within the first month from BIN GROUP approval/signature activation. Admin approval is required before any change takes effect.",
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
