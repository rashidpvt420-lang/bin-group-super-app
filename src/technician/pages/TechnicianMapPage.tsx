/**
 * BIN GROUP — TechnicianMapPage
 * Mission navigation center with live GPS tracking status.
 * Shows technician's current location vs. job destination,
 * real-time distance/ETA, and navigation shortcuts.
 */
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, CircularProgress,
    Stack, Button, alpha, Grid, Divider, Chip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    MapPin, Navigation, Compass, Info,
    ExternalLink, LocateFixed, ShieldAlert, Wifi, WifiOff, Clock
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, doc } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildGoogleMapsSearchUrl } from '../../lib/maps';
import { resolvePropertyLocation } from '../../utils/propertyLocationResolver';
import {
    calculateDistanceKm, calculateEtaMinutes,
    getTechnicianLocation, getTicketJobLocation,
    getStaleLabel, isLocationStale
} from '../../utils/liveTracking';


const ACTIVE_STATUSES = [
    'accepted', 'on_the_way', 'arrived', 'in_progress', 'waiting_parts',
    'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WAITING_PARTS'
];

function getNavigationUrl(job: any) {
    const resolved = resolvePropertyLocation(job);
    return resolved.googleMapsUrl;
}

function hasDispatchLocation(job: any) {
    const resolved = resolvePropertyLocation(job);
    return resolved.locationQuality !== 'MISSING';
}

