export interface ResolvedTenantLedgerRow {
  id: string;
  name: string;
  property: string;
  unit: string;
  status: string;
  due: number;
  paid: number;
  balance: number;
  overdueDays: number;
  lastPaymentDate: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
}

export interface TenantLedgerSummary {
  totalUnits: number;
  activeTenants: number;
  pendingTenants: number;
  vacantUnits: number;
  totalRentDue: number;
  totalRentPaid: number;
  totalRentBalance: number;
  collectionRate: number;
  ledgerRows: ResolvedTenantLedgerRow[];
}

function toNumber(value: any, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function statusNormalized(value: any, fallback = 'PENDING') {
  return String(value || fallback).trim().toUpperCase().replace(/\s+/g, '_');
}

function tenantDisplayName(item: any) {
  return item.tenantName || item.displayName || item.name || item.fullName || item.tenantEmail || 'Tenant';
}

function propertyDisplayName(item: any, properties: any[]) {
  const propertyId = String(item.propertyId || item.propertyUid || '');
  const property = properties.find((p) => String(p.id || p.propertyId) === propertyId);
  return item.propertyName || property?.propertyName || property?.name || 'Property';
}

function getDaysDifference(dateVal: any): number {
  if (!dateVal) return 0;
  let d: Date;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else if (typeof dateVal === 'string') {
    d = new Date(dateVal);
  } else if (typeof dateVal === 'object' && (dateVal.seconds || dateVal._seconds)) {
    d = new Date((dateVal.seconds || dateVal._seconds) * 1000);
  } else {
    return 0;
  }

  if (isNaN(d.getTime())) return 0;
  const now = new Date();
  if (d >= now) return 0;
  const diffTime = Math.abs(now.getTime() - d.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function uniqBy(items: any[], keyFn: (item: any) => string) {
  const map = new Map<string, any>();
  for (const item of items) {
    const key = keyFn(item);
    if (key) map.set(key, item);
  }
  return Array.from(map.values());
}

export function resolveTenantLedger(
  properties: any[],
  occupancies: any[],
  invitations: any[],
  leases: any[],
  ledger: any[],
  payments: any[]
): TenantLedgerSummary {
  const ACTIVE_TENANT_STATUSES = new Set(['ACCEPTED', 'ACTIVE', 'SIGNED', 'OCCUPIED']);
  const PENDING_TENANT_STATUSES = new Set(['PENDING', 'INVITED', 'SENT', 'PENDING_AUTH_CREATION']);

  const totalUnits = properties.reduce((sum, p) => {
    return sum + toNumber(p.units || p.numberOfUnits || p.totalUnits || p.unitsCount, 0);
  }, 0);

  const activeTenants = occupancies.filter((item) =>
    ACTIVE_TENANT_STATUSES.has(statusNormalized(item.occupancyStatus || item.status))
  ).length;

  const pendingTenants = invitations.filter((item) =>
    PENDING_TENANT_STATUSES.has(statusNormalized(item.invitationStatus || item.status))
  ).length;

  const vacantUnits = Math.max(0, totalUnits - activeTenants);

  // Group raw items to form rows
  const rawRows = uniqBy(
    [...occupancies, ...leases, ...ledger],
    (item) => item.tenantUid || item.tenantId || item.tenantEmail || item.id || item.leaseId || ''
  );

  const ledgerRows: ResolvedTenantLedgerRow[] = rawRows.map((item) => {
    const due = toNumber(item.rentDue || item.amountDue || item.annualRent || item.totalRent || item.rentAmount, 0);
    const paid = toNumber(item.rentPaid || item.amountPaid || item.paidAmount || item.collectedAmount, 0);
    const balance = Math.max(0, due - paid);
    
    // Attempt to determine overdue days
    const dueDate = item.dueDate || item.paymentDueDate || item.nextDueDate || item.leaseEndDate || item.endDate;
    const overdueDays = balance > 0 ? getDaysDifference(dueDate) : 0;

    let lastPaymentDate: string | null = null;
    const itemLastPay = item.lastPaymentDate || item.paymentDate || item.lastPaidAt;
    if (itemLastPay) {
      if (typeof itemLastPay === 'string') {
        lastPaymentDate = itemLastPay;
      } else if (itemLastPay.seconds || itemLastPay._seconds) {
        lastPaymentDate = new Date((itemLastPay.seconds || itemLastPay._seconds) * 1000).toLocaleDateString('en-GB');
      }
    }

    const leaseStart = item.leaseStart || item.startDate || item.leaseStartDate || null;
    const leaseEnd = item.leaseEnd || item.endDate || item.leaseEndDate || null;

    return {
      id: item.id || item.leaseId || `${item.propertyId}-${item.unitId}`,
      name: tenantDisplayName(item),
      property: propertyDisplayName(item, properties),
      unit: item.unitNumber || item.unitId || '—',
      status: statusNormalized(item.occupancyStatus || item.leaseStatus || item.status, 'ACTIVE'),
      due,
      paid,
      balance,
      overdueDays,
      lastPaymentDate,
      leaseStart: leaseStart ? (typeof leaseStart === 'string' ? leaseStart : new Date((leaseStart.seconds || leaseStart._seconds) * 1000).toLocaleDateString('en-GB')) : null,
      leaseEnd: leaseEnd ? (typeof leaseEnd === 'string' ? leaseEnd : new Date((leaseEnd.seconds || leaseEnd._seconds) * 1000).toLocaleDateString('en-GB')) : null,
    };
  });

  const totalRentDue = ledgerRows.reduce((sum, r) => sum + r.due, 0);
  const totalRentPaid = ledgerRows.reduce((sum, r) => sum + r.paid, 0);
  const totalRentBalance = ledgerRows.reduce((sum, r) => sum + r.balance, 0);
  const collectionRate = totalRentDue > 0 ? Math.round((totalRentPaid / totalRentDue) * 100) : 0;

  return {
    totalUnits,
    activeTenants,
    pendingTenants,
    vacantUnits,
    totalRentDue,
    totalRentPaid,
    totalRentBalance,
    collectionRate,
    ledgerRows,
  };
}
