import * as admin from "firebase-admin";

export const OWNER_CONTRACT_TERM_MONTHS = 13;

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
  const firstMonthEnds = addMonthsPreservingTime(start, 1);
  const startStamp = stampFromDate(start);
  const finishStamp = stampFromDate(finish);
  const firstMonthStamp = stampFromDate(firstMonthEnds);
  return {
    contractTermMonths: OWNER_CONTRACT_TERM_MONTHS,
    effectiveFrom: startStamp,
    validFrom: startStamp,
    startedAt: startStamp,
    effectiveTo: finishStamp,
    validTo: finishStamp,
    expiresAt: finishStamp,
    firstMonthWindowEndsAt: firstMonthStamp,
    ownerCanRequestPlanChangeUntil: firstMonthStamp,
    termSummary: {
      months: OWNER_CONTRACT_TERM_MONTHS,
      effectiveFromIso: start.toISOString(),
      validToIso: finish.toISOString(),
      firstMonthWindowEndsAtIso: firstMonthEnds.toISOString(),
    },
  };
}

export function adminStampFields(adminUid: string) {
  const stamped = new Date();
  const stampedAt = stampFromDate(stamped);
  return {
    binGroupsApproved: true,
    binGroupsApprovedAt: stampedAt,
    binGroupStamp: {
      stamped: true,
      stampedAt,
      stampedAtIso: stamped.toISOString(),
      stampedBy: adminUid || "admin",
      label: "BIN GROUP ADMIN APPROVED / DIGITAL STAMP",
    },
  };
}
