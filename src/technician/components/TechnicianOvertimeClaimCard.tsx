import { useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

/** Overtime claim that Home and HR can open. The server still requires an active shift and 1–120 minutes. */
export default function TechnicianOvertimeClaimCard({ isRTL = false }: { isRTL?: boolean }) {
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
      const response: any = await requestOvertime({ estimatedMinutes, reason: reason.trim() });
      setNotice({ type: 'success', text: response.data?.message || 'Overtime request submitted for review.' });
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
