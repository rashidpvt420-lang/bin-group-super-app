import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, Typography, alpha } from '@mui/material';
import { CheckCircle2, CloudOff, CloudUpload, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
  clearOfflineQueue,
  loadOfflineQueue,
  removeOfflineQueueItem,
  type OfflineQueueItem,
} from '../utils/offlineQueue';
import {
  isQueuedTechnicianActionAutoReplayable,
  parseQueuedTechnicianJobAction,
  replayEligibleOfflineJobActions,
  replayOfflineJobAction,
} from '../utils/offlineJobActions';

function typeLabel(type: OfflineQueueItem['type']) {
  const map: Record<OfflineQueueItem['type'], string> = {
    job_action: 'Job Action',
    evidence_upload: 'Evidence Upload',
    checkin_checkout: 'Check-In / Out',
    job_note: 'Job Note',
    mood_checkin: 'Wellbeing Check-In',
  };
  return map[type] || type;
}

function typeColor(type: OfflineQueueItem['type']) {
  if (type === 'evidence_upload') return '#f59e0b';
  if (type === 'job_action') return binThemeTokens.gold;
  if (type === 'checkin_checkout') return '#10b981';
  return '#94a3b8';
}

function replayReason(item: OfflineQueueItem) {
  const action = parseQueuedTechnicianJobAction(item);
  if (!action) return 'This legacy queue item has no valid mission payload and needs manual review.';
  if (action.functionName === 'updateTicketLifecycle') {
    const status = String(action.payload.status || '').toUpperCase();
    if (status === 'ARRIVED') return 'Arrival requires fresh foreground GPS and must be confirmed from the live job screen.';
    if (status.includes('COMPLETED')) return 'Completion requires foreground evidence upload and must be confirmed from the live job screen.';
  }
  if (!isQueuedTechnicianActionAutoReplayable(action)) return 'This action is not safe for automatic replay.';
  return '';
}

