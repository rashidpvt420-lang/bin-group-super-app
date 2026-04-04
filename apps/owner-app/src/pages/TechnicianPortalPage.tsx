import React from 'react';
import { Box, Typography, Container, Paper, Grid, Stack, Button, Chip, alpha, CircularProgress } from '@mui/material';
import { Wrench, Clock, ShieldCheck, Activity, MapPin, Navigation, ArrowRight, Calendar } from 'lucide-react';
import { db, collection, query, orderBy, onSnapshot, limit, where } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import { useNavigate } from 'react-router-dom';

interface Ticket {
    id: string;
    trade: string;
    description: string;
    status: string;
    priority: string;
    propertyId: string;
    createdAt: any;
    assignedTechnicianId?: string;
    preferredTiming?: string;
    propertyLocation?: {
        unitNumber: string;
        propertyType: string;
        address: string;
        location?: { lat: number; lng: number };
        propertyName: string;
    };
}

export default function TechnicianPortalPage() {
    const { t } = useLanguage();
    const { user } = useRole();
    const navigate = useNavigate();
    const [tickets, setTickets] = React.useState<Ticket[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        if (!user?.uid) return;

        // Query tickets assigned to this technician
        const q = query(
            collection(db, 'maintenanceTickets'), 
            where('assignedTechnicianId', '==', user.uid),
            orderBy('createdAt', 'desc'), 
            limit(20)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ticketData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Ticket));
            setTickets(ticketData);
            setLoading(false);
        }, (error) => {
            console.error("Failed to fetch assigned tickets:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const activeDispatches = tickets.filter(t => t.status === 'assigned');
    const recentMissions = tickets.filter(t => t.status !== 'assigned');

    const handleNavigate = (ticket: Ticket) => {
        if (!ticket.propertyLocation) return;
        const loc = ticket.propertyLocation;
        let query = '';
        
        // Handle both simple objects and Firestore GeoPoints
        if (loc.location) {
            const lat = (loc.location as any).lat ?? (loc.location as any).latitude;
            const lng = (loc.location as any).lng ?? (loc.location as any).longitude;
            if (lat !== undefined && lng !== undefined) {
                query = `${lat},${lng}`;
            }
        }
        
        if (!query) {
            query = encodeURIComponent(`${loc.address}, ${loc.propertyName}`);
        }
        
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    };

    const formatPreferredTime = (timing?: string) => {
        if (!timing || timing === 'ASAP') return 'ASAP (Immediate)';
        try {
            const date = new Date(timing);
            return date.toLocaleString('en-AE', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } catch (e) {
            return timing;
        }
    };

    const kpis = [
        { label: t('tech.active_tickets'), val: tickets.filter(t => t.status !== 'CLOSED' && t.status !== 'RESOLVED').length.toString(), trend: t('tech.trend.live'), icon: <Wrench size={24} />, color: binThemeTokens.gold },
        { label: t('tech.kpi.mttr'), val: '1.2h', trend: t('tech.trend.optimal'), icon: <Clock size={24} />, color: binThemeTokens.goldLight },
        { label: t('tech.kpi.sla'), val: '99.2%', trend: t('tech.trend.sovereign'), icon: <ShieldCheck size={24} />, color: binThemeTokens.textPrimary },
        { label: t('tech.kpi.uptime'), val: '100%', trend: t('tech.trend.stable'), icon: <Activity size={24} />, color: binThemeTokens.textPrimary },
    ];

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#0B0B0C' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: { xs: 4, md: 8 } }}>
            {/* Background Glows */}
            <Box sx={{ position: 'fixed', top: -200, right: -200, width: 600, height: 600, borderRadius: '50%', background: 'rgba(198,167,94,0.03)', filter: 'blur(100px)', zIndex: 0, pointerEvents: 'none' }} />
            
            <Box sx={{ mb: 8, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3, position: 'relative', zIndex: 1 }}>
                <Box>
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF', letterSpacing: -1, fontSize: { xs: '2.5rem', md: '3.5rem' } }}>{t('tech.service_node')}</Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 500 }}>{t('tech.subtitle')}</Typography>
                </Box>
                <Chip label={t('tech.protocol')} sx={{ bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, px: 2 }} />
            </Box>

            {/* ACTIVE DISPATCH CARD - HIGH VISIBILITY */}
            {activeDispatches.length > 0 && (
                <Box sx={{ mb: 8, position: 'relative', zIndex: 1 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4, mb: 2, display: 'block' }}>
                        ● LIVE FIELD OPERATIONS
                    </Typography>
                    <Stack spacing={3}>
                        {activeDispatches.map((ticket) => (
                            <Paper 
                                key={ticket.id}
                                sx={{ 
                                    p: 0, 
                                    overflow: 'hidden',
                                    bgcolor: alpha(binThemeTokens.gold, 0.05), 
                                    border: `2px solid ${binThemeTokens.gold}`,
                                    borderRadius: 6,
                                    boxShadow: `0 0 40px ${alpha(binThemeTokens.gold, 0.1)}`
                                }}
                            >
                                <Grid container>
                                    <Grid item xs={12} md={8} sx={{ p: { xs: 3, md: 4 } }}>
                                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                                            <Chip 
                                                label="URGENT DISPATCH" 
                                                size="small" 
                                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 1 }} 
                                            />
                                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>
                                                ID: {ticket.id.toUpperCase()}
                                            </Typography>
                                        </Stack>
                                        
                                        <Typography variant="h4" fontWeight="900" sx={{ color: '#FFF', mb: 1, fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
                                            {ticket.description}
                                        </Typography>
                                        
                                        <Grid container spacing={3} sx={{ mt: 1 }}>
                                            <Grid item xs={6} md={4}>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block' }}>ASSET</Typography>
                                                <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 900 }}>
                                                    {ticket.propertyLocation?.propertyType || 'Villa'} {ticket.propertyLocation?.unitNumber || ticket.propertyId}
                                                </Typography>
                                            </Grid>
                                            <Grid item xs={6} md={8}>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block' }}>ADDRESS</Typography>
                                                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>
                                                    {ticket.propertyLocation?.address || 'Navigate for details'}
                                                </Typography>
                                            </Grid>
                                        </Grid>
                                    </Grid>
                                    
                                    <Grid item xs={12} md={4} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                                        {/* PREFERRED TIME SECTION */}
                                        <Box sx={{ mb: 1, p: 2, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), border: `1px dashed ${alpha(binThemeTokens.gold, 0.3)}` }}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Calendar size={16} color={binThemeTokens.gold} />
                                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>PREFERRED TIME</Typography>
                                            </Stack>
                                            <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 900, mt: 0.5 }}>
                                                {formatPreferredTime(ticket.preferredTiming)}
                                            </Typography>
                                        </Box>

                                        <Button 
                                            variant="contained" 
                                            fullWidth
                                            size="large"
                                            startIcon={<Navigation size={20} />}
                                            onClick={() => handleNavigate(ticket)}
                                            sx={{ 
                                                bgcolor: binThemeTokens.gold, 
                                                color: '#000', 
                                                fontWeight: 900, 
                                                py: 2,
                                                borderRadius: 3,
                                                '&:hover': { bgcolor: binThemeTokens.goldLight }
                                            }}
                                        >
                                            Navigate to Asset
                                        </Button>
                                        <Button 
                                            variant="outlined" 
                                            fullWidth
                                            endIcon={<ArrowRight size={20} />}
                                            onClick={() => navigate(`/tech/ticket/${ticket.id}`)}
                                            sx={{ 
                                                borderColor: alpha(binThemeTokens.gold, 0.5), 
                                                color: binThemeTokens.gold, 
                                                fontWeight: 900, 
                                                py: 1.5,
                                                borderRadius: 3
                                            }}
                                        >
                                            Open Mission Brief
                                        </Button>
                                    </Grid>
                                </Grid>
                            </Paper>
                        ))}
                    </Stack>
                </Box>
            )}

            {/* Performance Grid */}
            <Grid container spacing={3} sx={{ mb: 8, position: 'relative', zIndex: 1 }}>
                {(kpis ?? []).map((kpi, i) => (
                    <Grid item xs={12} sm={6} md={3} key={i}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198,167,94,0.15)', borderRadius: 6, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                            <Box sx={{ color: kpi.color, mb: 3 }}>{kpi.icon}</Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 1 }}>{kpi.label}</Typography>
                            <Typography variant="h4" fontWeight="900" sx={{ color: kpi.color }}>{kpi.val}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, mt: 1, display: 'block' }}>{kpi.trend}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* Mission Log */}
            <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: '#FFFFFF', letterSpacing: 1, position: 'relative', zIndex: 1 }}>{t('tech.mission_dispatch')}</Typography>
            <Grid container spacing={3} sx={{ position: 'relative', zIndex: 1 }}>
                {recentMissions.length > 0 ? recentMissions.map((ticket, i) => (
                    <Grid item xs={12} key={i}>
                        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(22, 22, 24, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5, '&:hover': { border: '1px solid rgba(198,167,94,0.3)', bgcolor: 'rgba(22, 22, 24, 0.6)' } }}>
                            <Grid container alignItems="center" spacing={3}>
                                <Grid item xs={12} md={2}>
                                    <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{ticket.id.substring(0, 8).toUpperCase()}</Typography>
                                    <Chip label={ticket.priority === 'EMERGENCY' ? t('tech.priority.emergency') : t('tech.priority.normal')} size="small" sx={{ mt: 1, fontWeight: 900, fontSize: '0.6rem', bgcolor: ticket.priority === 'EMERGENCY' ? '#ff4d4d' : 'rgba(255,255,255,0.1)', color: '#fff' }} />
                                </Grid>
                                <Grid item xs={12} md={5}>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <MapPin size={18} color={binThemeTokens.textSecondary} />
                                        <Box>
                                            <Typography variant="subtitle1" fontWeight="900" sx={{ color: '#FFFFFF' }}>{ticket.propertyLocation?.propertyName || ticket.propertyId || t('tech.unknown_unit')}</Typography>
                                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{ticket.trade}: {ticket.description}</Typography>
                                        </Box>
                                    </Stack>
                                </Grid>
                                <Grid item xs={12} md={3}>
                                    <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1 }}>{t('tech.status_tracking')}</Typography>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.goldLight, fontWeight: 900, textTransform: 'uppercase' }}>{ticket.status}</Typography>
                                    </Box>
                                </Grid>
                                <Grid item xs={12} md={2}>
                                    <Button 
                                        fullWidth 
                                        variant="outlined" 
                                        onClick={() => navigate(`/tech/ticket/${ticket.id}`)}
                                        sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, borderRadius: 3 }}
                                    >
                                        {t('tech.open_node')}
                                    </Button>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>
                )) : activeDispatches.length === 0 && (
                    <Box sx={{ width: '100%', textAlign: 'center', py: 8 }}>
                         <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary }}>{t('tech.empty')}</Typography>
                    </Box>
                )}
            </Grid>
        </Container>
    );
}
