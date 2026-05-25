/**
 * BIN GROUP — TechnicianMapPage
 * Mission navigation center with live GPS status.
 * No static Google API placeholder is used. If VITE_GOOGLE_MAPS_API_KEY is absent,
 * the UI falls back to Google Maps direction links only.
 */
import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Stack, Button, alpha, Grid, Divider, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Compass, Info, ExternalLink, LocateFixed, ShieldAlert, Wifi, WifiOff, Clock } from 'lucide-react';
import { collection, doc, onSnapshot, query, where, db } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { resolvePropertyLocation } from '../../utils/propertyLocationResolver';
import { calculateDistanceKm, calculateEtaMinutes, getStaleLabel, getTechnicianLocation, getTicketJobLocation, isLocationStale } from '../../utils/liveTracking';

const ACTIVE_STATUSES = [
  'accepted', 'on_the_way', 'arrived', 'in_progress', 'waiting_parts',
  'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WAITING_PARTS'
];

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

export default function TechnicianMapPage() {
  const { user } = useRole();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [techProfile, setTechProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'maintenanceTickets'),
      where('assignedTechnicianId', '==', user.uid),
      where('status', 'in', ACTIVE_STATUSES.slice(0, 10))
    );
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      console.error('[TechnicianMap] Active mission listener failed:', error);
      setJobs([]);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, 'technicians', user.uid), (snap) => {
      if (snap.exists()) setTechProfile({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
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
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2 }}>
          INITIALIZING GPS DATA...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 5 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
          FIELD OPERATIONS
        </Typography>
        <Typography variant="h4" fontWeight="950" color="#FFF">
          Mission Control & Navigation
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.46)', mt: 1, maxWidth: 720 }}>
          Live GPS tracking is active only when you press ON THE WAY. Your location is only shared with the requester of your assigned ticket.
        </Typography>
      </Box>

      {techProfile?.currentLocation && (
        <Paper sx={{ p: 3, mb: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 5 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            {isLocationStale(techProfile.currentLocation?.updatedAt) ? <WifiOff size={22} color="#f87171" /> : <Wifi size={22} color="#4ade80" />}
            <Box>
              <Typography variant="body2" fontWeight="900" color="#FFF">
                Your GPS: {isLocationStale(techProfile.currentLocation?.updatedAt) ? 'Stale / Offline' : 'Live'}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {techProfile.currentLocation?.lat?.toFixed?.(5)}, {techProfile.currentLocation?.lng?.toFixed?.(5)} · {getStaleLabel(techProfile.currentLocation?.updatedAt)}
              </Typography>
            </Box>
            {techProfile.isTracking && <Chip size="small" label="TRACKING ON" sx={{ ml: 'auto', bgcolor: alpha('#10b981', 0.15), color: '#4ade80', fontWeight: 950, fontSize: '0.65rem' }} />}
          </Stack>
        </Paper>
      )}

      {jobs.length === 0 ? (
        <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.1)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}><Compass size={64} color="rgba(255,255,255,0.1)" /></Box>
          <Typography color="#FFF" variant="h6" fontWeight="950">NO ACTIVE MISSIONS REQUIRING NAVIGATION</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1, maxWidth: 400, mx: 'auto' }}>
            Accept a job from the Mission Pool or your Active Queue to begin a new operation.
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/technician/jobs')} sx={{ mt: 4, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
            GO TO JOB LIST
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={4}>
          {jobs.map((job) => {
            const resolved = resolvePropertyLocation(job);
            const techLoc = getTechnicianLocation(job) || techProfile?.currentLocation || null;
            const jobLoc = getTicketJobLocation(job);
            const dist = calculateDistanceKm(techLoc, jobLoc);
            const eta = calculateEtaMinutes(dist);
            const isOnTheWay = ['on_the_way', 'EN_ROUTE'].includes(String(job.status));
            const locationStale = isLocationStale(job.technicianLocation?.updatedAt);
            const staticMapUrl = buildSafeStaticMapUrl(jobLoc, techLoc);

            return (
              <Grid item xs={12} key={job.id}>
                <Paper sx={{ overflow: 'hidden', bgcolor: 'rgba(22,22,24,0.7)', borderRadius: 8, border: `1px solid ${isOnTheWay ? alpha(binThemeTokens.gold, 0.3) : 'rgba(255,255,255,0.05)'}` }}>
                  <Grid container>
                    <Grid item xs={12} lg={5}>
                      <Box sx={{ minHeight: 240, bgcolor: '#0f172a', display: 'grid', placeItems: 'center', p: 3, position: 'relative', overflow: 'hidden' }}>
                        {staticMapUrl ? (
                          <Box component="img" src={staticMapUrl} alt="Job location map" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />
                        ) : null}
                        <Stack spacing={1.5} alignItems="center" sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                          {resolved.hasExactCoordinates ? <Navigation size={44} color={binThemeTokens.gold} /> : <ShieldAlert size={44} color="#ef4444" />}
                          <Typography variant="h6" fontWeight="950" color="#FFF">{resolved.hasExactCoordinates ? 'Navigation Ready' : 'GPS Location Warning'}</Typography>
                          {eta !== null && <Chip size="small" icon={<Clock size={11} />} label={`Arrives in ~${eta} min`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.9), color: '#000', fontWeight: 950, '& .MuiChip-icon': { color: '#000' } }} />}
                          {dist !== null && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{dist.toFixed(1)} km away</Typography>}
                          <Button variant="contained" onClick={() => openMap(job)} startIcon={<Navigation size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}>
                            OPEN IN GOOGLE MAPS
                          </Button>
                        </Stack>
                      </Box>
                    </Grid>
                    <Grid item xs={12} lg={7}>
                      <Box sx={{ p: 4 }}>
                        <Stack direction="row" spacing={3} alignItems="center">
                          <Box sx={{ width: 72, height: 72, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: binThemeTokens.gold, flexShrink: 0 }}>
                            <LocateFixed size={36} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 1 }}>
                              <Chip size="small" label={String(job.status || 'MISSION').replace(/_/g, ' ').toUpperCase()} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, fontSize: '0.65rem' }} />
                              {isOnTheWay && <Chip size="small" icon={locationStale ? <WifiOff size={11} /> : <Wifi size={11} />} label={locationStale ? 'GPS STALE' : 'GPS LIVE'} sx={{ bgcolor: locationStale ? alpha('#ef4444', 0.1) : alpha('#10b981', 0.1), color: locationStale ? '#f87171' : '#4ade80', fontWeight: 950, fontSize: '0.65rem' }} />}
                            </Stack>
                            <Typography variant="h5" fontWeight="950" color="#FFF" sx={{ overflowWrap: 'anywhere' }}>{job.propertyName || 'Assigned Property'}</Typography>
                            <Typography variant="body1" color="textSecondary" sx={{ mt: 0.5, fontWeight: 600 }}>Unit {job.unitNumber || 'N/A'} · {job.category || job.complaintCategory || 'Maintenance'}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}><MapPin size={13} />{resolved.address || job.jobLocation?.address || 'No address saved'} · {resolved.emirate}</Typography>
                          </Box>
                        </Stack>
                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.06)' }} />
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                          <Button fullWidth variant="outlined" onClick={() => navigate(`/technician/job/${job.id}`)} startIcon={<Info size={18} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 950, borderRadius: 4 }}>JOB DETAILS</Button>
                          <Button fullWidth variant="contained" onClick={() => openMap(job)} startIcon={<ExternalLink size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}>OPEN MAP</Button>
                        </Stack>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
