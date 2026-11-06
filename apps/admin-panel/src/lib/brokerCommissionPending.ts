/**
 * Admin commission hub pending total.
 * Kept aligned with src/broker/commissionTotals.ts: VOID, voided, and voidReason
 * rows are not pending money. The launch test checks the two totals agree.
 */
const VOID_MARKERS = ["VOID", "CANCEL", "REJECT"];

function markerHit(value: unknown): boolean {
  const status = String(value ?? "").trim().toUpperCase();
  return VOID_MARKERS.some((marker) => status.includes(marker));
}

export function isVoidCommission(row: { status?: unknown; payoutStatus?: unknown; settlementStatus?: unknown; voided?: unknown; isVoid?: unknown; voidReason?: unknown }): boolean {
  if (row?.voided === true || row?.isVoid === true) return true;
  if (String(row?.voidReason ?? "").trim()) return true;
  return markerHit(row?.status) || markerHit(row?.payoutStatus) || markerHit(row?.settlementStatus);
}

export function pendingSettlementAmount(rows: Array<{ status?: unknown; payoutStatus?: unknown; settlementStatus?: unknown; voided?: unknown; isVoid?: unknown; voidReason?: unknown; amount?: unknown; commissionAmount?: unknown }>): number {
  return rows.reduce((sum, row) => {
    if (isVoidCommission(row)) return sum;
    if (String(row?.status ?? "").trim().toUpperCase() !== "PENDING") return sum;
    const amount = Number(row.amount ?? row.commissionAmount ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}
