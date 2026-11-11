const VOID_MARKERS = ['VOID', 'CANCEL', 'REJECT'];

function markerHit(value: unknown): boolean {
  const status = String(value ?? '').trim().toUpperCase();
  return VOID_MARKERS.some((marker) => status.includes(marker));
}

export function isVoidOrClosedCommission(row: { status?: unknown; payoutStatus?: unknown; settlementStatus?: unknown; voided?: unknown; isVoid?: unknown; voidReason?: unknown }): boolean {
  return markerHit(row?.status) || markerHit(row?.payoutStatus) || markerHit(row?.settlementStatus) || row?.voided === true || row?.isVoid === true || Boolean(String(row?.voidReason ?? '').trim());
}

export function commissionAmount(row: { amount?: unknown; commissionAmount?: unknown }): number {
  const amount = Number(row.amount ?? row.commissionAmount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function commissionTotalsExcludingVoid(rows: Array<{ status?: unknown; payoutStatus?: unknown; settlementStatus?: unknown; voided?: unknown; isVoid?: unknown; voidReason?: unknown; amount?: unknown; commissionAmount?: unknown }>) {
  const included = rows.filter((row) => !isVoidOrClosedCommission(row));
  const voidCount = rows.length - included.length;
  const pending = included.filter((row) => String(row.status || '').toUpperCase() === 'PENDING').reduce((sum, row) => sum + commissionAmount(row), 0);
  const approved = included.filter((row) => String(row.status || '').toUpperCase() === 'APPROVED').reduce((sum, row) => sum + commissionAmount(row), 0);
  const paid = included.filter((row) => String(row.status || '').toUpperCase() === 'PAID').reduce((sum, row) => sum + commissionAmount(row), 0);
  return { pending, approved, paid, voidCount, includedCount: included.length, totalCount: rows.length };
}
