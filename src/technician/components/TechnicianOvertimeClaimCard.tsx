import { useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useHrText } from './HrBi';

// P1-4: the server links the caller's current assigned job when none is sent, and returns the
// proof level it stored. The card shows that level honestly instead of claiming GPS proof.
const PROOF_LABELS: Record<string, string> = {
  SHIFT_JOB_GPS_PHOTOS: 'Proof: shift clock + job + GPS arrival + photos',
  SHIFT_AND_JOB: 'Proof: shift clock + job (no GPS arrival or photos yet)',
  SHIFT_ONLY: 'Proof: shift clock only (no job linked)',
};

/** Overtime claim that Home and HR can open. The server still requires an active shift and 1–120 minutes. */
export default function TechnicianOvertimeClaimCard({ isRTL = false, jobId }: { isRTL?: boolean; jobId?: string | null }) {
  const { ht } = useHrText();
  const [minutes, setMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const submit = async () => {
    const estimatedMinutes = Number(minutes);
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 120 || reason.trim().length < 5) {
      setNotice({ type: 'error', text: ht('Enter 1 to 120 minutes and a reason of at least 5 characters. This does not create pay by itself.') });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const requestOvertime = httpsCallable(functions, 'requestStaffOvertime');
      const response: any = await requestOvertime({ estimatedMinutes, reason: reason.trim(), ...(jobId ? { jobId } : {}) });
      const strength = String(response.data?.proofStrength || '');
      const proofLabel = PROOF_LABELS[strength] ? ht(PROOF_LABELS[strength]) : '';
      const linkedJob = response.data?.jobId ? ` ${ht('Job')}: ${String(response.data.jobId).slice(-8)}.` : '';
      setNotice({
        type: strength === 'SHIFT_ONLY' ? 'info' : 'success',
        text: `${ht('Overtime request sent to HR for review.')}${linkedJob} ${proofLabel}`.trim(),
      });
      setMinutes('');
      setReason('');
    } catch (error: any) {
      setNotice({ type: 'error', text: `${ht('Overtime request could not be sent.')} ${String(error?.message || '')}`.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack id="overtime" data-testid="technician-overtime-claim" spacing={1.5} sx={{ textAlign: 'start' }}>
      <Typography variant="h6" fontWeight={900} sx={{ color: '#111827' }}>{ht('Claim overtime')}</Typography>
      <Typography variant="body2" sx={{ color: '#374151' }}>
        {ht('During an active shift, submit 1 to 120 minutes. Your current job is linked automatically. HR reviews the claim. This does not approve pay.')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
        <TextField
          label={ht('Minutes')}
          type="number"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          inputProps={{ min: 1, max: 120 }}
          sx={{ maxWidth: 160, '& .MuiInputBase-input': { color: '#111827' } }}
        />
        <TextField
          fullWidth
          label={ht('Reason')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          sx={{ '& .MuiInputBase-input': { color: '#111827' } }}
        />
      </Stack>
      <Button variant="contained" disabled={busy} onClick={() => void submit()} sx={{ alignSelf: 'flex-start', bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 800 }}>
        {busy ? ht('Sending…') : ht('Submit overtime claim')}
      </Button>
      {notice && <Alert severity={notice.type}>{notice.text}</Alert>}
    </Stack>
  );
}
