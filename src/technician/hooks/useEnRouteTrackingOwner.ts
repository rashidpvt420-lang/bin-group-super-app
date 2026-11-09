import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { collection, db } from '../../lib/firebase';
import { ALL_TECHNICIAN_ACTIVE_STATUSES, onSnapshotSplitIn } from '../../shared-exports';
import {
  getActiveTrackingTicketId, getJobPageTrackingOwner, startLiveTracking, stopLiveTracking, subscribeJobPageTrackingOwner,
} from '../../utils/liveTracking';
import { decideShellTracking } from '../utils/enRouteTrackingPolicy';

/**
 * P1-6: keeps live GPS running while any assigned job is EN_ROUTE, across Home, Jobs, HR and every
 * other technician screen. Leaving the job page no longer stops tracking; it stops when the job
 * leaves EN_ROUTE (arrived, cancelled, reassigned), on sign-out, or when the technician shell closes.
 * Browser builds still track only while the app is in the foreground.
 */
export function useEnRouteTrackingOwner(uid: string | null | undefined) {
  const [jobs, setJobs] = useState<Array<{ id: string; status?: unknown }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const [tick, setTick] = useState(0);
  const pageOwner = useSyncExternalStore(subscribeJobPageTrackingOwner, getJobPageTrackingOwner, () => null);
  const busy = useRef(false);

  useEffect(() => {
    setJobs([]);
    setLoaded(false);
    if (!uid) return undefined;
    return onSnapshotSplitIn(
      collection(db, 'maintenanceTickets'),
      { field: 'assignedTechnicianId', value: uid },
      'status',
      ALL_TECHNICIAN_ACTIVE_STATUSES,
      (rows: any[]) => { setJobs(rows.map((row) => ({ id: row.id, status: row.status }))); setLoaded(true); },
      () => setLoaded(false),
    );
  }, [uid]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!uid || busy.current) return;
    const decision = decideShellTracking({ loaded, jobs, activeTicketId: getActiveTrackingTicketId(), pageOwnerTicketId: pageOwner, online });
    if (decision.action === 'none') return;
    busy.current = true;
    const run = decision.action === 'start'
      ? startLiveTracking(decision.ticketId, uid, () => undefined, () => undefined)
      : stopLiveTracking(uid, decision.ticketId, 'PRESERVE').then(() => undefined);
    run.catch((error) => console.warn('[Tracking] Shell tracking step failed:', error?.message || error))
      .finally(() => { busy.current = false; setTick((value) => value + 1); });
  }, [uid, loaded, jobs, pageOwner, online, tick]);

  // The shell closing (sign-out or leaving the technician portal) ends the browser watch.
  useEffect(() => () => {
    if (uid && getActiveTrackingTicketId()) stopLiveTracking(uid, undefined, 'PRESERVE').catch(() => undefined);
  }, [uid]);
}
