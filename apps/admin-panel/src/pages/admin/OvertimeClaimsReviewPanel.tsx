import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';

type Claim = {
    trackerId: string;
    staffId: string | null;
    shiftDate: string | null;
    jobId: string | null;
    estimatedMinutes: number;
    reason: string;
    proofStrength: string;
    proof: any;
};

const MAX_MINUTES = 120;
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' }) + ' GST' : '—');

/**
 * HR / operations review of overtime claims. Approving only sets approved minutes (max 120);
 * pay is computed later by the payroll batch from clocked hours and settled by MFA Finance Admin.
 */
export default function OvertimeClaimsReviewPanel() {
    const [claims, setClaims] = useState<Claim[]>([]);
    const [minutes, setMinutes] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState('');

    const load = useCallback(async () => {
        try {
            const res: any = await httpsCallable(functions, 'listPendingOvertimeClaims')({});
            setClaims(res?.data?.claims || []);
        } catch (error: any) {
            setMessage(`Could not load overtime claims: ${error?.message || 'permission or network issue'}`);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const review = async (claim: Claim, decision: 'APPROVE' | 'REJECT') => {
        setBusy(claim.trackerId);
        setMessage('');
        try {
            const approvedMinutes = Number(minutes[claim.trackerId] || Math.min(claim.estimatedMinutes, MAX_MINUTES));
            await httpsCallable(functions, 'reviewStaffOvertimeClaim')({ trackerId: claim.trackerId, decision, approvedMinutes, note: notes[claim.trackerId] || '' });
            setMessage(`Claim ${claim.trackerId} ${decision === 'APPROVE' ? 'approved' : 'rejected'}.`);
            await load();
        } catch (error: any) {
            setMessage(`Review failed: ${error?.message || 'permission or network issue'}`);
        } finally {
            setBusy('');
        }
    };

    return (
        <Paper data-testid="overtime-claims-review" sx={{ p: 3, mt: 3, bgcolor: 'rgba(15,23,42,.72)', borderRadius: 4 }}>
            <Typography variant="h6" fontWeight={950}>Overtime claims to review (max {MAX_MINUTES} min a day)</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)' }}>Approving sets payroll eligibility only. Pay is calculated from clocked hours in the payroll batch and settled by Finance Admin with MFA.</Typography>
            {message && <Alert severity={message.includes('failed') || message.includes('Could not') ? 'error' : 'success'} sx={{ mt: 2 }}>{message}</Alert>}
            {claims.length === 0 && <Typography sx={{ mt: 2, color: 'rgba(255,255,255,.45)' }}>No pending overtime claims.</Typography>}
            <Stack spacing={2} sx={{ mt: 2 }}>
                {claims.map((claim) => {
                    const job = claim.proof?.job;
                    const loc = job?.arrivalLocation;
                    return (
                        <Box key={claim.trackerId} sx={{ p: 2, border: '1px solid rgba(255,255,255,.1)', borderRadius: 2 }}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Typography fontWeight={900}>{claim.staffId}</Typography>
                                <Chip size="small" label={claim.shiftDate || 'no date'} />
                                <Chip size="small" label={`${claim.estimatedMinutes} min claimed`} />
                                <Chip size="small" color={claim.proofStrength === 'SHIFT_JOB_GPS_PHOTOS' ? 'success' : 'warning'} label={claim.proofStrength} />
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 1 }}>{claim.reason}</Typography>
                            <Typography variant="caption" component="div" sx={{ mt: 1, color: 'rgba(255,255,255,.7)' }}>
                                Clock-in: {fmt(claim.proof?.shift?.clockInAt)} · Job {claim.jobId || '—'}: arrived {fmt(job?.arrivedAt)}, started {fmt(job?.startedAt)}, completed {fmt(job?.completedAt)}
                                {loc && Number.isFinite(loc.lat) ? ` · GPS ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (±${Math.round(loc.accuracy)} m, ${loc.source})` : ' · No GPS'}
                                {` · Photos: ${(job?.beforePhotos?.length || 0)} before, ${(job?.afterPhotos?.length || 0)} after`}
                            </Typography>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
                                <TextField size="small" type="number" label="Approve minutes" value={minutes[claim.trackerId] ?? String(Math.min(claim.estimatedMinutes, MAX_MINUTES))} onChange={(e) => setMinutes((m) => ({ ...m, [claim.trackerId]: e.target.value }))} inputProps={{ min: 1, max: Math.min(claim.estimatedMinutes, MAX_MINUTES) }} />
                                <TextField size="small" label="Note (required to reject)" value={notes[claim.trackerId] || ''} onChange={(e) => setNotes((n) => ({ ...n, [claim.trackerId]: e.target.value }))} sx={{ flex: 1 }} />
                                <Button variant="contained" disabled={busy === claim.trackerId} onClick={() => review(claim, 'APPROVE')}>APPROVE</Button>
                                <Button variant="outlined" color="error" disabled={busy === claim.trackerId} onClick={() => review(claim, 'REJECT')}>REJECT</Button>
                            </Stack>
                        </Box>
                    );
                })}
            </Stack>
        </Paper>
    );
}
