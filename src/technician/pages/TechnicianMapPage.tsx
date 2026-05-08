import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, CircularProgress, 
    Stack, Button, alpha, Grid, Divider 
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
    MapPin, Navigation, Compass, Info, 
    ChevronRight, ExternalLink, LocateFixed
} from 'lucide-react';
import { 
    db, collection, query, where, onSnapshot 
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TechnicianMapPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.uid) return;

        // Query active jobs assigned to the technician
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', user.uid),
            where('status', 'in', ['accepted', 'on_the_way', 'arrived', 'in_progress', 'waiting_parts'])
        );

        const unsub = onSnapshot(q, (snap) => {
            setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => unsub();
    }, [user]);

    const handleNavigate = (job: any) => {
        const query = encodeURIComponent(`${job.propertyName} ${job.location || ''} ${job.emirate || ''}`);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    };

    if (loading) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 20 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold, mb: 2 }} />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2 }}>INITIALIZING GPS DATA...</Typography>
        </Box>
    );

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>FIELD OPERATIONS</Typography>
                <Typography variant="h4" fontWeight="950" color="#FFF">Mission Control & Navigation</Typography>
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
                    <Button 
                        variant="outlined" 
                        onClick={() => navigate('/technician/dashboard')}
                        sx={{ mt: 4, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}
                    >
                        GO TO DASHBOARD
                    </Button>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    {jobs.map(job => (
                        <Grid item xs={12} key={job.id}>
                            <Paper 
                                sx={{ 
                                    p: 0, 
                                    overflow: 'hidden',
                                    bgcolor: 'rgba(22, 22, 24, 0.7)', 
                                    borderRadius: 8, 
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    transition: 'all 0.3s',
                                    '&:hover': { borderColor: binThemeTokens.gold, transform: 'translateY(-4px)' }
                                }}
                            >
                                <Box sx={{ p: 4 }}>
                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems={{ xs: 'flex-start', md: 'center' }}>
                                        <Box 
                                            sx={{ 
                                                width: 80, height: 80, 
                                                borderRadius: 6, 
                                                bgcolor: alpha(binThemeTokens.gold, 0.1),
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: binThemeTokens.gold,
                                                flexShrink: 0
                                            }}
                                        >
                                            <LocateFixed size={40} />
                                        </Box>

                                        <Box sx={{ flex: 1 }}>
                                            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>REF #{job.id.substring(0,8)}</Typography>
                                                <Chip 
                                                    size="small"
                                                    label={job.status?.replace('_', ' ').toUpperCase()} 
                                                    sx={{ 
                                                        bgcolor: alpha(binThemeTokens.gold, 0.1),
                                                        color: binThemeTokens.gold,
                                                        fontWeight: 950,
                                                        fontSize: '0.65rem'
                                                    }} 
                                                />
                                            </Stack>
                                            <Typography variant="h5" fontWeight="950" color="#FFF">{job.propertyName}</Typography>
                                            <Typography variant="body1" color="textSecondary" sx={{ mt: 0.5, fontWeight: 600 }}>
                                                Unit {job.unitNumber} · {job.category}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <MapPin size={14} /> {job.location || 'Location tracking active'} · {job.emirate || 'Dubai'}
                                            </Typography>
                                        </Box>

                                        <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' }, borderColor: 'rgba(255,255,255,0.05)' }} />

                                        <Stack direction="row" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                                            <Button 
                                                fullWidth
                                                variant="outlined" 
                                                onClick={() => navigate(`/technician/job/${job.id}`)}
                                                sx={{ 
                                                    borderColor: 'rgba(255,255,255,0.1)', 
                                                    color: '#FFF', 
                                                    fontWeight: 950,
                                                    borderRadius: 4,
                                                    px: 4
                                                }}
                                                startIcon={<Info size={18} />}
                                            >
                                                DETAILS
                                            </Button>
                                            <Button 
                                                fullWidth
                                                variant="contained" 
                                                onClick={() => handleNavigate(job)}
                                                startIcon={<Navigation size={18} />}
                                                sx={{ 
                                                    bgcolor: binThemeTokens.gold, 
                                                    color: '#000', 
                                                    fontWeight: 950,
                                                    borderRadius: 4,
                                                    px: 4,
                                                    '&:hover': { bgcolor: '#eab308' }
                                                }}
                                            >
                                                NAVIGATE
                                            </Button>
                                        </Stack>
                                    </Stack>
                                </Box>
                                
                                {/* Status Progress Bar (Subtle) */}
                                <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <Box 
                                        sx={{ 
                                            width: job.status === 'in_progress' ? '75%' : job.status === 'arrived' ? '50%' : '25%', 
                                            height: '100%', 
                                            bgcolor: binThemeTokens.gold,
                                            boxShadow: `0 0 10px ${binThemeTokens.gold}`
                                        }} 
                                    />
                                </Box>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
}
