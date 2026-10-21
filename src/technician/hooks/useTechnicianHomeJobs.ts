import { useEffect, useState } from 'react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { ALL_TECHNICIAN_ACTIVE_STATUSES } from '../../shared-exports';
import { sortHomeJobs, toMs, isStartOfDay, type HomeJob } from '../utils/technicianHomeJobs';

const ACTIVE = new Set(ALL_TECHNICIAN_ACTIVE_STATUSES.map(String));
const DONE = new Set(['completed', 'COMPLETED', 'closed', 'CLOSED', 'resolved', 'RESOLVED', 'pending_tenant_approval', 'PENDING_TENANT_APPROVAL']);

export interface TechnicianHomeJobs { loading: boolean; error: boolean; active: HomeJob[]; doneToday: number }

/**
 * Same identity-bound read as TechnicianJobsPage (assignedTechnicianId == uid, no composite index),
 * split client-side into active jobs and jobs finished today.
 */
export function useTechnicianHomeJobs(): TechnicianHomeJobs {
  const { user } = useRole();
  const [state, setState] = useState<TechnicianHomeJobs>({ loading: true, error: false, active: [], doneToday: 0 });
  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'maintenanceTickets'), where('assignedTechnicianId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HomeJob));
      const active = sortHomeJobs(all.filter((j) => ACTIVE.has(String(j.status || ''))));
      const doneToday = all.filter((j) => DONE.has(String(j.status || '')) && isStartOfDay(toMs(j.completedAt) ?? toMs(j.updatedAt) ?? 0)).length;
      setState({ loading: false, error: false, active, doneToday });
    }, () => setState({ loading: false, error: true, active: [], doneToday: 0 }));
  }, [user?.uid]);
  return state;
}
