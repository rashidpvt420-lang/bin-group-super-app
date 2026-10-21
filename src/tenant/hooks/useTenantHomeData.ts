import { useEffect, useState } from 'react';
import { db, collection, query, where, limit, getDocs, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';

const CLOSED = new Set(['CLOSED', 'COMPLETED', 'CANCELLED', 'CANCELED', 'RESOLVED']);

export interface TenantHomeData {
  unitLoading: boolean;
  unit: Record<string, any> | null;
  ticketsLoading: boolean;
  ticketsError: boolean;
  activeTickets: Array<Record<string, any> & { id: string }>;
}

/**
 * Read-only data for the redesigned tenant home (REDESIGN.md R5). Same identity-bound reads as
 * TenantDashboardLightPage: unit by tenantId then verified email, tickets by tenantId/tenantUid/createdByUid.
 */
export function useTenantHomeData(): TenantHomeData {
  const { user } = useRole();
  const [unitLoading, setUnitLoading] = useState(true);
  const [unit, setUnit] = useState<Record<string, any> | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState(false);
  const [activeTickets, setActiveTickets] = useState<TenantHomeData['activeTickets']>([]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        let snap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
        if (snap.empty && user.email) snap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', user.email.toLowerCase()), limit(1)));
        if (!cancelled) setUnit(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch {
        if (!cancelled) setUnit(null);
      } finally {
        if (!cancelled) setUnitLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid, user?.email]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const buckets: Record<string, any[]> = {};
    const ok = new Set<string>();
    const failed = new Set<string>();
    const keys = ['tenantId', 'tenantUid', 'createdByUid'];
    const publish = () => {
      const map = new Map<string, any>();
      Object.values(buckets).flat().forEach((t) => { if (t?.id && !CLOSED.has(String(t.status || '').toUpperCase())) map.set(t.id, t); });
      setActiveTickets(Array.from(map.values()));
    };
    const unsubs = keys.map((key) => onSnapshot(query(collection(db, 'maintenanceTickets'), where(key, '==', user.uid), limit(12)), (snap) => {
      ok.add(key); failed.delete(key);
      buckets[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      publish(); setTicketsError(false); setTicketsLoading(false);
    }, () => {
      failed.add(key);
      if (failed.size === keys.length && ok.size === 0) { setTicketsError(true); setTicketsLoading(false); }
    }));
    return () => unsubs.forEach((u) => u());
  }, [user?.uid]);

  return { unitLoading, unit, ticketsLoading, ticketsError, activeTickets };
}

export function leaseEndMs(unit: Record<string, any> | null): number | null {
  const v = unit?.leaseEndDate ?? unit?.contractEndDate ?? unit?.leaseEnd ?? null;
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}
