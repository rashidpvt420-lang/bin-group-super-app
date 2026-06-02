import * as admin from "firebase-admin";

export const OWNER_CONTRACT_TERM_MONTHS = 13;
export const OWNER_CONTRACT_CHANGE_WINDOW_MONTHS = 1;

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

export function termFieldsFromStart(start: Date) {
  const finish = addMonthsPreservingTime(start, OWNER_CONTRACT_TERM_MONTHS);
  const firstMonthEnds = addMonthsPreservingTime(start, OWNER_CONTRACT_CHANGE_WINDOW_MONTHS);
  const startStamp = stampFromDate(start);
  const finishStamp = stampFromDate(finish);
  const firstMonthStamp = stampFromDate(firstMonthEnds);

  return {
    contractTermMonths: OWNER_CONTRACT_TERM_MONTHS,
    contractTermLabel: `${OWNER_CONTRACT_TERM_MONTHS} months`,
    effectiveFrom: startStamp,
    validFrom: startStamp,
    startedAt: startStamp,
    effectiveTo: finishStamp,
    validTo: finishStamp,
    expiresAt: finishStamp,
    firstMonthWindowEndsAt: firstMonthStamp,
    ownerCanRequestPlanChangeUntil: firstMonthStamp,
    ownerCanRequestCancelOrUpgradeUntil: firstMonthStamp,
    cancellationUpgradePolicy: {
      policyCode: "OWNER_FIRST_MONTH_CANCEL_OR_UPGRADE_WINDOW",
      allowedWindowMonths: OWNER_CONTRACT_CHANGE_WINDOW_MONTHS,
      ownerCanRequestCancelOrUpgrade: true,
      requestWindowStartsAtIso: start.toISOString(),
      requestWindowEndsAtIso: firstMonthEnds.toISOString(),
      note: "Owner may request cancellation, contract correction, or package upgrade within the first month from the digital signature timestamp. Admin approval is required before any change takes effect.",
    },
    termSummary: {
      months: OWNER_CONTRACT_TERM_MONTHS,
      effectiveFromIso: start.toISOString(),
      validToIso: finish.toISOString(),
      firstMonthWindowEndsAtIso: firstMonthEnds.toISOString(),
      ownerCanRequestCancelOrUpgradeUntilIso: firstMonthEnds.toISOString(),
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
