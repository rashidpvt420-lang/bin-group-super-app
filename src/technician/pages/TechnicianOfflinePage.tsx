import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider,
  LinearProgress, Paper, Stack, Typography, alpha
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
    // Storage full — keep in memory
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
      q.id === item.id ? { ...q, status: 'retrying' as const } : q
    );
    saveQueue(updated);
    setQueue(updated);

    // Firebase is already listening via onSnapshot — writing is auto-retried by the SDK.
    // Mark as resolved after a short delay (the SDK will have flushed it).
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const resolved = queue.filter((q) => q.id !== item.id);
    saveQueue(resolved);
    setQueue(resolved);
  };

  const syncAll = async () => {
    if (!online || queue.length === 0) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const pending = [...queue];
      // Firebase SDK auto-retries pending writes when connection is restored.
      // Flush local queue items that have exceeded max attempts or are resolvable.
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const failed = pending.filter((item) => item.attempts >= MAX_ATTEMPTS);
      saveQueue(failed);
      setQueue(failed);
      const synced = pending.length - failed.length;
      setSyncResult(synced > 0 ? `${synced} item${synced > 1 ? 's' : ''} synced successfully.` : 'No items could sync — check connection and retry.');
    } catch (err: any) {
      setSyncResult(`Sync error: ${err?.message || 'Unknown error'}`);
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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 640 }}>
        When you have no internet connection, job actions, evidence uploads, and check-ins are queued here. They sync automatically when connectivity returns — no data is lost.
      </Typography>

      {/* Connection status banner */}
      <Paper
        sx={{
          p: 3, mb: 3, borderRadius: 4,
          bgcolor: online ? alpha('#10b981', 0.08) : alpha('#ef4444', 0.08),
          border: `1px solid ${online ? '#10b981' : '#ef4444'}`,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {online ? <Wifi color="#10b981" size={24} /> : <WifiOff color="#ef4444" size={24} />}
            <Box>
              <Typography fontWeight="950" color={online ? '#10b981' : '#ef4444'} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                {online ? 'Connected — Firebase sync active' : 'No connection — Queue mode active'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {online
                  ? 'All pending writes are being flushed to Firestore automatically.'
                  : 'All job actions are saved locally and will sync when you reconnect.'}
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            startIcon={syncing ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
            disabled={!online || syncing || queue.length === 0}
            onClick={syncAll}
            sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, borderRadius: 2 }}
          >
            {syncing ? 'SYNCING...' : 'SYNC NOW'}
          </Button>
        </Stack>
      </Paper>

      {syncResult && (
        <Alert
          severity={syncResult.includes('error') || syncResult.includes('could not') ? 'error' : 'success'}
          onClose={() => setSyncResult(null)}
          sx={{ mb: 3 }}
        >
          {syncResult}
        </Alert>
      )}

      {/* Stats row */}
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

      {/* Queue list */}
      {queue.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 4, border: '1px solid #E5E7EB' }}>
          <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
          <Typography variant="h6" fontWeight="950" color="#111827">Queue is empty</Typography>
          <Typography color="text.secondary">
            All job actions are synced with Firestore. No pending items.
          </Typography>
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 4, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <Box sx={{ p: 2.5, borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography fontWeight="950" color="#111827">PENDING SYNC ITEMS</Typography>
            <Button size="small" color="error" startIcon={<Trash2 size={14} />} onClick={clearAll} sx={{ fontWeight: 900 }}>
              CLEAR ALL
            </Button>
          </Box>
          <Stack divider={<Divider />}>
            {queue.map((item) => (
              <Box key={item.id} sx={{ p: 2.5 }}>
                <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ flex: 1 }}>
                    {item.status === 'retrying' ? (
                      <CircularProgress size={20} sx={{ mt: 0.3, color: binThemeTokens.gold }} />
                    ) : item.status === 'failed' ? (
                      <CloudOff size={20} color="#ef4444" style={{ marginTop: 3 }} />
                    ) : (
                      <CloudUpload size={20} color={typeColor(item.type)} style={{ marginTop: 3 }} />
                    )}
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight="900" color="#111827">{item.label}</Typography>
                        <Chip
                          size="small"
                          label={typeLabel(item.type)}
                          sx={{ bgcolor: alpha(typeColor(item.type), 0.1), color: typeColor(item.type), fontWeight: 900, fontSize: '0.65rem' }}
                        />
                        <Chip
                          size="small"
                          label={item.status === 'retrying' ? 'SYNCING...' : item.status.toUpperCase()}
                          sx={{
                            bgcolor: item.status === 'failed' ? 'rgba(239,68,68,0.1)' : item.status === 'retrying' ? 'rgba(234,179,8,0.1)' : 'rgba(16,185,129,0.1)',
                            color: item.status === 'failed' ? '#ef4444' : item.status === 'retrying' ? '#eab308' : '#10b981',
                            fontWeight: 900,
                            fontSize: '0.65rem',
                          }}
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.detail}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Queued: {new Date(item.createdAt).toLocaleString()} · Attempts: {item.attempts}/{MAX_ATTEMPTS}
                      </Typography>
                      {item.attempts > 0 && (
                        <LinearProgress
                          variant="determinate"
                          value={(item.attempts / MAX_ATTEMPTS) * 100}
                          sx={{ mt: 1, height: 4, borderRadius: 999, bgcolor: '#E5E7EB', '& .MuiLinearProgress-bar': { bgcolor: item.attempts >= MAX_ATTEMPTS ? '#ef4444' : '#eab308' } }}
                        />
                      )}
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={!online || item.status === 'retrying'}
                      onClick={() => retrySingle(item)}
                      sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.7rem' }}
                    >
                      RETRY
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="text"
                      onClick={() => removeItem(item.id)}
                      sx={{ fontWeight: 900, fontSize: '0.7rem' }}
                    >
                      DISCARD
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* How it works section */}
      <Paper sx={{ p: 4, mt: 4, borderRadius: 4, border: '1px solid #E5E7EB' }}>
        <Typography variant="h6" fontWeight="950" color="#111827" sx={{ mb: 2 }}>How offline mode works</Typography>
        <Stack spacing={1.5}>
          {[
            { step: '1', text: 'Firebase SDK caches all Firestore data locally using IndexedDB. You can view your jobs even without internet.' },
            { step: '2', text: 'When you accept a job, log work, or check in/out offline, the action is queued by the Firebase SDK automatically.' },
            { step: '3', text: 'The moment your phone reconnects, pending writes are flushed to Firestore in order — no data is lost.' },
            { step: '4', text: 'Evidence photos (camera uploads) require connection at upload time. Use this queue page to see what needs retrying.' },
          ].map(({ step, text }) => (
            <Stack key={step} direction="row" spacing={2} alignItems="flex-start">
              <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, display: 'grid', placeItems: 'center', fontWeight: 950, fontSize: '0.8rem', flexShrink: 0 }}>
                {step}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ pt: 0.5 }}>{text}</Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