export default function TechnicianMapPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<any[]>([]);
    const [techProfile, setTechProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Active jobs listener
    useEffect(() => {
        if (!user?.uid) { setLoading(false); return; }
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', user.uid),
            where('status', 'in', ACTIVE_STATUSES.slice(0, 10))
        );
        const unsub = onSnapshot(q, (snap) => {
            setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (error) => {
            console.error('[TechnicianMap] Active mission listener failed:', error);
            setJobs([]);
            setLoading(false);
        });
        return () => unsub();
    }, [user?.uid]);

    // Technician profile (for their own currentLocation)
    useEffect(() => {
        if (!user?.uid) return;
        const unsub = onSnapshot(doc(db, 'technicians', user.uid), (snap) => {
            if (snap.exists()) setTechProfile({ id: snap.id, ...snap.data() });
        });
        return () => unsub();
    }, [user?.uid]);

    const handleNavigate = (job: any) => {
        // Try to navigate using tech's last known location to job location
        const techLoc = getTechnicianLocation(job) || techProfile?.currentLocation || null;
        const jobLoc  = getTicketJobLocation(job);
        if (jobLoc) {
            const url = techLoc
                ? `https://www.google.com/maps/dir/?api=1&origin=${techLoc.lat},${techLoc.lng}&destination=${jobLoc.lat},${jobLoc.lng}&travelmode=driving`
                : `https://www.google.com/maps/search/?api=1&query=${jobLoc.lat},${jobLoc.lng}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            window.open(getNavigationUrl(job), '_blank', 'noopener,noreferrer');
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 20 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold, mb: 2 }} />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2 }}>
                INITIALIZING GPS DATA...
            </Typography>
        </Box>
    );

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
                    Live GPS tracking is active only when you press ON THE WAY. Your location is only
                    shared with the requester of your specific assigned ticket.
                </Typography>
            </Box>

            {/* Technician live location status */}
            {techProfile?.currentLocation && (
                <Paper sx={{ p: 3, mb: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 5 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        {isLocationStale(techProfile.currentLocation?.updatedAt) ? (
                            <WifiOff size={22} color="#f87171" />
                        ) : (
                            <Wifi size={22} color="#4ade80" />
                        )}
                        <Box>
                            <Typography variant="body2" fontWeight="900" color="#FFF">
                                Your GPS: {isLocationStale(techProfile.currentLocation?.updatedAt) ? 'Stale / Offline' : 'Live'}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                                {techProfile.currentLocation?.lat?.toFixed(5)}, {techProfile.currentLocation?.lng?.toFixed(5)} ·{' '}
                                {getStaleLabel(techProfile.currentLocation?.updatedAt)}
                            </Typography>
                        </Box>
                        {techProfile.isTracking && (
                            <Chip
                                size="small"
                                label="TRACKING ON"
                                sx={{ ml: 'auto', bgcolor: alpha('#10b981', 0.15), color: '#4ade80', fontWeight: 950, fontSize: '0.65rem' }}
                            />
                        )}
                    </Stack>
                </Paper>
            )}

            {jobs.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                        <Compass size={64} color="rgba(255,255,255,0.1)" />
                    </Box>
                    <Typography color="#FFF" variant="h6" fontWeight="950">NO ACTIVE MISSIONS REQUIRING NAVIGATION</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1, maxWidth: '400px', mx: 'auto' }}>
                        Accept a job from the Mission Pool or your Active Queue to begin a new operation.
                    </Typography>
                    <Button variant="outlined" onClick={() => navigate('/technician/jobs')} sx={{ mt: 4, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
                        GO TO JOB LIST
                    </Button>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    {jobs.map(job => {
                        const resolved       = resolvePropertyLocation(job);
                        const dispatchReady  = resolved.locationQuality !== 'MISSING';
                        const isOnTheWay     = ['on_the_way', 'EN_ROUTE'].includes(String(job.status));
                        const techLoc        = getTechnicianLocation(job) || techProfile?.currentLocation || null;
                        const jobLoc         = getTicketJobLocation(job);
                        const dist           = calculateDistanceKm(techLoc, jobLoc);
                        const eta            = calculateEtaMinutes(dist);
                        const locationStale  = isLocationStale(job.technicianLocation?.updatedAt);

                        return (
                            <Grid item xs={12} key={job.id}>
                                <Paper sx={{
                                    overflow: 'hidden', bgcolor: 'rgba(22, 22, 24, 0.7)',
                                    borderRadius: 8,
                                    border: `1px solid ${isOnTheWay ? alpha(binThemeTokens.gold, 0.3) : 'rgba(255,255,255,0.05)'}`,
                                    transition: 'all 0.3s', '&:hover': { borderColor: binThemeTokens.gold, transform: 'translateY(-4px)' }
                                }}>
                                    {/* GPS Map area */}
                                    <Grid container>
                                        <Grid item xs={12} lg={5}>
                                            <Box sx={{
                                                height: { xs: 220, lg: '100%' }, minHeight: 220,
                                                bgcolor: '#0f172a', borderRight: { lg: '1px solid rgba(255,255,255,0.06)' },
                                                display: 'grid', placeItems: 'center', p: 3, position: 'relative'
                                            }}>
                                                {/* Static map fallback with GPS visual */}
                                                {jobLoc ? (
                                                    <Box sx={{ width: '100%', height: '100%', position: 'absolute', inset: 0, overflow: 'hidden' }}>
                                                        <img
                                                            src={`https://maps.googleapis.com/maps/api/staticmap?center=${jobLoc.lat},${jobLoc.lng}&zoom=15&size=400x220&maptype=roadmap&markers=color:red%7C${jobLoc.lat},${jobLoc.lng}${techLoc ? `&markers=color:blue%7C${techLoc.lat},${techLoc.lng}` : ''}&key=AIzaSyDefault`}
                                                            alt="Job location"
                                                            onError={(e) => { (e.target as any).style.display = 'none'; }}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }}
                                                        />
                                                        {/* Overlay GPS status */}
                                                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.55)' }}>
                                                            {isOnTheWay ? <Navigation size={44} color={binThemeTokens.gold} /> : <LocateFixed size={44} color={binThemeTokens.gold} />}
                                                            {eta !== null && (
                                                                <Chip size="small" icon={<Clock size={11} />} label={`~${eta} min`} sx={{ mt: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.9), color: '#000', fontWeight: 950, '& .MuiChip-icon': { color: '#000' } }} />
                                                            )}
                                                            {dist !== null && (
                                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, mt: 0.5 }}>
                                                                    {dist.toFixed(1)} km away
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </Box>
                                                ) : (
                                                    <Stack spacing={2} alignItems="center" textAlign="center">
                                                        {resolved.hasExactCoordinates
                                                            ? <Navigation size={50} color={binThemeTokens.gold} />
                                                            : <ShieldAlert size={50} color="#ef4444" />
                                                        }
                                                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>
                                                            {resolved.hasExactCoordinates ? 'Navigation Ready' : 'GPS Location Warning'}
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.52)', maxWidth: 340 }}>
                                                            {resolved.hasExactCoordinates
                                                                ? `GPS: ${resolved.latitude}, ${resolved.longitude}`
                                                                : 'Exact GPS pin missing. Navigation precision reduced.'}
                                                        </Typography>
                                                        {dispatchReady && (
                                                            <Button variant="contained" onClick={() => handleNavigate(job)} startIcon={<Navigation size={18} />}
                                                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}>
                                                                {resolved.hasExactCoordinates ? 'NAVIGATE' : 'NAVIGATE TO AREA'}
                                                            </Button>
                                                        )}
                                                    </Stack>
                                                )}
                                            </Box>
                                        </Grid>

                                        {/* Job info + actions */}
                                        <Grid item xs={12} lg={7}>
                                            <Box sx={{ p: 4 }}>
                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', md: 'center' }}>
                                                    <Box sx={{ width: 72, height: 72, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: binThemeTokens.gold, flexShrink: 0 }}>
                                                        <LocateFixed size={36} />
                                                    </Box>
                                                    <Box sx={{ flex: 1 }}>
                                                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
                                                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>
                                                                REF #{job.id.substring(0, 8)}
                                                            </Typography>
                                                            <Chip size="small" label={String(job.status || 'MISSION').replace(/_/g, ' ').toUpperCase()}
                                                                sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, fontSize: '0.65rem' }} />
                                                            {isOnTheWay && (
                                                                <Chip size="small"
                                                                    icon={locationStale ? <WifiOff size={11} /> : <Wifi size={11} />}
                                                                    label={locationStale ? 'GPS STALE' : 'GPS LIVE'}
                                                                    sx={{
                                                                        bgcolor: locationStale ? alpha('#ef4444', 0.1) : alpha('#10b981', 0.1),
                                                                        color: locationStale ? '#f87171' : '#4ade80',
                                                                        fontWeight: 950, fontSize: '0.65rem',
                                                                        '& .MuiChip-icon': { color: locationStale ? '#f87171' : '#4ade80' }
                                                                    }}
                                                                />
                                                            )}
                                                        </Stack>
                                                        <Typography variant="h5" fontWeight="950" color="#FFF">
                                                            {job.propertyName || 'Assigned Property'}
                                                        </Typography>
                                                        <Typography variant="body1" color="textSecondary" sx={{ mt: 0.5, fontWeight: 600 }}>
                                                            Unit {job.unitNumber || 'N/A'} · {job.category || job.complaintCategory || 'Maintenance'}
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <MapPin size={13} />
                                                            {resolved.address || job.jobLocation?.address || 'No address saved'} · {resolved.emirate}
                                                        </Typography>
                                                        {resolved.hasExactCoordinates && (
                                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', mt: 0.5, display: 'block', fontFamily: 'monospace' }}>
                                                                GPS: {resolved.latitude}, {resolved.longitude}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </Stack>

                                                <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.06)' }} />

                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                                    <Button fullWidth variant="outlined"
                                                        onClick={() => navigate(`/technician/job/${job.id}`)}
                                                        sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 950, borderRadius: 4, px: 3 }}
                                                        startIcon={<Info size={18} />}>
                                                        JOB DETAILS
                                                    </Button>
                                                    <Button fullWidth variant="contained"
                                                        disabled={!dispatchReady}
                                                        onClick={() => handleNavigate(job)}
                                                        startIcon={<Navigation size={18} />}
                                                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4, px: 3, '&:hover': { bgcolor: '#eab308' } }}>
                                                        NAVIGATE
                                                    </Button>
                                                    <Button fullWidth variant="outlined"
                                                        disabled={!dispatchReady}
                                                        onClick={() => window.open(getNavigationUrl(job), '_blank', 'noopener,noreferrer')}
                                                        startIcon={<ExternalLink size={18} />}
                                                        sx={{ borderColor: alpha(binThemeTokens.gold, 0.4), color: binThemeTokens.gold, fontWeight: 950, borderRadius: 4, px: 3 }}>
                                                        OPEN MAP
                                                    </Button>
                                                </Stack>
                                            </Box>
                                        </Grid>
                                    </Grid>

                                    {/* Progress bar */}
                                    <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.02)' }}>
                                        <Box sx={{
                                            width: String(job.status || '').toLowerCase() === 'in_progress' ? '75%'
                                                : String(job.status || '').toLowerCase() === 'arrived' ? '50%'
                                                : String(job.status || '').toLowerCase() === 'on_the_way' ? '25%' : '10%',
                                            height: '100%', bgcolor: binThemeTokens.gold,
                                            boxShadow: `0 0 10px ${binThemeTokens.gold}`,
                                            transition: 'width 0.5s ease'
                                        }} />
                                    </Box>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            )}
        </Box>
    );
}