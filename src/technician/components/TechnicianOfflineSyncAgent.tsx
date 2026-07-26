import React from 'react';
import { Alert, Snackbar } from '@mui/material';
import { loadOfflineQueue } from '../utils/offlineQueue';
import { replayEligibleOfflineJobActions } from '../utils/offlineJobActions';

type SyncState = 'idle' | 'syncing' | 'success' | 'warning';

export default function TechnicianOfflineSyncAgent() {
  const [state, setState] = React.useState<SyncState>('idle');
  const [message, setMessage] = React.useState('');
  const scheduledRef = React.useRef<number | null>(null);

  const runReplay = React.useCallback(async () => {
    if (!navigator.onLine || loadOfflineQueue().length === 0) return;
    setState('syncing');
    const result = await replayEligibleOfflineJobActions();
    if (result.replayed > 0) {
      setMessage(`${result.replayed} offline mission action${result.replayed === 1 ? '' : 's'} synced.`);
      setState(result.failed > 0 || result.blocked > 0 ? 'warning' : 'success');
    } else if (result.failed > 0) {
      setMessage('Offline mission sync needs review. Open the Offline Queue.');
      setState('warning');
    } else {
      setState('idle');
    }
  }, []);

  const scheduleReplay = React.useCallback(() => {
    if (scheduledRef.current !== null) window.clearTimeout(scheduledRef.current);
    scheduledRef.current = window.setTimeout(() => {
      scheduledRef.current = null;
      void runReplay();
    }, 350);
  }, [runReplay]);

  React.useEffect(() => {
    scheduleReplay();
    window.addEventListener('online', scheduleReplay);
    window.addEventListener('bin-offline-queue-updated', scheduleReplay as EventListener);
    return () => {
      window.removeEventListener('online', scheduleReplay);
      window.removeEventListener('bin-offline-queue-updated', scheduleReplay as EventListener);
      if (scheduledRef.current !== null) window.clearTimeout(scheduledRef.current);
    };
  }, [scheduleReplay]);

  return (
    <>
      <span
        hidden
        data-testid="technician-offline-sync-agent"
        data-sync-state={state}
        data-queued-actions={loadOfflineQueue().length}
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
