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

/** Settlement column: VOID rows are never shown as AVAILABLE or settleable. */
export function settlementLabel(row: { status?: unknown; payoutStatus?: unknown; settlementStatus?: unknown; voided?: unknown; isVoid?: unknown; voidReason?: unknown }): string {
  if (isVoidOrClosedCommission(row) || String(row?.status || "").toUpperCase() === "VOID") {
    return "VOID — not settleable";
  }
  const payout = String(row?.payoutStatus || row?.settlementStatus || "").trim();
  if (!payout) return "NOT REQUESTED";
  return payout.replaceAll("_", " ").toUpperCase();
}

export function settlementLabelLocalized(row: Parameters<typeof settlementLabel>[0], lang: "en" | "ar" = "en"): string {
  const value = settlementLabel(row);
  if (value === "VOID — not settleable") {
    return lang === "ar" ? "ملغاة — غير قابلة للتسوية" : value;
  }
  if (value === "NOT REQUESTED") {
    return lang === "ar" ? "لم يُطلب" : value;
  }
  return value;
}
