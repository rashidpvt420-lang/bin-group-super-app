import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, Grid, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { CalendarDays } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import {
  ROSTER_DAY_KEYS, ROSTER_DAY_LABELS, defaultRosterForm, rosterFormFromWeekly, rosterPayloadFromForm, shiftLengthMinutes,
  type RosterForm, type WeeklyRosterPayload,
} from '../../lib/staffRosterForm';

type StaffOption = { uid: string; displayName: string; role: string };

const hours = (minutes: number | null) => (minutes === null ? '—' : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`);

/** P1-9: weekly roster editor (Dubai time). Saving calls hrSetStaffRoster, which drives shift-start reminders and missed clock-out checks. */
export default function StaffRosterEditor({ staff }: { staff: StaffOption[] }) {
  const [uid, setUid] = useState('');
  const [form, setForm] = useState<RosterForm>(defaultRosterForm());
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    setLoading(true);
    setNotice(null);
    httpsCallable(functions, 'hrGetStaffRoster')({ staffId: uid })
      .then((res: any) => {
        if (cancelled) return;
        const weekly = (res?.data?.weekly || null) as WeeklyRosterPayload | null;
        setForm(rosterFormFromWeekly(weekly));
        setSaved(Boolean(weekly));
        if (!weekly) setNotice({ type: 'info', message: 'No roster saved yet. The default 08:00–17:00 (1 h break, 8 working hours), Sunday off, is filled in. Review it, then save.' });
      })
      .catch((error: any) => { if (!cancelled) setNotice({ type: 'error', message: error?.message || 'Could not load this roster.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid]);

  const setDay = (key: keyof RosterForm, patch: Partial<RosterForm[keyof RosterForm]>) => setForm((value) => ({ ...value, [key]: { ...value[key], ...patch } }));

  const save = async () => {
    const checked = rosterPayloadFromForm(form);
    if (!checked.ok) { setNotice({ type: 'error', message: checked.error }); return; }
    setBusy(true);
    setNotice(null);
    try {
      await httpsCallable(functions, 'hrSetStaffRoster')({ staffId: uid, weekly: checked.weekly });
      setSaved(true);
      setNotice({ type: 'success', message: 'Roster saved. Shift-start reminders go out 30 minutes before each shift.' });
    } catch (error: any) {
      setNotice({ type: 'error', message: error?.message || 'Could not save the roster.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper data-testid="hr-roster-editor" sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 }}>
      <Stack direction="row" spacing={1} alignItems="center"><CalendarDays size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight={950}>Weekly roster</Typography></Stack>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.7)', mt: 1 }}>Dubai time (GST). Overtime starts after 8 working hours; unpaid breaks are not counted.</Typography>
      <TextField select fullWidth label="Staff" value={uid} onChange={(e) => setUid(e.target.value)} sx={{ mt: 2 }} inputProps={{ 'data-testid': 'hr-roster-staff' }}>
        {staff.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName} · {member.role}</MenuItem>)}
      </TextField>
      {notice && <Alert severity={notice.type} sx={{ mt: 2 }} data-testid="hr-roster-notice">{notice.message}</Alert>}
      {uid && (loading ? <CircularProgress size={20} sx={{ mt: 2 }} /> : (
        <Grid container spacing={1} sx={{ mt: 1 }}>
          {ROSTER_DAY_KEYS.map((key, index) => {
            const day = form[key];
            return (
              <Grid item xs={12} key={key}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ width: 96, fontWeight: 800 }}>{ROSTER_DAY_LABELS[index]}</Typography>
                  <FormControlLabel control={<Checkbox checked={day.off} onChange={(e) => setDay(key, { off: e.target.checked })} />} label="Off" />
                  <TextField size="small" type="time" label="Start" disabled={day.off} value={day.start} onChange={(e) => setDay(key, { start: e.target.value })} InputLabelProps={{ shrink: true }} />
                  <TextField size="small" type="time" label="End" disabled={day.off} value={day.end} onChange={(e) => setDay(key, { end: e.target.value })} InputLabelProps={{ shrink: true }} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.6)' }}>{day.off ? 'Rest day' : hours(shiftLengthMinutes(day.start, day.end))}</Typography>
                </Stack>
              </Grid>
            );
          })}
          <Grid item xs={12}>
            <Button variant="contained" data-testid="hr-roster-save" disabled={busy} onClick={() => void save()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, mt: 1 }}>
              {busy ? <CircularProgress size={16} color="inherit" /> : saved ? 'UPDATE ROSTER' : 'SAVE ROSTER'}
            </Button>
          </Grid>
        </Grid>
      ))}
    </Paper>
  );
}
