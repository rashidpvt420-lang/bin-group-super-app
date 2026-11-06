const PENDING_APPROVAL_STATUSES = new Set(["PENDING", "REQUESTED", "OPEN"]);

/** Quote/cost requests still waiting for an owner decision. Matches the Approvals page list. */
export function isPendingOwnerCostApproval(data: { status?: unknown; decision?: unknown } | null | undefined): boolean {
  if (!data) return false;
  if (String(data.decision || "").trim()) return false;
  const status = String(data.status || "PENDING").trim().toUpperCase();
  if (["APPROVED", "REJECTED", "CLOSED", "CANCELLED", "VOID", "VOIDED", "EMERGENCY_APPROVED"].includes(status)) return false;
  return PENDING_APPROVAL_STATUSES.has(status);
}
