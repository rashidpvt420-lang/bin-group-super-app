const VOID_MARKERS = ["VOID", "CANCEL", "REJECT"];

export function commissionStatus(row: { status?: unknown; payoutStatus?: unknown }): string {
  return String(row?.status || "").trim().toUpperCase();
}

export function isVoidOrClosedCommission(row: { status?: unknown }): boolean {
  const status = commissionStatus(row);
  return VOID_MARKERS.some((marker) => status.includes(marker));
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
