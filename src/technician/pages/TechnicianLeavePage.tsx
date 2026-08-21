import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Grid, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { CalendarDays, FileUp, RefreshCw, Send } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { functions, httpsCallable, ref, storage, uploadBytes } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

const LEAVE_TYPES = [
  ['ANNUAL', 'Annual Leave'],
  ['SICK', 'Sick Leave'],
  ['EMERGENCY', 'Emergency Leave'],
  ['UNPAID', 'Unpaid Leave'],
  ['OTHER', 'Other Leave'],
];

function safeName(value: string) {
  return String(value || 'evidence').replace(/[^a-zA-Z0-9._-]/g, '_');
}
function errorText(error: any) {
  return String(error?.details || error?.message || error?.code || 'Leave operation failed.')
    .replace(/^FirebaseError:\s*/i, '').slice(0, 340);
}
function statusColor(status: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'APPROVED') return 'success';
  if (normalized === 'REJECTED') return 'error';
  return 'warning';
}

export default function TechnicianLeavePage() {
  const { user } = useRole();
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [notice, setNotice] = useState<{ error: boolean; message: string } | null>(null);

  const loadRequests = useCallback(async () => {
    if (!user?.uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const response: any = await httpsCallable(functions, 'getMyStaffLeaveRequests')({});
      setRequests(Array.isArray(response.data?.requests) ? response.data.requests : []);
    } catch (error) {
      setNotice({ error: true, message: `Leave history could not be loaded: ${errorText(error)}` });
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  const submitLeave = async () => {
    if (!user?.uid || !startDate || !endDate || !reason.trim()) {
      setNotice({ error: true, message: 'Leave type, start date, end date and reason are required.' });
      return;
    }
    if (new Date(`${endDate}T00:00:00`).getTime() < new Date(`${startDate}T00:00:00`).getTime()) {
      setNotice({ error: true, message: 'End date cannot be earlier than start date.' });
      return;
    }
    if (leaveType === 'SICK' && !evidenceFile) {
      setNotice({ error: true, message: 'Please attach medical or sick-leave evidence for a sick-leave request.' });
      return;
    }
    if (evidenceFile && evidenceFile.size > 15 * 1024 * 1024) {
      setNotice({ error: true, message: 'Evidence must be 15 MB or smaller.' });
      return;
    }

    setSubmitting(true); setNotice(null);
    try {
      let evidencePath = '';
      if (evidenceFile) {
        evidencePath = `staffDocuments/${user.uid}/leave_evidence/${Date.now()}-${safeName(evidenceFile.name)}`;
        await uploadBytes(ref(storage, evidencePath), evidenceFile, {
          contentType: evidenceFile.type || 'application/octet-stream',
          customMetadata: { staffId: user.uid, documentType: 'leave_evidence', leaveType },
        });
      }
      const response: any = await httpsCallable(functions, 'submitStaffLeaveRequest')({
        leaveType, startDate, endDate, reason: reason.trim(), evidencePath: evidencePath || null,
      });
      setNotice({ error: false, message: `Leave request ${response.data?.requestId || ''} submitted to HR for approval.` });
      setStartDate(''); setEndDate(''); setReason(''); setEvidenceFile(null);
      const input = document.getElementById('technician-leave-evidence') as HTMLInputElement | null;
      if (input) input.value = '';
      await loadRequests();
    } catch (error) {
      setNotice({ error: true, message: `Leave request failed: ${errorText(error)}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ pb: 6 }} data-testid="technician-leave-self-service">
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>BIN PEOPLE · CANONICAL LEAVE LEDGER</Typography>
          <Typography variant="h3" fontWeight={950} color="#fff">Leave & Sick Leave</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 1, maxWidth: 780 }}>
            Requests go directly into the protected staff leave workflow reviewed in HR Command. Sick-leave evidence stays in your staff-scoped document vault.
          </Typography>
        </Box>
        <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshCw size={17} />} variant="outlined" onClick={() => loadRequests()} disabled={loading} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>REFRESH</Button>
      </Stack>

      {notice && <Alert severity={notice.error ? 'error' : 'success'} onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice.message}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} lg={5}>
          <Paper sx={{ p: 4, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.82)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 3 }}><CalendarDays color={binThemeTokens.gold} /><Typography variant="h6" fontWeight={950} color="#fff">New leave request</Typography></Stack>
            <Stack spacing={2.2}>
              <TextField select fullWidth label="Leave type" value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>{LEAVE_TYPES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
              <Grid container spacing={2}><Grid item xs={12} sm={6}><TextField fullWidth type="date" label="Start date" InputLabelProps={{ shrink: true }} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Grid><Grid item xs={12} sm={6}><TextField fullWidth type="date" label="End date" InputLabelProps={{ shrink: true }} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Grid></Grid>
              <TextField fullWidth multiline minRows={4} label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
              <Button component="label" variant="outlined" startIcon={<FileUp size={17} />} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}>
                {evidenceFile?.name || (leaveType === 'SICK' ? 'ATTACH MEDICAL / SICK EVIDENCE' : 'ATTACH EVIDENCE (OPTIONAL)')}
                <input id="technician-leave-evidence" hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} />
              </Button>
              <Alert severity="info">HR cannot mark this approved by editing your record. Approval is a separate protected callable and is audit logged.</Alert>
              <Button data-testid="technician-submit-leave" variant="contained" startIcon={submitting ? <CircularProgress size={18} /> : <Send size={17} />} onClick={submitLeave} disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{submitting ? 'SUBMITTING' : 'SUBMIT TO HR'}</Button>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={7}>
          <Paper sx={{ p: 4, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.82)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Typography variant="h6" fontWeight={950} color="#fff" sx={{ mb: 3 }}>My leave history</Typography>
            {loading ? <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box> : <Stack spacing={1.5}>
              {requests.map((request) => <Box key={request.id} sx={{ p: 2.2, borderRadius: 3, border: '1px solid rgba(255,255,255,0.08)', bgcolor: 'rgba(255,255,255,0.025)' }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Box><Typography color="#fff" fontWeight={900}>{String(request.leaveType || 'OTHER').replace(/_/g, ' ')}</Typography><Typography variant="body2" color="text.secondary">{request.startDate || '—'} → {request.endDate || '—'} · {request.totalDays || 0} day(s)</Typography><Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.72)' }}>{request.reason}</Typography>{request.decisionNote && <Typography variant="caption" color="text.secondary">HR note: {request.decisionNote}</Typography>}</Box><Chip label={request.status || 'PENDING'} color={statusColor(request.status) as any} /></Stack></Box>)}
              {requests.length === 0 && <Alert severity="info">No canonical leave requests have been submitted yet.</Alert>}
            </Stack>}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
