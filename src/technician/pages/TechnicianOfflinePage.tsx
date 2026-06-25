import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import { CheckCircle2, CloudOff, CloudUpload, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';

type QueueItem = {
  id: string;
  type: 'job_action' | 'evidence_upload' | 'checkin_checkout' | 'job_note' | 'mood_checkin';
  label: string;
  detail: string;
  status: 'pending' | 'retrying' | 'failed';
  attempts: number;
  createdAt: string;
  payload?: string;
};

const QUEUE_KEY = 'bin_offline_queue';
const MAX_ATTEMPTS = 3;

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Storage may be full or blocked. Keep UI stable.
  }
}

function typeLabel(type: QueueItem['type']) {
  const map: Record<QueueItem['type'], string> = {
    job_action: 'Job Action',
    evidence_upload: 'Evidence Upload',
    checkin_checkout: 'Check-In / Out',
    job_note: 'Job Note',
    mood_checkin: 'Wellbeing Check-In',
  };
  return map[type] || type;
}

function typeColor(type: QueueItem['type']) {
  if (type === 'evidence_upload') return '#f59e0b';
  if (type === 'job_action') return binThemeTokens.gold;
  if (type === 'checkin_checkout') return '#10b981';
  return '#94a3b8';
}

export default function TechnicianOfflinePage() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueueItem[]>(loadQueue);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const refreshQueue = useCallback(() => {
    setQueue(loadQueue());
  }, []);

  useEffect(() => {
    refreshQueue();
    const interval = setInterval(refreshQueue, 10_000);
    return () => clearInterval(interval);
  }, [refreshQueue]);

  const removeItem = (id: string) => {
    const updated = queue.filter((item) => item.id !== id);
    saveQueue(updated);
    setQueue(updated);
  };

  const clearAll = () => {
    saveQueue([]);
    setQueue([]);
  };

  const retrySingle = async (item: QueueItem) => {
    if (!online) return;
    const updated = queue.map((q) =>
      q.id === item.id ? { ...q, status: 'retrying' as const, attempts: q.attempts + 1 } : q,
    );
    saveQueue(updated);
    setQueue(updated);

    await new Promise((resolve) => setTimeout(resolve, 600));
    const final = updated.map((q) =>
      q.id === item.id
        ? { ...q, status: (q.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending') as QueueItem['status'] }
        : q,
    );
    saveQueue(final);
    setQueue(final);
    setSyncResult('Connectivity checked. This queue records local job actions only; redo the job action from the job screen to confirm it reaches Firestore, then discard the local entry.');
  };

  const syncAll = async () => {
    if (!online || queue.length === 0) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (!navigator.onLine) {
        setOnline(false);
        setSyncResult('Connection dropped — items remain queued locally and were not confirmed sent.');
        return;
      }
      setSyncResult('Online confirmed. Redo/confirm each queued action from the job screen, then discard the matching local entry. Evidence photo uploads still require a live connection.');
    } catch (err: any) {
      setSyncResult(`Could not check status: ${err?.message || 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const failedCount = queue.filter((q) => q.status === 'failed').length;

  return (
    <Box>
      <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
        FIELD RESILIENCE · SYNC QUEUE
      </Typography>
      <Typography variant="h3" fontWeight="950" color="#111827" sx={{ mb: 1 }}>
        Offline Sync Queue
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 720 }}>
        The job detail screen now writes text-based lifecycle actions into this local queue when the technician is offline or a status update fails before confirmation. This queue does not prove delivery to Firestore. Redo or confirm the action from the job screen after reconnecting, then discard the local entry. Evidence photo uploads always require a live connection.
      </Typography>

      <Paper sx={{ p: 3, mb: 3, borderRadius: 4, bgcolor: online ? alpha('#10b981', 0.08) : alpha('#ef4444', 0.08), border: `1px solid ${online ? '#10b981' : '#ef4444'}` }}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {online ? <Wifi color="#10b981" size={24} /> : <WifiOff color="#ef4444" size={24} />}
            <Box>
              <Typography fontWeight="950" color={online ? '#10b981' : '#ef4444'} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                {online ? 'Connected' : 'No connection — local queue only'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {online
                  ? 'You are online. Use the job screen to re-submit/confirm any queued action, then discard it here.'
                  : 'You are offline. Job actions can be saved locally, but they are not confirmed in Firestore until you redo or confirm them online.'}
              </Typography>
            </Box>
          </Stack>
          <Button variant="outlined" startIcon={syncing ? <CircularProgress size={16} /> : <RefreshCw size={16} />} disabled={!online || syncing || queue.length === 0} onClick={syncAll} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, borderRadius: 2 }}>
            {syncing ? 'CHECKING...' : 'CHECK CONNECTION'}
          </Button>
        </Stack>
      </Paper>

      {syncResult && (
        <Alert severity={syncResult.includes('dropped') || syncResult.includes('Could not') ? 'error' : 'info'} onClose={() => setSyncResult(null)} sx={{ mb: 3 }}>
          {syncResult}
        </Alert>
      )}

      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap">
        <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E5E7EB', flex: 1, minWidth: 130, textAlign: 'center' }}>
          <Typography variant="h4" fontWeight="950" color="#111827">{queue.length}</Typography>
          <Typography variant="caption" color="text.secondary" fontWeight="800">QUEUED TOTAL</Typography>
        </Paper>
        <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E5E7EB', flex: 1, minWidth: 130, textAlign: 'center' }}>
          <Typography variant="h4" fontWeight="950" color={pendingCount > 0 ? '#f59e0b' : '#10b981'}>{pendingCount}</Typography>
          <Typography variant="caption" color="text.secondary" fontWeight="800">PENDING</Typography>
        </Paper>
        <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E5E7EB', flex: 1, minWidth: 130, textAlign: 'center' }}>
          <Typography variant="h4" fontWeight="950" color={failedCount > 0 ? '#ef4444' : '#10b981'}>{failedCount}</Typography>
          <Typography variant="caption" color="text.secondary" fontWeight="800">FAILED</Typography>
        </Paper>
      </Stack>

      {queue.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 4, border: '1px solid #E5E7EB' }}>
          <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
          <Typography variant="h6" fontWeight="950" color="#111827">Queue is empty</Typography>
          <Typography color="text.secondary">No local technician actions are waiting for confirmation.</Typography>
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 4, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <Box sx={{ p: 2.5, borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography fontWeight="950" color="#111827">LOCAL QUEUED ITEMS</Typography>
            <Button size="small" color="error" startIcon={<Trash2 size={14} />} onClick={clearAll} sx={{ fontWeight: 900 }}>CLEAR ALL</Button>
          </Box>
          <Stack divider={<Divider />}>
            {queue.map((item) => (
              <Box key={item.id} sx={{ p: 2.5 }}>
                <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ flex: 1 }}>
                    {item.status === 'retrying' ? <CircularProgress size={20} sx={{ mt: 0.3, color: binThemeTokens.gold }} /> : item.status === 'failed' ? <CloudOff size={20} color="#ef4444" style={{ marginTop: 3 }} /> : <CloudUpload size={20} color={typeColor(item.type)} style={{ marginTop: 3 }} />}
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight="900" color="#111827">{item.label}</Typography>
                        <Chip size="small" label={typeLabel(item.type)} sx={{ bgcolor: alpha(typeColor(item.type), 0.1), color: typeColor(item.type), fontWeight: 900, fontSize: '0.65rem' }} />
                        <Chip size="small" label={item.status === 'retrying' ? 'CHECKING...' : item.status.toUpperCase()} sx={{ bgcolor: item.status === 'failed' ? 'rgba(239,68,68,0.1)' : item.status === 'retrying' ? 'rgba(234,179,8,0.1)' : 'rgba(16,185,129,0.1)', color: item.status === 'failed' ? '#ef4444' : item.status === 'retrying' ? '#eab308' : '#10b981', fontWeight: 900, fontSize: '0.65rem' }} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.detail}</Typography>
                      <Typography variant="caption" color="text.secondary">Queued: {new Date(item.createdAt).toLocaleString()} · Checks: {item.attempts}/{MAX_ATTEMPTS}</Typography>
                      {item.attempts > 0 && <LinearProgress variant="determinate" value={(item.attempts / MAX_ATTEMPTS) * 100} sx={{ mt: 1, height: 4, borderRadius: 999, bgcolor: '#E5E7EB', '& .MuiLinearProgress-bar': { bgcolor: item.attempts >= MAX_ATTEMPTS ? '#ef4444' : '#eab308' } }} />}
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" disabled={!online || item.status === 'retrying'} onClick={() => retrySingle(item)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.7rem' }}>CHECK</Button>
                    <Button size="small" color="error" variant="text" onClick={() => removeItem(item.id)} sx={{ fontWeight: 900, fontSize: '0.7rem' }}>DISCARD</Button>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ p: 4, mt: 4, borderRadius: 4, border: '1px solid #E5E7EB' }}>
        <Typography variant="h6" fontWeight="950" color="#111827" sx={{ mb: 2 }}>How offline mode works</Typography>
        <Stack spacing={1.5}>
          {[
            { step: '1', text: 'Job Detail saves accept/status/check-in style actions into this local queue when the technician is offline or a confirmed update fails.' },
            { step: '2', text: 'This queue is a local safety log, not proof of delivery. Reopen the job and redo or confirm the action after reconnecting.' },
            { step: '3', text: 'After you confirm the server has the correct job state, discard the local queued item here.' },
            { step: '4', text: 'Evidence photos are not uploaded offline. Retake or re-upload after the connection returns.' },
          ].map(({ step, text }) => (
            <Stack key={step} direction="row" spacing={2} alignItems="flex-start">
              <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, display: 'grid', placeItems: 'center', fontWeight: 950, fontSize: '0.8rem', flexShrink: 0 }}>{step}</Box>
              <Typography variant="body2" color="text.secondary" sx={{ pt: 0.5 }}>{text}</Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