export default function TechnicianOfflinePage() {
  const [online, setOnline] = React.useState(navigator.onLine);
  const [queue, setQueue] = React.useState<OfflineQueueItem[]>(loadOfflineQueue);
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<string | null>(null);

  const refreshQueue = React.useCallback(() => setQueue(loadOfflineQueue()), []);

  React.useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      refreshQueue();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('bin-offline-queue-updated', refreshQueue as EventListener);
    const interval = window.setInterval(refreshQueue, 10_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('bin-offline-queue-updated', refreshQueue as EventListener);
      window.clearInterval(interval);
    };
  }, [refreshQueue]);

  const removeItem = (id: string) => {
    removeOfflineQueueItem(id);
    refreshQueue();
  };

  const clearAll = () => {
    clearOfflineQueue();
    refreshQueue();
  };

  const replaySingle = async (item: OfflineQueueItem) => {
    if (!navigator.onLine) {
      setOnline(false);
      setSyncResult('Connection is offline. Item remains queued locally.');
      return;
    }
    const reason = replayReason(item);
    if (reason) {
      setSyncResult(reason);
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await replayOfflineJobAction(item);
      if (result.replayed) setSyncResult(`Synced and removed from queue: ${item.label}`);
      else setSyncResult('Replay failed. The action remains queued for another attempt or manual review.');
    } finally {
      setSyncing(false);
      refreshQueue();
    }
  };

  const syncAll = async () => {
    if (!online || queue.length === 0) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await replayEligibleOfflineJobActions();
      setSyncResult(
        `Replay finished. Synced ${result.replayed}; failed ${result.failed}; foreground-only ${result.blocked}; remaining ${result.remaining}.`,
      );
    } finally {
      setSyncing(false);
      refreshQueue();
    }
  };

  const pendingCount = queue.filter((item) => item.status === 'pending').length;
  const failedCount = queue.filter((item) => item.status === 'failed').length;

  return (
    <Box>
      <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>FIELD RESILIENCE · SYNC QUEUE</Typography>
      <Typography variant="h3" fontWeight="950" color="#111827" sx={{ mb: 1 }}>Offline Sync Queue</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 760 }}>
        Safe accept, on-the-way, and start-work actions replay automatically through protected Firebase callables when connectivity returns. Arrival stays foreground-only because it requires fresh GPS. Completion stays foreground-only because it requires live evidence upload.
      </Typography>

      <Paper sx={{ p: 3, mb: 3, borderRadius: 4, bgcolor: online ? alpha('#10b981', 0.08) : alpha('#ef4444', 0.08), border: `1px solid ${online ? '#10b981' : '#ef4444'}` }}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {online ? <Wifi color="#10b981" size={24} /> : <WifiOff color="#ef4444" size={24} />}
            <Box>
              <Typography fontWeight="950" color={online ? '#10b981' : '#ef4444'} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>{online ? 'Connected' : 'No connection — local queue only'}</Typography>
              <Typography variant="caption" color="text.secondary">{online ? 'Eligible actions sync automatically; manual replay remains available.' : 'Actions remain stored locally until connectivity returns.'}</Typography>
            </Box>
          </Stack>
          <Button data-testid="technician-replay-eligible" variant="outlined" startIcon={syncing ? <CircularProgress size={16} /> : <RefreshCw size={16} />} disabled={!online || syncing || queue.length === 0} onClick={syncAll} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, borderRadius: 2 }}>{syncing ? 'REPLAYING...' : 'REPLAY ELIGIBLE'}</Button>
        </Stack>
      </Paper>

      {syncResult && <Alert severity={/failed|foreground-only|offline|review/i.test(syncResult) ? 'warning' : 'success'} onClose={() => setSyncResult(null)} sx={{ mb: 3 }}>{syncResult}</Alert>}

      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap">
        <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E5E7EB', flex: 1, minWidth: 130, textAlign: 'center' }}><Typography variant="h4" fontWeight="950" color="#111827">{queue.length}</Typography><Typography variant="caption" color="text.secondary" fontWeight="800">QUEUED TOTAL</Typography></Paper>
        <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E5E7EB', flex: 1, minWidth: 130, textAlign: 'center' }}><Typography variant="h4" fontWeight="950" color={pendingCount > 0 ? '#f59e0b' : '#10b981'}>{pendingCount}</Typography><Typography variant="caption" color="text.secondary" fontWeight="800">PENDING</Typography></Paper>
        <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E5E7EB', flex: 1, minWidth: 130, textAlign: 'center' }}><Typography variant="h4" fontWeight="950" color={failedCount > 0 ? '#ef4444' : '#10b981'}>{failedCount}</Typography><Typography variant="caption" color="text.secondary" fontWeight="800">FAILED</Typography></Paper>
      </Stack>

      {queue.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 4, border: '1px solid #E5E7EB' }}>
          <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
          <Typography variant="h6" fontWeight="950" color="#111827">Queue is empty</Typography>
          <Typography color="text.secondary">No local Technician actions are waiting for replay.</Typography>
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 4, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <Box sx={{ p: 2.5, borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography fontWeight="950" color="#111827">LOCAL QUEUED ITEMS</Typography>
            <Button size="small" color="error" startIcon={<Trash2 size={14} />} onClick={clearAll} sx={{ fontWeight: 900 }}>CLEAR ALL</Button>
          </Box>
          <Stack divider={<Divider />}>
            {queue.map((item) => {
              const reason = replayReason(item);
              return (
                <Box key={item.id} sx={{ p: 2.5 }}>
                  <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ flex: 1, minWidth: 260 }}>
                      {item.status === 'retrying' ? <CircularProgress size={20} sx={{ mt: 0.3, color: binThemeTokens.gold }} /> : item.status === 'failed' ? <CloudOff size={20} color="#ef4444" style={{ marginTop: 3 }} /> : <CloudUpload size={20} color={typeColor(item.type)} style={{ marginTop: 3 }} />}
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography fontWeight="900" color="#111827">{item.label}</Typography>
                          <Chip size="small" label={typeLabel(item.type)} sx={{ bgcolor: alpha(typeColor(item.type), 0.1), color: typeColor(item.type), fontWeight: 900, fontSize: '0.65rem' }} />
                          <Chip size="small" label={item.status.toUpperCase()} sx={{ fontWeight: 900, fontSize: '0.65rem' }} />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7 }}>{item.detail}</Typography>
                        {reason && <Typography variant="caption" sx={{ color: '#f59e0b', display: 'block', mt: 0.8 }}>{reason}</Typography>}
                        <Typography variant="caption" color="text.disabled">Queued {new Date(item.createdAt).toLocaleString()} · Attempts {item.attempts}/3</Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" disabled={!online || syncing || Boolean(reason)} onClick={() => replaySingle(item)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>REPLAY</Button>
                      <Button size="small" color="error" onClick={() => removeItem(item.id)} sx={{ fontWeight: 900 }}>REMOVE</Button>
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
