import React, { useEffect, useState } from 'react';
import { Alert, Box, Chip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Clock } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import Bi from '../../components/Bi';

const dubaiMonth = (offset = 0) => {
  const now = new Date(Date.now() + 4 * 3600 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
};
const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' }) : '—');
const hm = (minutes?: number) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

/** Staff member's own hours and overtime proof, from the server hours engine (getMyHours). */
export default function MyHoursPanel() {
  const [month, setMonth] = useState(dubaiMonth());
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    httpsCallable(functions, 'getMyHours')({ month })
      .then((res: any) => { if (!cancelled) setData(res?.data || null); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Could not load your hours.'); });
    return () => { cancelled = true; };
  }, [month]);

  const totals = data?.totals || {};
  return (
    <Paper data-testid="my-hours-panel" sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Clock color={binThemeTokens.gold} />
        <Typography variant="h6" color="#FFF" fontWeight="950"><Bi en={"My Hours"} ar={"ساعات عملي"} /></Typography>
        <TextField select size="small" value={month} onChange={(e) => setMonth(e.target.value)} sx={{ ml: 'auto', minWidth: 140, '& .MuiInputBase-root': { color: '#111827' } }}>
          {[0, -1, -2].map((o) => <MenuItem key={o} value={dubaiMonth(o)}>{dubaiMonth(o)}</MenuItem>)}
        </TextField>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
        <Chip label={`Worked ${hm(totals.workedMinutes)}`} />
        <Chip label={`Clocked overtime ${hm(totals.clockedOvertimeMinutes)}`} />
        <Chip label={`Approved overtime ${hm(totals.payableOvertimeMinutes)}`} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
      </Stack>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 1 }}>
        Overtime is paid only when it is on the clock (max 2 hours a day) and HR approves it. Times are Dubai time (GST).
      </Typography>
      <Table size="small">
        <TableHead><TableRow>{['DATE', 'IN', 'OUT', 'WORKED', 'OVERTIME', 'NOTE'].map((h) => <TableCell key={h} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{h}</TableCell>)}</TableRow></TableHead>
        <TableBody>
          {(data?.days || []).length === 0 && <TableRow><TableCell colSpan={6} sx={{ color: 'rgba(255,255,255,0.5)' }}>No shifts this month.</TableCell></TableRow>}
          {(data?.days || []).map((d: any) => (
            <TableRow key={d.shiftDate}>
              <TableCell sx={{ color: '#fff' }}>{d.shiftDate}</TableCell>
              <TableCell sx={{ color: '#fff' }}>{time(d.clockInAt)}</TableCell>
              <TableCell sx={{ color: '#fff' }}>{time(d.clockOutAt)}</TableCell>
              <TableCell sx={{ color: '#fff' }}>{d.workedMinutes !== undefined ? hm(d.workedMinutes) : '—'}</TableCell>
              <TableCell sx={{ color: '#fff' }}>{d.overtimeMinutes ? hm(d.overtimeMinutes) : '—'}</TableCell>
              <TableCell>{d.missedClockOut ? <Chip size="small" color="error" label="MISSED CLOCK-OUT" /> : d.restDay ? <Chip size="small" label="REST DAY" /> : null}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="subtitle2" color="#FFF" fontWeight={900} sx={{ mt: 3, mb: 1 }}><Bi en={"My overtime claims and proof"} ar={"طلبات العمل الإضافي والإثبات"} /></Typography>
      {(data?.claims || []).length === 0 && <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>No overtime claims this month.</Typography>}
      {(data?.claims || []).map((c: any) => {
        const job = c.proof?.job;
        const loc = job?.arrivalLocation;
        return (
          <Box key={c.trackerId} data-testid="my-overtime-claim" sx={{ p: 1.5, mb: 1, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
              <Typography color="#fff" fontWeight={900}>{c.shiftDate}</Typography>
              <Chip size="small" label={c.status} color={c.status === 'APPROVED' ? 'success' : c.status === 'REJECTED' ? 'error' : 'default'} />
              <Chip size="small" label={`Claimed ${hm(c.estimatedMinutes)}`} />
              {c.approvedMinutes > 0 && <Chip size="small" label={`Approved ${hm(c.approvedMinutes)}`} />}
            </Stack>
            <Typography variant="caption" component="div" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              Shift clock-in {time(c.proof?.shift?.clockInAt)}{c.jobId ? ` · Job ${c.jobId}: arrived ${time(job?.arrivedAt)}, started ${time(job?.startedAt)}, done ${time(job?.completedAt)}` : ''}
              {loc && Number.isFinite(loc.lat) ? ` · GPS ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : ''}
              {job ? ` · Photos ${(job.beforePhotos?.length || 0) + (job.afterPhotos?.length || 0)}` : ''}
              {c.reviewNote ? ` · HR: ${c.reviewNote}` : ''}
            </Typography>
          </Box>
        );
      })}
    </Paper>
  );
}
