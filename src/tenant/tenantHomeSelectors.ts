/** Pure selectors for the tenant home screen (feature 8). */
const OPEN_DONE = new Set(['COMPLETED', 'CLOSED', 'RESOLVED', 'CANCELLED', 'DONE']);
export function pickLease(leases: any[]): any {
  return [...leases].filter((l) => l.leaseEndDate || l.endDate).sort((a, b) => String(b.leaseEndDate || b.endDate).localeCompare(String(a.leaseEndDate || a.endDate)))[0] || null;
}
export function pickActiveTicket(tickets: any[]): any {
  const ms = (v: any) => (v?.toMillis ? v.toMillis() : Date.parse(String(v || '')) || 0);
  return [...tickets].filter((t) => !OPEN_DONE.has(String(t.status || '').toUpperCase())).sort((a, b) => ms(b.updatedAt || b.createdAt) - ms(a.updatedAt || a.createdAt))[0] || null;
}

/** Latest PAID instalment (by due date), so the rent card can say "Paid" with its receipt number. */
export function lastPaidInstallment<T extends { status?: string; dueDate?: string }>(items: T[]): T | null {
  return [...items].filter((i) => i.status === 'PAID').sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)))[0] || null;
}
