import React from 'react';
import { collection, db, limit, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import {
  countOwnerHighRiskTickets,
  countOwnerOpenTickets,
  isOwnerOpenTicket,
} from '../utils/ownerTicketAttentionCounts';
import { countOwnerPendingSignOffs } from '../utils/ownerPendingSignOff';

type OwnerCommandCounts = {
  loading: boolean;
  pendingCostApprovals: number;
  pendingTicketSignOffs: number;
  /** Open maintenance tickets — same status set as advanced "Open Maintenance Tasks". */
  openTickets: number;
  /** Open tickets with emergency/critical/high/urgent priority (subset of openTickets). */
  highRiskTickets: number;
  openDisputes: number;
  expiringDocuments: number;
  monthlyCostVariancePct: number | null;
  /** Feature 9: sources whose listener failed; their counts are NOT real zeros. */
  failedSources?: string[];
};

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
    pendingTicketSignOffs: 0,
    openTickets: 0,
    highRiskTickets: 0,
    openDisputes: 0,
    expiringDocuments: 0,
    monthlyCostVariancePct: null,
    failedSources: [],
  });

  React.useEffect(() => {
    const ownerId = user?.uid;
    if (!ownerId) {
      setCounts((current) => ({ ...current, loading: false }));
      return undefined;
    }

    const partial: Partial<OwnerCommandCounts> & {
      _pendingCostRequests?: number;
      _pendingTicketSignOffs?: number;
    } = {};
    const failed = new Set<string>();
    const publish = () => {
      const pendingCostRequests = Number(partial._pendingCostRequests || 0);
      const pendingTicketSignOffs = Number(partial._pendingTicketSignOffs || 0);
      setCounts((current) => ({
        ...current,
        ...partial,
        failedSources: Array.from(failed),
        pendingTicketSignOffs,
        // Command-strip "approvals" = quote/cost requests + ticket sign-offs awaiting Approve & Close.
        pendingCostApprovals: pendingCostRequests + pendingTicketSignOffs,
        loading: false,
      }));
    };

    const unsubs: Array<() => void> = [];

    try {
      unsubs.push(onSnapshot(query(collection(db, 'owner_approval_requests'), where('ownerId', '==', ownerId), limit(100)), (snap) => {
        partial._pendingCostRequests = snap.docs.filter((docSnap) => PENDING_APPROVAL_STATUSES.has(String(docSnap.data()?.status || 'PENDING'))).length;
        publish();
      }, (err) => {
        console.warn('[OwnerCommandCounts] approval requests listener failed:', err);
        failed.add('approvals');
        partial._pendingCostRequests = 0;
        publish();
      }));
    } catch (err) {
      console.warn('[OwnerCommandCounts] approval requests query failed:', err);
    }

    try {
      unsubs.push(onSnapshot(query(collection(db, 'maintenanceTickets'), where('ownerId', '==', ownerId), limit(150)), (snap) => {
        const rows = snap.docs.map((docSnap) => docSnap.data());
        const openRows = rows.filter(isOwnerOpenTicket);
        // openTickets matches advanced Open Maintenance Tasks; highRisk is the priority subset.
        partial.openTickets = countOwnerOpenTickets(rows);
        partial.highRiskTickets = countOwnerHighRiskTickets(rows);
        partial.openDisputes = openRows.filter((ticket) => String(ticket?.status || '').toUpperCase().includes('DISPUT') || String(ticket?.evidenceStatus || '').toUpperCase().includes('DISPUT')).length;
        partial.monthlyCostVariancePct = monthlyCostVariance(rows);
        partial._pendingTicketSignOffs = countOwnerPendingSignOffs(rows);
        publish();
      }, (err) => {
        console.warn('[OwnerCommandCounts] ticket listener failed:', err);
        failed.add('tickets');
        partial.openTickets = 0;
        partial.highRiskTickets = 0;
        partial.openDisputes = 0;
        partial.monthlyCostVariancePct = null;
        partial._pendingTicketSignOffs = 0;
        publish();
      }));
    } catch (err) {
      console.warn('[OwnerCommandCounts] ticket query failed:', err);
    }

    // Expiring-documents count is intentionally NOT read here any more. It used to
    // listen to `owner_documents`, a collection with no Firestore rule (every read was
    // denied, which put a permanent "documents" failure banner on Owner Home). The only
    // owner-readable document source is the `listUnifiedDocumentVault` callable, and
    // its artifacts carry no expiry date, so there is no truthful count to show.
    // `expiringDocuments` therefore stays 0 and the tile is hidden - never a fake number.

    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.uid]);

  return counts;
}
