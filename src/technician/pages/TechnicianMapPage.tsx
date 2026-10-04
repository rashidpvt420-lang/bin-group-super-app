/**
 * BIN GROUP — TechnicianMapPage
 * Mission navigation centre with foreground GPS status.
 * Static Maps is a visual preview only; Google Maps opens the actual route.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Box, Typography, Paper, CircularProgress, Stack, Button, alpha, Grid, Divider, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Compass, Info, ExternalLink, LocateFixed, ShieldAlert, Wifi, WifiOff, Clock } from 'lucide-react';
import { collection, doc, onSnapshot, db } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { resolvePropertyLocation } from '../../utils/propertyLocationResolver';
import { calculateDistanceKm, calculateEtaMinutes, getStaleLabel, getTechnicianLocation, getTicketJobLocation, isLocationStale } from '../../utils/liveTracking';
import { onSnapshotSplitIn } from '../../utils/queryUtils';
import { ALL_TECHNICIAN_ACTIVE_STATUSES } from '../../utils/ticketConstants';

// Colours readable on the white technician shell (>= 4.5:1). The page was written for the old dark
// theme: white headings, rgba(255,255,255,.3-.6) secondary text, a #0f172a preview panel whose
// heading the shell forces to dark ink (1.01:1), and a white-on-white JOB DETAILS button.
const MAP_READABLE = {
  ink: '#111827',
  muted: '#475467',
  gold: '#7A5C12',
  green: '#047857',
  red: '#B91C1C',
  line: '#E5E7EB',
} as const;

function buildDirectionsUrl(techLoc: any, jobLoc: any) {
  if (!jobLoc) return 'https://www.google.com/maps';
  if (techLoc) {
    return `https://www.google.com/maps/dir/?api=1&origin=${techLoc.lat},${techLoc.lng}&destination=${jobLoc.lat},${jobLoc.lng}&travelmode=driving`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${jobLoc.lat},${jobLoc.lng}`;
}

function buildSafeStaticMapUrl(jobLoc: any, techLoc: any) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key || !jobLoc) return null;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${jobLoc.lat},${jobLoc.lng}&zoom=15&size=500x280&maptype=roadmap&markers=color:red%7C${jobLoc.lat},${jobLoc.lng}${techLoc ? `&markers=color:blue%7C${techLoc.lat},${techLoc.lng}` : ''}&key=${key}`;
}

function locationTimestamp(location: any, fallback?: any) {
  return location?.serverUpdatedAt || location?.updatedAt || location?.timestamp || fallback || null;
}

export default function TechnicianMapPage() {
  const { user } = useRole();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [techProfile, setTechProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [jobsError, setJobsError] = useState('');
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      setJobsError('Technician identity is unavailable. Sign in again before using Mission Control.');
      return;
    }
    const unsubscribe = onSnapshotSplitIn(
      collection(db, 'maintenanceTickets'),
      { field: 'assignedTechnicianId', value: user.uid },
      'status',
      ALL_TECHNICIAN_ACTIVE_STATUSES,
      (rows) => {
        setJobs(rows);
        setJobsError('');
        setLoading(false);
      },
      (error) => {
        console.error('[TechnicianMap] Active mission listener failed:', error);
        setJobs([]);
        setJobsError('Active missions could not be loaded. This may indicate a network, App Check, permission or Firestore index failure. Mission Control will not report an empty healthy queue.');
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = onSnapshot(doc(db, 'technicians', user.uid), (snapshot) => {
      setTechProfile(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
      setProfileError(snapshot.exists() ? '' : 'Technician operational profile is missing. GPS readiness cannot be verified.');
    }, (error) => {
      console.error('[TechnicianMap] Technician profile listener failed:', error);
      setTechProfile(null);
      setProfileError('Technician GPS profile could not be loaded. Location status is unavailable.');
    });
    return () => unsubscribe();
  }, [user?.uid]);

  const openMap = (job: any) => {
    const techLoc = getTechnicianLocation(job) || techProfile?.currentLocation || null;
    const jobLoc = getTicketJobLocation(job);
    window.open(buildDirectionsUrl(techLoc, jobLoc), '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 20 }}>
        <CircularProgress sx={{ color: binThemeTokens.gold, mb: 2 }} />
        <Typography variant="caption" sx={{ color: MAP_READABLE.muted, fontWeight: 900, letterSpacing: 2 }}>
          INITIALISING MISSION DATA…
        </Typography>
      </Box>
    );
  }

  const profileLocationTimestamp = locationTimestamp(techProfile?.currentLocation, techProfile?.locationUpdatedAt);
  const profileLocationStale = isLocationStale(profileLocationTimestamp, 2);
  const profileTrackingFresh = techProfile?.isTracking === true && techProfile?.currentLocation && !profileLocationStale;

  return (
    <Box>
      <Box sx={{ mb: 5 }}>
        <Typography variant="overline" sx={{ color: MAP_READABLE.gold, fontWeight: 950, letterSpacing: 4 }}>
          FIELD OPERATIONS
        </Typography>
        <Typography variant="h4" fontWeight="950" sx={{ color: MAP_READABLE.ink }}>
          Mission Control & Navigation
        </Typography>
        <Typography variant="body2" sx={{ color: MAP_READABLE.muted, mt: 1, maxWidth: 760 }}>
          GPS sharing is foreground-only and starts when you press ON THE WAY. The in-app time and distance figures are approximate straight-line estimates, not road navigation.
        </Typography>
      </Box>

      {jobsError && <Alert severity="error" data-testid="technician-map-jobs-error" sx={{ mb: 3 }}>{jobsError}</Alert>}
      {profileError && <Alert severity="warning" data-testid="technician-map-profile-error" sx={{ mb: 3 }}>{profileError}</Alert>}

      {techProfile?.currentLocation && (
        <Paper sx={{ p: 3, mb: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 5 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            {profileTrackingFresh ? <Wifi size={22} color={MAP_READABLE.green} /> : <WifiOff size={22} color={MAP_READABLE.red} />}
            <Box>
              <Typography variant="body2" fontWeight="900" sx={{ color: MAP_READABLE.ink }}>
                Your GPS: {profileTrackingFresh ? 'Foreground tracking fresh' : profileLocationStale ? 'Stale / offline' : 'Tracking not active'}
              </Typography>
              <Typography variant="caption" sx={{ color: MAP_READABLE.muted }}>
                {techProfile.currentLocation?.lat?.toFixed?.(5)}, {techProfile.currentLocation?.lng?.toFixed?.(5)} · {getStaleLabel(profileLocationTimestamp)}
              </Typography>
            </Box>
            {profileTrackingFresh && <Chip size="small" label="FOREGROUND GPS ON" sx={{ ml: 'auto', bgcolor: alpha(MAP_READABLE.green, 0.1), color: MAP_READABLE.green, fontWeight: 950, fontSize: '0.65rem' }} />}
          </Stack>
        </Paper>
      )}

      {!jobsError && jobs.length === 0 ? (
        <Paper sx={{ p: 10, textAlign: 'center', bgcolor: '#F8F9FB', borderRadius: 8, border: '1px dashed #D0D5DD' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}><Compass size={64} color="#98A2B3" /></Box>
          <Typography variant="h6" fontWeight="950" sx={{ color: MAP_READABLE.ink }}>NO ACTIVE MISSIONS REQUIRING NAVIGATION</Typography>
          <Typography variant="body2" sx={{ color: MAP_READABLE.muted, mt: 1, maxWidth: 400, mx: 'auto' }}>
            The authenticated production query returned no active assigned mission.
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/technician/jobs')} sx={{ mt: 4, borderColor: binThemeTokens.gold, color: MAP_READABLE.gold, fontWeight: 950 }}>
            GO TO JOB LIST
          </Button>
        </Paper>
      ) : jobs.length > 0 ? (
        <Grid container spacing={4}>
          {jobs.map((job) => {
            const resolved = resolvePropertyLocation(job);
            const techLoc = getTechnicianLocation(job) || techProfile?.currentLocation || null;
            const jobLoc = getTicketJobLocation(job);
            const dist = calculateDistanceKm(techLoc, jobLoc);
            const eta = calculateEtaMinutes(dist);
            const isOnTheWay = ['on_the_way', 'EN_ROUTE', 'ON_THE_WAY'].includes(String(job.status));
            const jobLocationTimestamp = locationTimestamp(job.technicianLocation, job.technicianLocationUpdatedAt);
            const locationStale = isLocationStale(jobLocationTimestamp, 2);
            const staticMapUrl = buildSafeStaticMapUrl(jobLoc, techLoc);

            return (
              <Grid item xs={12} key={job.id}>
                <Paper sx={{ overflow: 'hidden', bgcolor: '#FFFFFF', borderRadius: 8, border: `1px solid ${isOnTheWay ? alpha(binThemeTokens.gold, 0.55) : MAP_READABLE.line}` }}>
                  <Grid container>
                    <Grid item xs={12} lg={5}>
                      <Box data-testid="technician-map-preview" sx={{ minHeight: 240, bgcolor: '#EEF2F6', display: 'grid', placeItems: 'center', p: 3, position: 'relative', overflow: 'hidden' }}>
                        {staticMapUrl ? (
                          <Box component="img" src={staticMapUrl} alt="Static road-map preview of the verified job pin" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />
                        ) : null}
                        <Stack spacing={1.5} alignItems="center" sx={{ position: 'relative', zIndex: 1, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.94)', border: `1px solid ${MAP_READABLE.line}`, borderRadius: 4, px: 2.5, py: 2 }}>
                          {resolved.hasExactCoordinates ? <Navigation size={44} color={MAP_READABLE.gold} /> : <ShieldAlert size={44} color={MAP_READABLE.red} />}
                          <Typography variant="h6" fontWeight="950" sx={{ color: MAP_READABLE.ink }}>{resolved.hasExactCoordinates ? 'Verified pin available' : 'Exact GPS pin missing'}</Typography>
                          {eta !== null && <Chip size="small" icon={<Clock size={11} />} label={`Straight-line estimate ~${eta} min`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.9), color: '#111827', fontWeight: 950, '& .MuiChip-icon': { color: '#111827' } }} />}
                          {dist !== null && <Typography variant="caption" sx={{ color: MAP_READABLE.muted, fontWeight: 700 }}>{dist.toFixed(1)} km approximate straight-line distance · road routing not included</Typography>}
                          <Button variant="contained" onClick={() => openMap(job)} startIcon={<Navigation size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, borderRadius: 4 }}>
                            OPEN TRAFFIC-AWARE GOOGLE MAPS
                          </Button>
                        </Stack>
                      </Box>
                    </Grid>
                    <Grid item xs={12} lg={7}>
                      <Box sx={{ p: 4 }}>
                        <Stack direction="row" spacing={3} alignItems="center">
                          <Box sx={{ width: 72, height: 72, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: MAP_READABLE.gold, flexShrink: 0 }}>
                            <LocateFixed size={36} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 1 }}>
                              <Chip size="small" label={String(job.status || 'MISSION').replace(/_/g, ' ').toUpperCase()} sx={{ bgcolor: alpha(MAP_READABLE.gold, 0.1), color: MAP_READABLE.gold, fontWeight: 950, fontSize: '0.65rem' }} />
                              {isOnTheWay && <Chip size="small" icon={locationStale ? <WifiOff size={11} /> : <Wifi size={11} />} label={locationStale ? 'GPS STALE' : 'FOREGROUND GPS FRESH'} sx={{ bgcolor: alpha(locationStale ? MAP_READABLE.red : MAP_READABLE.green, 0.1), color: locationStale ? MAP_READABLE.red : MAP_READABLE.green, fontWeight: 950, fontSize: '0.65rem' }} />}
                            </Stack>
                            <Typography variant="h5" fontWeight="950" sx={{ color: MAP_READABLE.ink, overflowWrap: 'anywhere' }}>{job.propertyName || 'Assigned Property'}</Typography>
                            <Typography variant="body1" sx={{ color: MAP_READABLE.muted, mt: 0.5, fontWeight: 600 }}>Unit {job.unitNumber || 'N/A'} · {job.category || job.complaintCategory || 'Maintenance'}</Typography>
                            <Typography variant="body2" sx={{ color: MAP_READABLE.muted, mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}><MapPin size={13} />{resolved.address || job.jobLocation?.address || 'No address saved'} · {resolved.emirate}</Typography>
                          </Box>
                        </Stack>
                        <Divider sx={{ my: 3, borderColor: MAP_READABLE.line }} />
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                          <Button fullWidth variant="outlined" onClick={() => navigate(`/technician/job/${job.id}`)} startIcon={<Info size={18} />} sx={{ borderColor: '#D0D5DD', color: MAP_READABLE.ink, bgcolor: '#FFFFFF', fontWeight: 950, borderRadius: 4 }}>JOB DETAILS</Button>
                          <Button fullWidth variant="contained" onClick={() => openMap(job)} startIcon={<ExternalLink size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, borderRadius: 4 }}>OPEN GOOGLE MAPS</Button>
                        </Stack>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      ) : null}
    </Box>
  );
}
