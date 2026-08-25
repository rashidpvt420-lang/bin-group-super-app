import React from 'react';
import { Alert, Snackbar } from '@mui/material';
import { loadOfflineQueue } from '../utils/offlineQueue';
import { replayEligibleOfflineJobActions } from '../utils/offlineJobActions';
import {
  getTechnicianEvidenceQueueCount,
  replayTechnicianEvidenceQueue,
  TECHNICIAN_EVIDENCE_QUEUE_EVENT,
} from '../utils/offlineEvidenceQueue';

type SyncState = 'idle' | 'syncing' | 'success' | 'warning';

export default function TechnicianOfflineSyncAgent() {
  const [state, setState] = React.useState<SyncState>('idle');
  const [message, setMessage] = React.useState('');
  const [queuedEvidence, setQueuedEvidence] = React.useState(0);
  const scheduledRef = React.useRef<number | null>(null);

  const refreshEvidenceCount = React.useCallback(() => {
    void getTechnicianEvidenceQueueCount().then(setQueuedEvidence).catch(() => setQueuedEvidence(0));
  }, []);

  const runReplay = React.useCallback(async () => {
    refreshEvidenceCount();
    if (!navigator.onLine) return;

    setState('syncing');
    const [actionResult, evidenceResult] = await Promise.all([
      replayEligibleOfflineJobActions(),
      replayTechnicianEvidenceQueue(),
    ]);
    refreshEvidenceCount();

    const replayedTotal = actionResult.replayed + evidenceResult.replayed;
    const failedTotal = actionResult.failed + evidenceResult.failed;
    const blockedTotal = actionResult.blocked;
    if (replayedTotal > 0) {
      const parts = [];
      if (actionResult.replayed > 0) parts.push(`${actionResult.replayed} mission action${actionResult.replayed === 1 ? '' : 's'}`);
      if (evidenceResult.replayed > 0) parts.push(`${evidenceResult.replayed} photo${evidenceResult.replayed === 1 ? '' : 's'}`);
      setMessage(`${parts.join(' and ')} synchronized.`);
      setState(failedTotal > 0 || blockedTotal > 0 ? 'warning' : 'success');
    } else if (failedTotal > 0) {
      setMessage('Technician sync needs review. Open the Offline Queue before leaving the job.');
      setState('warning');
    } else {
      setState('idle');
    }
  }, [refreshEvidenceCount]);

  const scheduleReplay = React.useCallback(() => {
    if (scheduledRef.current !== null) window.clearTimeout(scheduledRef.current);
    scheduledRef.current = window.setTimeout(() => {
      scheduledRef.current = null;
      void runReplay();
    }, 350);
  }, [runReplay]);

  React.useEffect(() => {
    refreshEvidenceCount();
    scheduleReplay();
    window.addEventListener('online', scheduleReplay);
    window.addEventListener('bin-offline-queue-updated', scheduleReplay as EventListener);
    window.addEventListener(TECHNICIAN_EVIDENCE_QUEUE_EVENT, scheduleReplay as EventListener);
    return () => {
      window.removeEventListener('online', scheduleReplay);
      window.removeEventListener('bin-offline-queue-updated', scheduleReplay as EventListener);
      window.removeEventListener(TECHNICIAN_EVIDENCE_QUEUE_EVENT, scheduleReplay as EventListener);
      if (scheduledRef.current !== null) window.clearTimeout(scheduledRef.current);
    };
  }, [refreshEvidenceCount, scheduleReplay]);

  return (
    <>
      <span
        hidden
        data-testid="technician-offline-sync-agent"
        data-sync-state={state}
        data-queued-actions={loadOfflineQueue().length}
        data-queued-evidence={queuedEvidence}
      />
      <Snackbar
        open={state === 'success' || state === 'warning'}
        autoHideDuration={5000}
        onClose={() => setState('idle')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={state === 'warning' ? 'warning' : 'success'} onClose={() => setState('idle')}>
          {message}
        </Alert>
      </Snackbar>
    </>
  );
}
