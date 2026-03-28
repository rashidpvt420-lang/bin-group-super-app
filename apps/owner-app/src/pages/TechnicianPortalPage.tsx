import React from 'react';
import { Box, Typography, Container, Paper, Grid, Stack, Button, Chip } from '@mui/material';
import { Wrench, Clock, ShieldCheck, Activity, MapPin } from 'lucide-react';
import { db, collection, query, orderBy, onSnapshot, limit } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';

interface Ticket {
    id: string;
    trade: string;
    description: string;
    status: string;
    priority: string;
    propertyId: string;
    createdAt: any;
}

import { useNavigate } from 'react-router-dom';

export default function TechnicianPortalPage() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [tickets, setTickets] = React.useState<Ticket[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'), limit(10));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ticketData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Ticket));
            setTickets(ticketData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const kpis = [
        { label: t('tech.active_tickets'), val: tickets.filter(t => t.status !== 'CLOSED').length.toString(), trend: t('tech.trend.live'), icon: <Wrench size={24} />, color: binThemeTokens.gold },
        { label: t('tech.kpi.mttr'), val: '1.2h', trend: t('tech.trend.optimal'), icon: <Clock size={24} />, color: binThemeTokens.goldLight },
        { label: t('tech.kpi.sla'), val: '99.2%', trend: t('tech.trend.sovereign'), icon: <ShieldCheck size={24} />, color: binThemeTokens.textPrimary },
        { label: t('tech.kpi.uptime'), val: '100%', trend: t('tech.trend.stable'), icon: <Activity size={24} />, color: binThemeTokens.textPrimary },
    ];

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

            {/* Performance Grid */}
            <Grid container spacing={3} sx={{ mb: 8, position: 'relative', zIndex: 1 }}>
                {kpis.map((kpi, i) => (
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
                {tickets.length > 0 ? tickets.map((ticket, i) => (
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
                                            <Typography variant="subtitle1" fontWeight="900" sx={{ color: '#FFFFFF' }}>{ticket.propertyId || t('tech.unknown_unit')}</Typography>
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
                )) : (
                    <Box sx={{ width: '100%', textAlign: 'center', py: 8 }}>
                         <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary }}>{t('tech.empty')}</Typography>
                    </Box>
                )}
            </Grid>
        </Container>
    );
}
