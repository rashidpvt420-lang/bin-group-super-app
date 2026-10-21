import { useEffect, useState } from 'react';
import { collection, db, limit, onSnapshot, query, where } from '../../lib/firebase';
import { lastPaidInstallment, pickLease } from '../tenantHomeSelectors';
import { nextOpenInstallment, type RentInstallment } from './TenantRentSchedulePanel';

export type Slot<T> = { loading: boolean; error: boolean; data: T };
const start = <T,>(data: T): Slot<T> => ({ loading: true, error: false, data });

export interface TenantHomeExtras {
  lease: Slot<Record<string, any> | null>;
  rent: Slot<RentInstallment | null>;
  lastPaid: RentInstallment | null;
  notices: Slot<Array<Record<string, any> & { id: string }>>;
}

/**
 * Feature 8: real data for the redesigned tenant home (R5) — lease from `leases`, rent from
 * `rent_installments`, and building notices (property-scoped TENANT_NOTICE logs). Each slot has its
 * own loading and error state, so a failed read is shown as an error instead of a silent blank.
 * Read-only; every query is bound to the signed-in tenant or their own building.
 */
export function useTenantHomeExtras(uid: string, propertyId: string, unitLoading: boolean): TenantHomeExtras {
  const [lease, setLease] = useState<TenantHomeExtras['lease']>(start(null));
  const [rentRows, setRentRows] = useState<Slot<RentInstallment[]>>(start([]));
  const [notices, setNotices] = useState<TenantHomeExtras['notices']>(start([]));

  useEffect(() => {
    if (!uid) return undefined;
    const subs = [
      onSnapshot(query(collection(db, 'leases'), where('tenantId', '==', uid), limit(10)),
        (s) => setLease({ loading: false, error: false, data: pickLease(s.docs.map((d) => d.data())) }),
        () => setLease({ loading: false, error: true, data: null })),
      onSnapshot(query(collection(db, 'rent_installments'), where('tenantUid', '==', uid)),
        (s) => setRentRows({ loading: false, error: false, data: s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) }),
        () => setRentRows({ loading: false, error: true, data: [] })),
    ];
    return () => subs.forEach((u) => u());
  }, [uid]);

  useEffect(() => {
    if (unitLoading) return undefined;
    if (!propertyId) { setNotices({ loading: false, error: false, data: [] }); return undefined; }
    return onSnapshot(query(collection(db, 'systemLogs'), where('type', '==', 'TENANT_NOTICE'), where('propertyId', '==', propertyId), limit(2)),
      (s) => setNotices({ loading: false, error: false, data: s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) }),
      () => setNotices({ loading: false, error: true, data: [] }));
  }, [unitLoading, propertyId]);

  return {
    lease,
    rent: { loading: rentRows.loading, error: rentRows.error, data: nextOpenInstallment(rentRows.data) },
    lastPaid: lastPaidInstallment(rentRows.data) as RentInstallment | null,
    notices,
  };
}
