/**
 * Duty control + dispatch availability GPS for the default technician home.
 *
 * Automatic dispatch only considers technicians who are on duty, and Admin's manual assignment
 * requires a fresh GPS fix. Both controls existed only on the advanced dashboard
 * (/technician/dashboard/full), so a technician using the default home could never become
 * dispatchable. The same server callables are used here; all checks stay server-side.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Typography, alpha } from '@mui/material';
import { Coffee, MapPin, Power } from 'lucide-react';
import { db, doc, collection, functions, httpsCallable, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { ALL_TECHNICIAN_ACTIVE_STATUSES, onSnapshotSplitIn } from '../../shared-exports';
import { AVAILABILITY_REPORT_INTERVAL_MS, reportTechnicianAvailabilityLocation } from '../utils/availabilityLocation';

export type DutyState = 'ON_DUTY' | 'ON_BREAK' | 'OFF_DUTY';

export function normalizeDutyState(dutyStatus: unknown, onDuty?: unknown): DutyState {
  const raw = String(dutyStatus || '').trim().replace(/\s+/g, '_').toUpperCase();
  if (raw === 'BREAK' || raw === 'ON_BREAK' || raw === 'STANDBY') return 'ON_BREAK';
  if (['WORKING', 'ON_DUTY', 'ACTIVE', 'READY', 'AVAILABLE', 'ON_JOB'].includes(raw)) return 'ON_DUTY';
  if (!raw && onDuty === true) return 'ON_DUTY';
  return 'OFF_DUTY';
}

export function dutyCallableFor(current: DutyState, target: DutyState): string {
  if (target === 'ON_BREAK') return 'takeTechnicianBreak';
  if (target === 'OFF_DUTY') return 'endTechnicianDuty';
  return current === 'ON_BREAK' ? 'resumeTechnicianDuty' : 'startTechnicianDuty';
}

function errorText(err: any, fallback: string): string {
  return String(err?.message || '').replace(/^Firebase:\s*/i, '').trim() || fallback;
}

