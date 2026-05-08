import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Stack, Chip, CircularProgress, alpha, IconButton } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { FileText, ChevronRight, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { db, collection, query, where, orderBy, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
    'assigned': { color: '#3b82f6', icon: Clock },
    'IN_PROGRESS': { color: binThemeTokens.gold, icon: AlertCircle },
    'closed': { color: '#10b981', icon: CheckCircle2 },
    'emergency': { color: '#ef4444', icon: AlertCircle }
};

export default function TenantTicketsPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.uid) return;
        
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('tenantId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    if (loading) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('dash.initializing_stream') || 'Initializing Ticket Stream...'}</Typography>
        </Box>
    );

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('dash.residency_ops') || 'RESIDENCY OPERATIONS'}</Typography>
                <Typography variant="h4" fontWeight="950" color="#FFF" sx={{ mt: 1 }}>{t('nav.tickets') || 'Maintenance History'}</Typography>
            </Box>

            <Stack spacing={2}>
                {tickets.map(ticket => {
                    const sCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG[ticket.priority === 'emergency' ? 'emergency' : 'assigned'];
                    const Icon = sCfg.icon;

                    return (
                        <Paper 
                            key={ticket.id} 
                            onClick={() => navigate(`/tenant/ticket/${ticket.id}`)}
                            sx={{ 
                                p: 3, 
                                cursor: 'pointer', 
                                bgcolor: 'rgba(15, 23, 42, 0.4)', 
                                border: '1px solid rgba(255,255,255,0.05)', 
                                borderRadius: 6,
                                transition: 'all 0.2s',
                                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(15, 23, 42, 0.6)', transform: 'translateY(-2px)' } 
                            }}
                        >
                            <Stack direction={isRTL ? "row-reverse" : "row"} justifyContent="space-between" alignItems="center">
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="body1" fontWeight="950" color="#FFF" sx={{ mb: 0.5 }}>{ticket.description || t('ticket.no_description') || 'No Description'}</Typography>
                                    <Stack direction={isRTL ? "row-reverse" : "row"} spacing={1} alignItems="center" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                                        <Typography variant="caption" sx={{ fontWeight: 800 }}>
                                            {t('common.ref') || 'REF'}: #{ticket.id.substring(0,8).toUpperCase()}
                                        </Typography>
                                        <Typography variant="caption">•</Typography>
                                        <Typography variant="caption" sx={{ fontWeight: 800 }}>
                                            {t(`category.${ticket.category?.toLowerCase()}`) || ticket.category}
                                        </Typography>
                                    </Stack>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 700, mt: 1, display: 'block' }}>
                                        {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : ''}
                                    </Typography>
                                </Box>
                                <Stack direction={isRTL ? "row-reverse" : "row"} spacing={2} alignItems="center">
                                    <Chip 
                                        icon={<Icon size={14} style={{ marginLeft: isRTL ? 4 : 0, marginRight: isRTL ? 0 : 4 }} />}
                                        label={t(`status.ticket.${ticket.status?.toLowerCase()}`) || ticket.status?.replace('_', ' ')} 
                                        sx={{ 
                                            bgcolor: alpha(sCfg.color, 0.1),
                                            color: sCfg.color,
                                            fontWeight: 950,
                                            fontSize: '0.65rem',
                                            height: 24,
                                            borderRadius: 2,
                                            border: `1px solid ${alpha(sCfg.color, 0.2)}`
                                        }} 
                                    />
                                    <ChevronRight size={18} color="rgba(255,255,255,0.15)" style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                </Stack>
                            </Stack>
                        </Paper>
                    );
                })}
                {tickets.length === 0 && (
                    <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8 }}>
                        <FileText size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                            {t('ticket.no_tickets') || 'NO ACTIVE MAINTENANCE REQUESTS'}
                        </Typography>
                    </Paper>
                )}
            </Stack>
        </Box>
    );
}
