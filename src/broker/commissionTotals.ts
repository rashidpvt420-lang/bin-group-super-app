const VOID_MARKERS = ["VOID", "CANCEL", "REJECT"];

function markerHit(value: unknown): boolean {
  const status = String(value ?? "").trim().toUpperCase();
  return VOID_MARKERS.some((marker) => status.includes(marker));
}

export function commissionStatus(row: { status?: unknown; payoutStatus?: unknown; settlementStatus?: unknown; voided?: unknown; isVoid?: unknown; voidReason?: unknown }): string {
  if (row?.voided === true || row?.isVoid === true) return "VOID";
  if (String(row?.voidReason ?? "").trim()) return "VOID";
  if (markerHit(row?.payoutStatus) || markerHit(row?.settlementStatus)) {
    return String(row?.payoutStatus || row?.settlementStatus || "VOID").trim().toUpperCase();
  }
  return String(row?.status || "").trim().toUpperCase();
}

export function isVoidOrClosedCommission(row: { status?: unknown; payoutStatus?: unknown; settlementStatus?: unknown; voided?: unknown; isVoid?: unknown; voidReason?: unknown }): boolean {
  return markerHit(commissionStatus(row)) || markerHit(row?.status) || markerHit(row?.payoutStatus) || markerHit(row?.settlementStatus) || row?.voided === true || row?.isVoid === true || Boolean(String(row?.voidReason ?? "").trim());
}

/** Pending settlement is status PENDING only. VOID, cancelled, rejected and paid rows are not money waiting. */
export function pendingSettlementAmount(rows: Array<{ status?: unknown; amount?: unknown; commissionAmount?: unknown }>): number {
  return rows.reduce((sum, row) => {
    if (commissionStatus(row) !== "PENDING") return sum;
    if (isVoidOrClosedCommission(row)) return sum;
    const amount = Number(row.amount ?? row.commissionAmount ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

export function paidCommissionAmount(rows: Array<{ status?: unknown; amount?: unknown; commissionAmount?: unknown }>): number {
  return rows.reduce((sum, row) => {
    if (commissionStatus(row) !== "PAID") return sum;
    const amount = Number(row.amount ?? row.commissionAmount ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}
