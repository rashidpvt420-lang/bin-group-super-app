import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, Typography, alpha } from '@mui/material';
import { CheckCircle2, CloudOff, CloudUpload, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { httpsCallable, functions } from '../../lib/firebase';
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

type QueuedJobPayload = {
  ticketId?: string;
  status?: string;
  notes?: string;
  materials?: string;
  technicianId?: string;
  ticketSnapshot?: Record<string, unknown>;
};

const QUEUE_KEY = 'bin_offline_queue';
const MAX_ATTEMPTS = 3;
const AUTO_REPLAY_STATUSES = new Set(['ACCEPTED', 'EN_ROUTE', 'ON_THE_WAY', 'IN_PROGRESS', 'WORKING', 'STARTED']);

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

function parsePayload(item: QueueItem): QueuedJobPayload {
  if (!item.payload) return {};
  try {
    return JSON.parse(item.payload);
  } catch {
    return {};
  }
}

function normalizeStatus(value: unknown) {
  return String(value || '').trim().toUpperCase();
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

function replayEligibility(item: QueueItem) {
  const payload = parsePayload(item);
  const status = normalizeStatus(payload.status);
  if (!payload.ticketId) return { ok: false, reason: 'Missing ticket id in queued payload.' };
  if (status === 'COMPLETED') return { ok: false, reason: 'Completion with proof photos must be confirmed from the live job screen.' };
  if (status === 'ARRIVED') return { ok: false, reason: 'Arrival requires verified live GPS and must be confirmed from the live job screen.' };
  if (!AUTO_REPLAY_STATUSES.has(status)) return { ok: false, reason: `Unsupported replay status: ${status || 'unknown'}.` };
  if (!['job_action', 'checkin_checkout'].includes(item.type)) return { ok: false, reason: 'Only eligible job lifecycle actions can be replayed automatically.' };
  return { ok: true, reason: '' };
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

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    const updated = loadQueue().map((item) => item.id === id ? { ...item, ...patch } : item);
    saveQueue(updated);
    setQueue(updated);
    return updated;
  };

  const removeItem = (id: string) => {
    const updated = loadQueue().filter((item) => item.id !== id);
    saveQueue(updated);
    setQueue(updated);
  };

  const clearAll = () => {
    saveQueue([]);
    setQueue([]);
  };

  const replaySingle = async (item: QueueItem, quiet = false) => {
    if (!online || !navigator.onLine) {
      setOnline(false);
      if (!quiet) setSyncResult('Connection is offline. Item remains queued locally.');
      return false;
    }

    const eligible = replayEligibility(item);
    if (!eligible.ok) {
      updateItem(item.id, { status: 'failed', attempts: item.attempts + 1, detail: `${item.detail} · Replay blocked: ${eligible.reason}` });
      if (!quiet) setSyncResult(eligible.reason);
      return false;
    }

    const payload = parsePayload(item);
    const status = normalizeStatus(payload.status);
    updateItem(item.id, { status: 'retrying', attempts: item.attempts + 1 });

    try {
      if (status === 'ACCEPTED') {
        const acceptTechnicianTicket = httpsCallable(functions, 'acceptTechnicianTicket');
        await acceptTechnicianTicket({ ticketId: payload.ticketId });
      } else {
        const updateTicketLifecycle = httpsCallable(functions, 'updateTicketLifecycle');
        await updateTicketLifecycle({ ticketId: payload.ticketId, status, notes: payload.notes || '' });
      }
      removeItem(item.id);
      if (!quiet) setSyncResult(`Replayed and removed from queue: ${item.label}`);
      return true;
    } catch (err: any) {
      const attempts = item.attempts + 1;
      updateItem(item.id, {
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        attempts,
        detail: `${item.detail} · Last replay error: ${err?.message || 'Unknown error'}`,
      });
      if (!quiet) setSyncResult(`Replay failed: ${err?.message || 'Unknown error'}`);
      return false;
    }
  };

  const syncAll = async () => {
    if (!online || queue.length === 0) return;
    setSyncing(true);
    setSyncResult(null);
    let successCount = 0;
    let failedCount = 0;
    try {
      const snapshot = loadQueue();
      for (const item of snapshot) {
        const ok = await replaySingle(item, true);
        if (ok) successCount += 1;
        else failedCount += 1;
      }
      setSyncResult(`Replay finished. Synced ${successCount}; blocked/failed ${failedCount}. Arrived and completion actions must still be confirmed from the live job screen.`);
    } finally {
      setSyncing(false);
      refreshQueue();
    }
  };

  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const failedCount = queue.filter((q) => q.status === 'failed').length;

  return (
    <Box>
      <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>FIELD RESILIENCE · SYNC QUEUE</Typography>
      <Typography variant="h3" fontWeight="950" color="#111827" sx={{ mb: 1 }}>Offline Sync Queue</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 760 }}>
        The job detail screen saves accept, on-the-way, and start-work actions locally when the technician is offline or a confirmed update fails. When the connection returns, this page replays eligible actions through the same protected Firebase callables. Arrival requires verified live GPS, and completion with proof photos must be confirmed from the live job screen.
      </Typography>

      <Paper sx={{ p: 3, mb: 3, borderRadius: 4, bgcolor: online ? alpha('#10b981', 0.08) : alpha('#ef4444', 0.08), border: `1px solid ${online ? '#10b981' : '#ef4444'}` }}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {online ? <Wifi color="#10b981" size={24} /> : <WifiOff color="#ef4444" size={24} />}
            <Box>
              <Typography fontWeight="950" color={online ? '#10b981' : '#ef4444'} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>{online ? 'Connected' : 'No connection — local queue only'}</Typography>
              <Typography variant="caption" color="text.secondary">{online ? 'You are online. Replay eligible queued actions from here.' : 'You are offline. Job actions can be saved locally but cannot be replayed until connection returns.'}</Typography>
            </Box>
          </Stack>
          <Button variant="outlined" startIcon={syncing ? <CircularProgress size={16} /> : <RefreshCw size={16} />} disabled={!online || syncing || queue.length === 0} onClick={syncAll} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, borderRadius: 2 }}>{syncing ? 'REPLAYING...' : 'REPLAY ELIGIBLE'}</Button>
        </Stack>
      </Paper>

      {syncResult && <Alert severity={syncResult.includes('failed') || syncResult.includes('blocked') || syncResult.includes('offline') ? 'warning' : 'success'} onClose={() => setSyncResult(null)} sx={{ mb: 3 }}>{syncResult}</Alert>}

      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap">
        <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E5E7EB', flex: 1, minWidth: 130, textAlign: 'center' }}><Typography variant="h4" fontWeight="950" color="#111827">{queue.length}</Typography><Typography variant="caption" color="text.secondary" fontWeight="800">QUEUED TOTAL</Typography></Paper>
        <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E5E7EB', flex: 1, minWidth: 130, textAlign: 'center' }}><Typography variant="h4" fontWeight="950" color={pendingCount > 0 ? '#f59e0b' : '#10b981'}>{pendingCount}</Typography><Typography variant="caption" color="text.secondary" fontWeight="800">PENDING</Typography></Paper>
        <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E5E7EB', flex: 1, minWidth: 130, textAlign: 'center' }}><Typography variant="h4" fontWeight="950" color={failedCount > 0 ? '#ef4444' : '#10b981'}>{failedCount}</Typography><Typography variant="caption" color="text.secondary" fontWeight="800">FAILED</Typography></Paper>
      </Stack>

      {queue.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 4, border: '1px solid #E5E7EB' }}>
          <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
          <Typography variant="h6" fontWeight="950" color="#111827">Queue is empty</Typography>
          <Typography color="text.secondary">No local technician actions are waiting for replay.</Typography>
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 4, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <Box sx={{ p: 2.5, borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography fontWeight="950" color="#111827">LOCAL QUEUED ITEMS</Typography>
            <Button size="small" color="error" startIcon={<Trash2 size={14} />} onClick={clearAll} sx={{ fontWeight: 900 }}>CLEAR ALL</Button>
          </Box>
          <Stack divider={<Divider />}>
            {queue.map((item) => {
              const eligible = replayEligibility(item);
              return (
                <Box key={item.id} sx={{ p: 2.5 }}>
                  <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ flex: 1 }}>
                      {item.status === 'retrying' ? <CircularProgress size={20} sx={{ mt: 0.3, color: binThemeTokens.gold }} /> : item.status === 'failed' ? <CloudOff size={20} color="#ef4444" style={{ marginTop: 3 }} /> : <CloudUpload size={20} color={typeColor(item.type)} style={{ marginTop: 3 }} />}
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography fontWeight="900" color="#111827">{item.label}</Typography>
                          <Chip size="small" label={typeLabel(item.type)} sx={{ bgcolor: alpha(typeColor(item.type), 0.1), color: typeColor(item.type), fontWeight: 900, fontSize: '0.65rem' }} />
                          <Chip size="small" label={item.status === 'retrying' ? 'REPLAYING...' : item.status.toUpperCase()} sx={{ bgcolor: item.status === 'failed' ? 'rgba(239,68,68,0.1)' : item.status === 'retrying' ? 'rgba(234,179,8,0.1)' : 'rgba(16,185,129,0.1)', color: item.status === 'failed' ? '#ef4444' : item.status === 'retrying' ? '#eab308' : '#10b981', fontWeight: 900, fontSize: '0.65rem' }} />
                          <Chip size="small" label={eligible.ok ? 'REPLAYABLE' : 'MANUAL'} sx={{ bgcolor: eligible.ok ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: eligible.ok ? '#10b981' : '#f59e0b', fontWeight: 900, fontSize: '0.65rem' }} />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{item.detail}</Typography>
                        {!eligible.ok && <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 850, display: 'block', mt: 0.75 }}>Manual confirmation required: {eligible.reason}</Typography>}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>Attempts: {item.attempts} · Saved: {new Date(item.createdAt).toLocaleString()}</Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" disabled={!online || syncing || !eligible.ok} onClick={() => replaySingle(item)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>Replay</Button>
                      <Button size="small" color="error" onClick={() => removeItem(item.id)} sx={{ fontWeight: 900 }}>Discard</Button>
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ p: 4, mt: 4, borderRadius: 4, border: '1px solid #E5E7EB' }}>
        <Typography variant="h6" fontWeight="950" color="#111827" sx={{ mb: 2 }}>How offline replay works</Typography>
        <Stack spacing={1.5}>
          {[
            { step: '1', text: 'Job Detail saves eligible accept/on-the-way/start-work actions into this local queue when the technician is offline or a confirmed update fails.' },
            { step: '2', text: 'When online, replayable items call the same protected Firebase functions as the live job screen.' },
            { step: '3', text: 'Successfully replayed items are removed from the local queue. Failed items stay queued until retried or discarded.' },
            { step: '4', text: 'Arrived requires live GPS verification, and completion with proof photos is intentionally manual from the live job screen.' },
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