export default function TechnicianDutyAvailabilityCard({ isRTL = false }: { isRTL?: boolean }) {
  const { user } = useRole();
  const { tx } = useLanguage();
  const [duty, setDuty] = useState<DutyState>(normalizeDutyState(user?.dutyStatus));
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [dutyError, setDutyError] = useState('');
  const [gpsError, setGpsError] = useState('');
  const [gpsSharedAt, setGpsSharedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap: any) => {
      const data = snap.data() || {};
      setDuty(normalizeDutyState(data.dutyStatus, data.onDuty));
    }, (err: any) => console.warn('[TechnicianDuty] profile unavailable:', err));
    const unsubJobs = onSnapshotSplitIn(collection(db, 'maintenanceTickets'), { field: 'assignedTechnicianId', value: user.uid }, 'status', ALL_TECHNICIAN_ACTIVE_STATUSES, (jobs: any[]) => {
      setActiveJobCount(jobs.length);
    });
    return () => {
      unsubUser();
      if (typeof unsubJobs === 'function') unsubJobs();
    };
  }, [user?.uid]);

  // First-dispatch bootstrap (same rule as the advanced dashboard): on duty, not on break, no
  // active mission -> share availability GPS so Admin can assign and dispatch can see location.
  const shouldReportAvailability = Boolean(user?.uid) && duty === 'ON_DUTY' && activeJobCount === 0;
  useEffect(() => {
    if (!shouldReportAvailability) return undefined;
    let cancelled = false;
    const report = () => {
      reportTechnicianAvailabilityLocation().then(() => {
        if (!cancelled) { setGpsError(''); setGpsSharedAt(new Date()); }
      }).catch((err) => {
        if (!cancelled) setGpsError(errorText(err, 'Availability location could not be shared.'));
      });
    };
    report();
    const timer = window.setInterval(report, AVAILABILITY_REPORT_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [shouldReportAvailability]);

  const changeDuty = async (target: DutyState) => {
    if (!user?.uid) return;
    setUpdating(true);
    setDutyError('');
    try {
      await httpsCallable(functions, dutyCallableFor(duty, target))({ source: 'technician_simple_dashboard' });
      setDuty(target);
    } catch (err) {
      console.error('[TechnicianDuty] duty change failed', err);
      setDutyError(errorText(err, 'Duty status update failed. Try again or contact dispatch.'));
    } finally {
      setUpdating(false);
    }
  };

  const onDuty = duty === 'ON_DUTY';
  const tone = onDuty ? '#047857' : duty === 'ON_BREAK' ? '#B45309' : '#475569';
  const label = onDuty ? tx('tech.duty.onDuty', 'ON DUTY') : duty === 'ON_BREAK' ? tx('tech.duty.onBreak', 'ON BREAK') : tx('tech.duty.offDuty', 'OFF DUTY');

  return (
    <Paper data-testid="technician-duty-card" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 5, border: `1px solid ${alpha(tone, 0.3)}`, bgcolor: alpha(tone, 0.04) }}>
      <Stack spacing={2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
            <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(tone, 0.1), color: tone, display: 'flex' }}>{duty === 'ON_BREAK' ? <Coffee size={24} /> : <Power size={24} />}</Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#475569', fontWeight: 900, letterSpacing: 1 }}>{tx('tech.duty.title', 'DUTY STATUS')}</Typography>
              <Typography variant="h6" data-testid="technician-duty-state" sx={{ color: tone, fontWeight: 950 }}>{label}</Typography>
            </Box>
          </Stack>
          <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1}>
            {duty === 'OFF_DUTY' ? (
              <Button data-testid="technician-activate-duty" variant="contained" disabled={updating} onClick={() => changeDuty('ON_DUTY')} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, px: 3, '&:hover': { bgcolor: binThemeTokens.goldHover } }}>
                {tx('tech.duty.activate', 'ACTIVATE DUTY')}
              </Button>
            ) : (
              <>
                <Button variant="outlined" disabled={updating} onClick={() => changeDuty(duty === 'ON_BREAK' ? 'ON_DUTY' : 'ON_BREAK')} sx={{ borderColor: binThemeTokens.goldHover, color: binThemeTokens.goldHover, fontWeight: 950 }}>
                  {duty === 'ON_BREAK' ? tx('tech.duty.resume', 'RESUME DUTY') : tx('tech.duty.break', 'TAKE BREAK')}
                </Button>
                <Button variant="outlined" color="error" disabled={updating} onClick={() => changeDuty('OFF_DUTY')} sx={{ fontWeight: 950 }}>
                  {tx('tech.duty.end', 'END SHIFT')}
                </Button>
              </>
            )}
          </Stack>
        </Stack>
        <Typography variant="body2" sx={{ color: '#475569' }}>
          {onDuty
            ? tx('tech.duty.onDutyHelp', 'You can receive new jobs. While you have no active job, your location is shared with dispatch every few minutes.')
            : tx('tech.duty.offDutyHelp', 'Activate duty to receive jobs. New complaints are only routed to on-duty technicians.')}
        </Typography>
        {onDuty && activeJobCount === 0 && !gpsError && gpsSharedAt && (
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" data-testid="technician-availability-gps-ok">
            <MapPin size={16} color="#047857" />
            <Typography variant="caption" sx={{ color: '#047857', fontWeight: 800 }}>
              {tx('tech.duty.gpsShared', 'Dispatch location shared')} {gpsSharedAt.toLocaleTimeString()}
            </Typography>
          </Stack>
        )}
        {dutyError && <Alert severity="warning" data-testid="technician-duty-error">{dutyError}</Alert>}
        {gpsError && <Alert severity="info" data-testid="technician-availability-gps-error">{tx('tech.duty.gpsNotShared', 'Dispatch location not shared:')} {gpsError}</Alert>}
      </Stack>
    </Paper>
  );
}
