import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { collection, db, getDocs, limit, orderBy, query } from '../lib/firebase';

export type SuggestionRow = { id: string; role: string; category: string; title: string; message: string; createdBy: string; createdAtMs: number };

const toMs = (value: unknown): number => {
  const v = value as { toMillis?: () => number } | null | undefined;
  return v && typeof v.toMillis === 'function' ? v.toMillis() : 0;
};

/** Admin-only list of suggestions sent from the owner, tenant, technician and broker dashboards. */
export default function AdminSuggestionsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, 'user_suggestions'), orderBy('createdAt', 'desc'), limit(200)))
      .then((snap) => {
        if (cancelled) return;
        setRows(snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, role: String(data.role || ''), category: String(data.category || ''), title: String(data.title || ''), message: String(data.message || ''), createdBy: String(data.createdBy || ''), createdAtMs: toMs(data.createdAt) };
        }));
        setState('ready');
      })
      .catch((err: { code?: string }) => { if (!cancelled) setState(err?.code === 'permission-denied' ? 'denied' : 'error'); });
    return () => { cancelled = true; };
  }, []);

  const visible = roleFilter === 'all' ? rows : rows.filter((r) => r.role === roleFilter);

  return (
    <Box data-testid="admin-suggestions" sx={{ bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 4, p: { xs: 2, md: 3 }, mb: 3, color: '#111827' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" useFlexGap flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>User suggestions</Typography>
        <Button onClick={() => navigate('/admin/dashboard')} sx={{ color: '#7A5C12', fontWeight: 900 }}>Back to Command Center</Button>
      </Stack>
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        {['all', 'owner', 'tenant', 'technician', 'broker'].map((r) => (
          <Chip key={r} label={r === 'all' ? `All (${rows.length})` : `${r} (${rows.filter((x) => x.role === r).length})`} onClick={() => setRoleFilter(r)} color={roleFilter === r ? 'warning' : 'default'} sx={{ fontWeight: 800, textTransform: 'capitalize' }} />
        ))}
      </Stack>
      {state === 'loading' && <CircularProgress size={24} />}
      {state === 'denied' && <Alert severity="warning">Only BIN GROUP admins signed in with MFA can read suggestions.</Alert>}
      {state === 'error' && <Alert severity="error">Suggestions could not load. Refresh to try again.</Alert>}
      {state === 'ready' && visible.length === 0 && <Typography sx={{ color: '#4B5563' }}>No suggestions yet.</Typography>}
      {state === 'ready' && visible.map((row) => (
        <Box key={row.id} sx={{ borderTop: '1px solid #E5E7EB', py: 1.5 }}>
          <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} alignItems="center">
            <Chip size="small" label={row.role} sx={{ textTransform: 'capitalize', fontWeight: 800 }} />
            <Chip size="small" variant="outlined" label={row.category.replace('_', ' ')} />
            <Typography sx={{ fontWeight: 800 }}>{row.title}</Typography>
          </Stack>
          <Typography sx={{ color: '#374151', whiteSpace: 'pre-wrap', mt: 0.5 }}>{row.message}</Typography>
          <Typography variant="caption" sx={{ color: '#4B5563' }}>{row.createdAtMs ? new Date(row.createdAtMs).toLocaleString('en-AE', { timeZone: 'Asia/Dubai' }) : 'Just now'} · user {row.createdBy}</Typography>
        </Box>
      ))}
    </Box>
  );
}
