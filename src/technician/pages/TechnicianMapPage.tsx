import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, CircularProgress,
    Stack, Button, alpha, Grid, Divider, Chip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    MapPin, Navigation, Compass, Info,
    ExternalLink, LocateFixed, ShieldAlert
} from 'lucide-react';
import {
    db, collection, query, where, onSnapshot
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildGoogleMapsSearchUrl } from '../../lib/maps';
import { resolvePropertyLocation } from '../../utils/propertyLocationResolver';

const ACTIVE_STATUSES = ['accepted', 'on_the_way', 'arrived', 'in_progress', 'waiting_parts', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WAITING_PARTS'];

function getJobLatLng(job: any) {
    const resolved = resolvePropertyLocation(job);
    if (resolved.hasExactCoordinates) {
        return { lat: resolved.latitude!, lng: resolved.longitude! };
    }
    return null;
}

function getNavigationUrl(job: any) {
    const resolved = resolvePropertyLocation(job);
    return resolved.googleMapsUrl;
}

function hasDispatchLocation(job: any) {
    const resolved = resolvePropertyLocation(job);
    return resolved.locationQuality !== "MISSING";
}

export default function TechnicianMapPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<any[]>([]);
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
            setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (error) => {
            console.error('[TechnicianMap] Active mission listener failed:', error);
            setJobs([]);
            setLoading(false);
        });

        return () => unsub();
    }, [user?.uid]);

    const handleNavigate = (job: any) => {
        window.open(getNavigationUrl(job), '_blank', 'noopener,noreferrer');
    };

    if (loading) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 20 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold, mb: 2 }} />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2 }}>INITIALIZING GPS DATA...</Typography>
        </Box>
    );

    return (
        <Box>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>FIELD OPERATIONS</Typography>
                <Typography variant="h4" fontWeight="950" color="#FFF">Mission Control & Navigation</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.46)', mt: 1, maxWidth: 720 }}>
                    Mission navigation uses saved property coordinates first, then address fallback. External Google Maps navigation remains available even when embedded maps fail.
                </Typography>
            </Box>

            {jobs.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                        <Compass size={64} color="rgba(255,255,255,0.1)" />
                    </Box>
                    <Typography color="#FFF" variant="h6" fontWeight="950">NO ACTIVE MISSIONS REQUIRING NAVIGATION</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1, maxWidth: '400px', mx: 'auto' }}>
                        Check the Mission Pool or your Active Queue to begin a new operation.
                    </Typography>
                    <Button variant="outlined" onClick={() => navigate('/technician')} sx={{ mt: 4, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
                        GO TO DASHBOARD
                    </Button>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    {jobs.map(job => {
                        const resolved = resolvePropertyLocation(job);
                        const coords = resolved.hasExactCoordinates ? { lat: resolved.latitude!, lng: resolved.longitude! } : null;
                        const dispatchReady = resolved.locationQuality !== "MISSING";
                        return (
                            <Grid item xs={12} key={job.id}>
                                <Paper sx={{ overflow: 'hidden', bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', transition: 'all 0.3s', '&:hover': { borderColor: binThemeTokens.gold, transform: 'translateY(-4px)' } }}>
                                    <Grid container>
                                        <Grid item xs={12} lg={5}>
                                            <Box sx={{ height: { xs: 260, lg: '100%' }, minHeight: 260, bgcolor: '#0f172a', borderRight: { lg: '1px solid rgba(255,255,255,0.06)' }, display: 'grid', placeItems: 'center', p: 3 }}>
                                                <Stack spacing={2} alignItems="center" textAlign="center">
                                                    {resolved.hasExactCoordinates ? <Navigation size={50} color={binThemeTokens.gold} /> : <ShieldAlert size={50} color="#ef4444" />}
                                                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>
                                                        {resolved.hasExactCoordinates ? 'Navigation Ready' : 'GPS Location Warning'}
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.52)', maxWidth: 340 }}>
                                                        {resolved.hasExactCoordinates 
                                                            ? `GPS coordinates saved: ${resolved.latitude}, ${resolved.longitude}` 
                                                            : `Exact GPS pin missing. Technician dispatch cannot be guaranteed.`}
                                                    </Typography>
                                                    {dispatchReady && (
                                                        <Button variant="contained" onClick={() => handleNavigate(job)} startIcon={<Navigation size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}>
                                                            {resolved.hasExactCoordinates ? 'START GOOGLE NAVIGATION' : 'NAVIGATE TO FALLBACK AREA'}
                                                        </Button>
                                                    )}
                                                </Stack>
                                            </Box>
                                        </Grid>
                                        <Grid item xs={12} lg={7}>
                                            <Box sx={{ p: 4 }}>
                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems={{ xs: 'flex-start', md: 'center' }}>
                                                    <Box sx={{ width: 80, height: 80, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: binThemeTokens.gold, flexShrink: 0 }}>
                                                        <LocateFixed size={40} />
                                                    </Box>
 
                                                    <Box sx={{ flex: 1 }}>
                                                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap' }}>
                                                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>REF #{job.id.substring(0, 8)}</Typography>
                                                            <Chip size="small" label={String(job.status || 'MISSION').replace('_', ' ').toUpperCase()} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, fontSize: '0.65rem' }} />
                                                            <Chip size="small" label={resolved.hasExactCoordinates ? 'GPS READY' : 'GPS REQUIRED'} sx={{ bgcolor: resolved.hasExactCoordinates ? alpha('#22c55e', 0.13) : alpha('#ef4444', 0.13), color: resolved.hasExactCoordinates ? '#86efac' : '#f87171', fontWeight: 950, fontSize: '0.65rem' }} />
                                                        </Stack>
                                                        <Typography variant="h5" fontWeight="950" color="#FFF">{job.propertyName || 'Assigned Property'}</Typography>
                                                        <Typography variant="body1" color="textSecondary" sx={{ mt: 0.5, fontWeight: 600 }}>Unit {job.unitNumber || 'N/A'} · {job.category || 'Maintenance'}</Typography>
                                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <MapPin size={14} /> {resolved.address || 'No address saved'} · {resolved.emirate}
                                                        </Typography>
                                                        {resolved.hasExactCoordinates && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.34)', mt: 1, display: 'block', fontFamily: 'monospace' }}>GPS: {resolved.latitude}, {resolved.longitude}</Typography>}
                                                    </Box>
                                                </Stack>
 
                                                <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.06)' }} />
 
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                                    <Button fullWidth variant="outlined" onClick={() => navigate(`/technician/job/${job.id}`)} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 950, borderRadius: 4, px: 4 }} startIcon={<Info size={18} />}>DETAILS</Button>
                                                    <Button fullWidth variant="contained" disabled={!dispatchReady} onClick={() => handleNavigate(job)} startIcon={<Navigation size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4, px: 4, '&:hover': { bgcolor: '#eab308' } }}>NAVIGATE</Button>
                                                    <Button fullWidth variant="outlined" disabled={!dispatchReady} onClick={() => window.open(resolved.googleMapsUrl, '_blank', 'noopener,noreferrer')} startIcon={<ExternalLink size={18} />} sx={{ borderColor: alpha(binThemeTokens.gold, 0.4), color: binThemeTokens.gold, fontWeight: 950, borderRadius: 4, px: 4 }}>OPEN MAP</Button>
                                                </Stack>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                    <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.02)' }}>
                                        <Box sx={{ width: String(job.status || '').toLowerCase() === 'in_progress' ? '75%' : String(job.status || '').toLowerCase() === 'arrived' ? '50%' : '25%', height: '100%', bgcolor: binThemeTokens.gold, boxShadow: `0 0 10px ${binThemeTokens.gold}` }} />
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