import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { CheckCircle2, ClipboardCheck, Eye, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const millis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const label = (value: any) => String(value || 'SUBMITTED').toUpperCase().replace(/[-_]/g, ' ');
const tone = (value: any) => {
  const text = String(value || '').toUpperCase();
  if (text.includes('APPROVED')) return '#10b981';
  if (text.includes('REQUESTED') || text.includes('SUBMITTED')) return '#f59e0b';
  if (text.includes('REJECTED') || text.includes('DISPUTED')) return '#ef4444';
  return binThemeTokens.goldHover;
};
const evidence = (item: any) => [
  ...(Array.isArray(item.evidencePhotos) ? item.evidencePhotos : []),
  ...(Array.isArray(item.photos) ? item.photos : []),
  ...Object.values(item.roomChecks || {}).flatMap((room: any) => Object.values(room || {}).map((check: any) => check?.photoUrl).filter(Boolean)),
  item.reportUrl,
  item.evidenceUrl,
  item.pdfUrl,
].filter(Boolean);

export default function OwnerReviewQueuePage() {
  const { user } = useRole();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!user?.uid && !user?.email) return;
    setLoading(true);
    try {
      const fn = httpsCallable(functions, 'listOwnerHandoverInspections');
      const result = await fn({});
      const data = result.data as { inspections?: any[] };
      setRows((data.inspections || []).sort((a, b) => millis(b.submittedAt || b.createdAt) - millis(a.submittedAt || a.createdAt)));
      setNotice('');
    } catch (error: any) {
      setNotice(error?.message || 'Could not load owner review queue. Confirm Functions deploy.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, user?.email]);

  useEffect(() => { load(); }, [load]);

  const act = async (row: any, action: 'APPROVED' | 'REINSPECTION_REQUESTED') => {
    setBusy(`${row.id}:${action}`);
    try {
      const fn = httpsCallable(functions, 'updateOwnerHandoverInspection');
      await fn({ inspectionId: row.id, action });
      await load();
    } catch (error: any) {
      setNotice(error?.message || 'Could not update review.');
    } finally {
      setBusy('');
    }
  };

  const pending = rows.filter((row) => ['SUBMITTED', 'OWNER_REVIEW', 'REINSPECTION_REQUESTED'].includes(String(row.status || '').toUpperCase())).length;
  const approved = rows.filter((row) => String(row.status || '').toUpperCase().includes('APPROVED')).length;

  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>OWNER REVIEW QUEUE</Typography>
          <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>Move-In / Move-Out Evidence</Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, fontWeight: 700 }}>Review tenant-submitted condition records and attached evidence.</Typography>
        </Box>
        {notice && <Alert severity="warning">{notice}</Alert>}
        {loading && <Alert severity="info" icon={<CircularProgress size={16} />}>Loading reviews...</Alert>}
        <Grid container spacing={2}>
          {[{ label: 'Total', value: rows.length, icon: <ClipboardCheck size={22} />, color: binThemeTokens.goldHover }, { label: 'Pending', value: pending, icon: <ShieldAlert size={22} />, color: pending ? '#f59e0b' : '#10b981' }, { label: 'Approved', value: approved, icon: <CheckCircle2 size={22} />, color: '#10b981' }].map((card) => (
            <Grid item xs={12} md={4} key={card.label}><Paper sx={{ p: 3, borderRadius: 5, border: `1px solid ${alpha(card.color, 0.22)}`, bgcolor: alpha(card.color, 0.06) }}><Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box><Typography variant="h4" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{card.value}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950 }}>{card.label.toUpperCase()}</Typography></Paper></Grid>
          ))}
        </Grid>
        <Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#fff', border: '1px solid #E5E7EB' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Typography variant="h6" sx={{ color: '#111827', fontWeight: 950 }}>Submitted records</Typography><Button onClick={load} startIcon={<RefreshCw size={16} />} sx={{ color: binThemeTokens.goldHover, fontWeight: 950 }}>Refresh</Button></Stack>
          {rows.length === 0 && !loading ? <Typography sx={{ color: '#667085' }}>No submitted records found.</Typography> : <Stack spacing={2}>{rows.map((row) => { const color = tone(row.status); const files = evidence(row); return <Paper key={row.id} sx={{ p: 2.5, borderRadius: 4, bgcolor: '#F8F9FB', border: `1px solid ${alpha(color, 0.22)}` }}><Stack spacing={1.5}><Stack direction="row" justifyContent="space-between" gap={2} flexWrap="wrap"><Box><Typography sx={{ color: '#111827', fontWeight: 950 }}>{row.propertyName || row.propertyId || 'Property'}</Typography><Typography variant="caption" sx={{ color: '#667085', fontWeight: 850 }}>{label(row.inspectionType || row.type)} · {row.unitNumber || row.unitId || 'Unit pending'}</Typography></Box><Chip label={label(row.status)} sx={{ bgcolor: alpha(color, 0.12), color, fontWeight: 950 }} /></Stack><Typography variant="body2" sx={{ color: '#667085', fontWeight: 700 }}>{files.length} evidence file(s) attached · Tenant: {row.tenantName || row.tenantEmail || 'linked tenant'}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{files.slice(0, 6).map((url, index) => <Button key={`${row.id}-${index}`} variant="outlined" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} startIcon={<Eye size={16} />} sx={{ borderColor: binThemeTokens.goldHover, color: binThemeTokens.goldHover, fontWeight: 950 }}>Evidence {index + 1}</Button>)}<Button disabled={busy === `${row.id}:APPROVED`} variant="outlined" onClick={() => act(row, 'APPROVED')} sx={{ borderColor: '#10b981', color: '#10b981', fontWeight: 950 }}>{busy === `${row.id}:APPROVED` ? <CircularProgress size={16} /> : 'Approve'}</Button><Button disabled={busy === `${row.id}:REINSPECTION_REQUESTED`} variant="outlined" onClick={() => act(row, 'REINSPECTION_REQUESTED')} startIcon={<RotateCcw size={16} />} sx={{ borderColor: '#f59e0b', color: '#f59e0b', fontWeight: 950 }}>{busy === `${row.id}:REINSPECTION_REQUESTED` ? <CircularProgress size={16} /> : 'Recheck'}</Button></Stack></Stack></Paper>; })}</Stack>}
        </Paper>
      </Stack>
    </Box>
  );
}
