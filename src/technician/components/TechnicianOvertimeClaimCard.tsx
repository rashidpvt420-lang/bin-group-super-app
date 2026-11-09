import { useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

export type OvertimeProofStrength = 'SHIFT_ONLY' | 'SHIFT_AND_JOB' | 'SHIFT_JOB_GPS_PHOTOS';

/** Plain-language proof level the server attached to the claim (P1-4). */
export function overtimeProofLabel(strength: unknown, jobId?: unknown): string {
  const job = String(jobId || '').trim();
  const jobText = job ? `job ${job}` : 'the job';
  if (strength === 'SHIFT_JOB_GPS_PHOTOS') return `Proof attached: shift clock and ${jobText} with arrival GPS and photos.`;
  if (strength === 'SHIFT_AND_JOB') return `Proof attached: shift clock and ${jobText}. The job has no arrival GPS or photos yet.`;
  return 'Proof attached: shift clock only. No active job was linked, so HR sees this as a shift-only claim.';
}

/**
 * Overtime claim that Home and HR can open. The server still requires an active shift and 1–120 minutes.
 * When jobId is not passed, the server links the technician's own active assigned job (P1-4).
 */
export default function TechnicianOvertimeClaimCard({ isRTL = false, jobId }: { isRTL?: boolean; jobId?: string | null }) {
  const [minutes, setMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const submit = async () => {
    const estimatedMinutes = Number(minutes);
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 120 || reason.trim().length < 5) {
      setNotice({ type: 'error', text: 'Enter 1 to 120 minutes and a reason of at least 5 characters. This does not create pay by itself.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const requestOvertime = httpsCallable(functions, 'requestStaffOvertime');
      const response: any = await requestOvertime({ estimatedMinutes, reason: reason.trim(), ...(jobId ? { jobId } : {}) });
      const base = response.data?.message || 'Overtime request submitted for review.';
      setNotice({ type: 'success', text: `${base} ${overtimeProofLabel(response.data?.proofStrength, response.data?.jobId)}` });
      setMinutes('');
      setReason('');
    } catch (error: any) {
      setNotice({ type: 'error', text: String(error?.message || 'Overtime request failed.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack id="overtime" data-testid="technician-overtime-claim" spacing={1.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
      <Typography variant="h6" fontWeight={900} sx={{ color: '#111827' }}>Claim overtime</Typography>
      <Typography variant="body2" sx={{ color: '#374151' }}>
        During an active shift, submit 1 to 120 minutes. HR reviews the claim. This does not approve pay.
      </Typography>
      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.25}>
        <TextField
          label="Minutes"
          type="number"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          inputProps={{ min: 1, max: 120 }}
          sx={{ maxWidth: 160, '& .MuiInputBase-input': { color: '#111827' } }}
        />
        <TextField
          fullWidth
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          sx={{ '& .MuiInputBase-input': { color: '#111827' } }}
        />
      </Stack>
      <Button variant="contained" disabled={busy} onClick={() => void submit()} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 800 }}>
        {busy ? 'Sending…' : 'Submit overtime claim'}
      </Button>
      {notice && <Alert severity={notice.type}>{notice.text}</Alert>}
    </Stack>
  );
}
