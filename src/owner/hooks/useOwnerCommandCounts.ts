import React from 'react';
import { collection, db, limit, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';

type OwnerCommandCounts = {
  loading: boolean;
  pendingCostApprovals: number;
  highRiskTickets: number;
  openDisputes: number;
  expiringDocuments: number;
  monthlyCostVariancePct: number | null;
};

const OPEN_TICKET_STATUSES = new Set(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_ASSIGNMENT', 'WAITING_FOR_TECHNICIAN', 'ON_SITE']);
const HIGH_RISK_PRIORITIES = new Set(['EMERGENCY', 'HIGH', 'emergency', 'urgent', 'high']);
const PENDING_APPROVAL_STATUSES = new Set(['PENDING', 'pending', 'REQUESTED', 'requested', 'OPEN', 'open']);

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function ticketCost(ticket: any): number {
  const values = [ticket?.finalCost, ticket?.invoiceAmount, ticket?.approvedCost, ticket?.actualCost, ticket?.cost];
  for (const value of values) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function monthlyCostVariance(rows: any[]): number | null {
  const now = new Date();
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  let current = 0;
  let previous = 0;

  rows.forEach((ticket) => {
    const amount = ticketCost(ticket);
    if (amount <= 0) return;
    const when = toMillis(ticket?.resolvedAt || ticket?.completedAt || ticket?.updatedAt || ticket?.createdAt);
    if (when === null) return;
    if (when >= currentStart) current += amount;
    else if (when >= previousStart && when < currentStart) previous += amount;
  });

  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function useOwnerCommandCounts(): OwnerCommandCounts {
  const { user } = useRole();
  const [counts, setCounts] = React.useState<OwnerCommandCounts>({
    loading: true,
    pendingCostApprovals: 0,
    highRiskTickets: 0,
    openDisputes: 0,
    expiringDocuments: 0,
    monthlyCostVariancePct: null,
  });

  React.useEffect(() => {
    const ownerId = user?.uid;
    if (!ownerId) {
      setCounts((current) => ({ ...current, loading: false }));
      return undefined;
    }

    const partial: Partial<OwnerCommandCounts> = {};
    const publish = () => setCounts((current) => ({ ...current, ...partial, loading: false }));

    const unsubs: Array<() => void> = [];

    try {
      unsubs.push(onSnapshot(query(collection(db, 'owner_approval_requests'), where('ownerId', '==', ownerId), limit(100)), (snap) => {
        partial.pendingCostApprovals = snap.docs.filter((docSnap) => PENDING_APPROVAL_STATUSES.has(String(docSnap.data()?.status || 'PENDING'))).length;
        publish();
      }, (err) => {
        console.warn('[OwnerCommandCounts] approval requests listener failed:', err);
        partial.pendingCostApprovals = 0;
        publish();
      }));
    } catch (err) {
      console.warn('[OwnerCommandCounts] approval requests query failed:', err);
    }

    try {
      unsubs.push(onSnapshot(query(collection(db, 'maintenanceTickets'), where('ownerId', '==', ownerId), limit(150)), (snap) => {
        const rows = snap.docs.map((docSnap) => docSnap.data());
        const openRows = rows.filter((ticket) => OPEN_TICKET_STATUSES.has(String(ticket?.status || 'OPEN')) || OPEN_TICKET_STATUSES.has(String(ticket?.trackingStatus || '')));
        partial.highRiskTickets = openRows.filter((ticket) => HIGH_RISK_PRIORITIES.has(String(ticket?.slaPriority || ticket?.priority || ''))).length;
        partial.openDisputes = openRows.filter((ticket) => String(ticket?.status || '').toUpperCase().includes('DISPUT') || String(ticket?.evidenceStatus || '').toUpperCase().includes('DISPUT')).length;
        partial.monthlyCostVariancePct = monthlyCostVariance(rows);
        publish();
      }, (err) => {
        console.warn('[OwnerCommandCounts] ticket listener failed:', err);
        partial.highRiskTickets = 0;
        partial.openDisputes = 0;
        partial.monthlyCostVariancePct = null;
        publish();
      }));
    } catch (err) {
      console.warn('[OwnerCommandCounts] ticket query failed:', err);
    }

    try {
      unsubs.push(onSnapshot(query(collection(db, 'owner_documents'), where('ownerId', '==', ownerId), limit(100)), (snap) => {
        const now = Date.now();
        const next30Days = now + 30 * 24 * 60 * 60 * 1000;
        partial.expiringDocuments = snap.docs.filter((docSnap) => {
          const data = docSnap.data();
          const expiry = data?.expiryDate || data?.expiresAt || data?.validTo;
          const ms = toMillis(expiry) ?? 0;
          return Number.isFinite(ms) && ms >= now && ms <= next30Days;
        }).length;
        publish();
      }, (err) => {
        console.warn('[OwnerCommandCounts] document listener failed:', err);
        partial.expiringDocuments = 0;
        publish();
      }));
    } catch (err) {
      console.warn('[OwnerCommandCounts] document query failed:', err);
    }

    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.uid]);

  return counts;
}
