import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Grid, Stack, Button, Chip, 
    Divider, CircularProgress, alpha, Avatar, IconButton,
    Tooltip, Skeleton
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
    AlertTriangle, Wrench, FileText, CheckCircle2, 
    Clock, Home, Zap, Sparkles,
    Truck, Trash2, ArrowUpRight, ShieldCheck,
    MessageSquare, MapPin, ChevronRight, Activity,
    User, Phone, Calendar, Info
} from 'lucide-react';
import { db, collection, query, where, getDocs, onSnapshot, limit, orderBy, doc, getDoc } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

export default function TenantDashboardPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    
    const [loading, setLoading] = useState(true);
    const [propertyData, setPropertyData] = useState<any>(null);
    const [unitData, setUnitData] = useState<any>(null);
    const [activeTickets, setActiveTickets] = useState<any[]>([]);
    const [notices, setNotices] = useState<any[]>([]);

    useEffect(() => {
        const fetchResidence = async () => {
            if (!user?.uid) return;
            try {
                // Try finding unit by tenantId
                let unitSnap = await getDocs(query(collection(db, "units"), where("tenantId", "==", user.uid)));
                if (unitSnap.empty && user.email) {
                    unitSnap = await getDocs(query(collection(db, "units"), where("tenantEmail", "==", user.email.toLowerCase())));
                }
                
                if (!unitSnap.empty) {
                    const uData = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
                    setUnitData(uData);

                    if (uData.propertyId) {
                        const propSnap = await getDoc(doc(db, "properties", uData.propertyId));
                        if (propSnap.exists()) {
                            setPropertyData(propSnap.data());
                        }
                    }
                }
            } catch (err) {
                console.error("Residence fetch failed:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchResidence();
    }, [user]);

    useEffect(() => {
        if (!user?.uid) return;
        const qActive = query(
            collection(db, 'maintenanceTickets'),
            where('tenantId', '==', user.uid),
            where('status', 'not-in', ['CLOSED', 'DISPUTED']),
            orderBy('status'),
            orderBy('createdAt', 'desc'),
            limit(3)
        );
        const unsubActive = onSnapshot(qActive, (snap) => {
            setActiveTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn('Active tickets query error:', err));

        // Fetch notices
        const qNotices = query(collection(db, 'systemLogs'), where('type', '==', 'TENANT_NOTICE'), limit(2));
        const unsubNotices = onSnapshot(qNotices, (snap) => {
            setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubActive();
            unsubNotices();
        };
    }, [user]);

    const ADD_ONS = [
        { label: t('onboarding.addon.cleaning') || 'Deep Cleaning', icon: <Sparkles size={20} />, color: '#60a5fa', route: '/tenant/request?category=cleaning' },
        { label: t('onboarding.addon.moving') || 'Moving & Packing', icon: <Truck size={20} />, color: '#a78bfa', route: '/tenant/request?category=moving' },
        { label: t('onboarding.addon.waste') || 'Waste Removal', icon: <Trash2 size={20} />, color: '#f87171', route: '/tenant/request?category=waste' },
        { label: t('onboarding.addon.pest') || 'Pest Control', icon: <ShieldCheck size={20} />, color: '#fbbf24', route: '/tenant/request?category=pest' },
    ];

    if (loading) return (
        <Box sx={{ height: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('dash.initializing_stream') || 'Initializing Residency Stream...'}</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Header / Welcome */}
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('dash.terminal.tenant') || 'SOVEREIGN RESIDENCY'}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1, letterSpacing: -1 }}>
                        {t('dash.hello') || 'Hello'}, {user?.displayName?.split(' ')[0] || 'Resident'}
                    </Typography>
                </Box>
                <Avatar sx={{ width: 56, height: 56, bgcolor: alpha(binThemeTokens.gold, 0.1), border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, color: binThemeTokens.gold, fontWeight: 900 }}>
                    {user?.displayName?.charAt(0) || 'R'}
                </Avatar>
            </Box>

            {/* Quick Action Nodes */}
            <Grid container spacing={3} sx={{ mb: 6 }}>
                <Grid item xs={12} md={7}>
                    <Button 
                        fullWidth 
                        variant="contained" 
                        onClick={() => navigate('/tenant/request')}
                        startIcon={<Wrench size={24} style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }} />}
                        sx={{ 
                            height: 100, 
                            bgcolor: binThemeTokens.gold, 
                            color: '#000', 
                            borderRadius: 4,
                            fontSize: '1.1rem',
                            fontWeight: 950,
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                            gap: 1.5,
                            boxShadow: `0 20px 40px -12px ${alpha(binThemeTokens.gold, 0.3)}`,
                            '&:hover': { bgcolor: '#b4954e', transform: 'translateY(-4px)' },
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                    >
                        {t('dash.new_request') || 'NEW SERVICE REQUEST'}
                    </Button>
                </Grid>
                <Grid item xs={12} md={5}>
                    <Button 
                        fullWidth 
                        variant="outlined" 
                        onClick={() => navigate('/tenant/emergency')}
                        startIcon={<AlertTriangle size={24} style={{ marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }} />}
                        sx={{ 
                            height: 100, 
                            borderColor: '#ef4444', 
                            color: '#ef4444', 
                            borderRadius: 4,
                            fontSize: '1rem',
                            fontWeight: 950,
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                            gap: 1.5,
                            borderWidth: 2,
                            '&:hover': { bgcolor: alpha('#ef4444', 0.1), borderColor: '#ef4444', transform: 'translateY(-4px)' },
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                    >
                        {t('sos.trigger_btn') || 'EMERGENCY (SOS)'}
                    </Button>
                </Grid>
            </Grid>

            <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} lg={8}>
                    {/* Residency Context Card */}
                    <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                        <Stack direction={isRTL ? "row-reverse" : "row"} justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                            <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Home size={18} /> {t('dash.residency_details') || 'RESIDENCY DETAILS'}
                            </Typography>
                            <Chip label={t('status.lease_active') || 'LEASE ACTIVE'} size="small" sx={{ bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 950, fontSize: '0.65rem' }} />
                        </Stack>
                        
                        <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{t('dash.sovereign_asset') || 'SOVEREIGN ASSET'}</Typography>
                                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mt: 0.5 }}>{propertyData?.propertyName || propertyData?.name || t('dash.verifying_location') || 'Verifying Location...'}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                                        <MapPin size={10} /> {propertyData?.emirate || t('dash.sovereign_zone') || 'Sovereign Zone'}
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <Box sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{t('field.unit') || 'UNIT'}</Typography>
                                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mt: 0.5 }}>{unitData?.unitNumber || '—'}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{t('field.level') || 'Level'} {unitData?.floorNumber || '0'}</Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <Box sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                                    <Zap size={20} color={binThemeTokens.gold} />
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 1 }}>{t('status.connected') || 'STABLE'}</Typography>
                                </Box>
                            </Grid>
                        </Grid>
                    </Paper>

                    {/* Active Tracking */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Activity size={20} color={binThemeTokens.gold} /> {t('dash.active_tracking') || 'ACTIVE TRACKING'}
                        </Typography>
                        <Button variant="text" sx={{ color: binThemeTokens.gold, fontWeight: 900 }} onClick={() => navigate('/tenant/tickets')}>{t('common.view_all') || 'View All'}</Button>
                    </Box>

                    {activeTickets.length > 0 ? (
                        <Stack spacing={2}>
                            {activeTickets.map(ticket => (
                                <Paper 
                                    key={ticket.id} 
                                    sx={{ 
                                        p: 3, 
                                        bgcolor: 'rgba(255,255,255,0.02)', 
                                        border: '1px solid rgba(255,255,255,0.05)', 
                                        borderRadius: 4, 
                                        transition: 'all 0.2s',
                                        '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(255,255,255,0.04)' } 
                                    }}
                                >
                                    <Stack direction={isRTL ? "row-reverse" : "row"} justifyContent="space-between" alignItems="center">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}>
                                                <Clock size={20} />
                                            </Box>
                                            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                                <Typography variant="body2" fontWeight="950" color="#FFF">{ticket.description.length > 50 ? ticket.description.substring(0, 50) + '...' : ticket.description}</Typography>
                                                <Typography variant="caption" color="rgba(255,255,255,0.4)" sx={{ fontWeight: 700 }}>
                                                    {t('common.ref') || 'REF'}: {ticket.id.substring(0,8)} · {ticket.category || 'General'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Stack spacing={1} alignItems="flex-end">
                                            <Chip 
                                                label={ticket.status?.replace('_', ' ')} 
                                                size="small"
                                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.6rem' }} 
                                            />
                                            {ticket.assignedTechnicianName && (
                                                <Typography variant="caption" sx={{ color: '#FFF', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <User size={10} /> {ticket.assignedTechnicianName}
                                                </Typography>
                                            )}
                                        </Stack>
                                    </Stack>

                                    {ticket.status === 'IN_PROGRESS' && (
                                        <Box sx={{ mt: 3, p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 2, borderLeft: `4px solid ${binThemeTokens.gold}` }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block' }}>TECHNICIAN EN ROUTE</Typography>
                                                    <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>ETA: {ticket.eta || '15-30 mins'}</Typography>
                                                </Box>
                                                <Button 
                                                    size="small" 
                                                    variant="contained" 
                                                    startIcon={<MessageSquare size={14} />} 
                                                    onClick={() => navigate(`/tenant/chat/${ticket.id}`)}
                                                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 2 }}
                                                >
                                                    CHAT
                                                </Button>
                                            </Stack>
                                        </Box>
                                    )}
                                    
                                    <Box sx={{ mt: 2, textAlign: 'right' }}>
                                        <Button size="small" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }} onClick={() => navigate(`/tenant/ticket/${ticket.id}`)}>VIEW DETAILS</Button>
                                    </Box>
                                </Paper>
                            ))}
                        </Stack>
                    ) : (
                        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: alpha('#10b981', 0.03), border: `1px dashed ${alpha('#10b981', 0.2)}`, borderRadius: 6 }}>
                            <CheckCircle2 color="#10b981" size={48} style={{ margin: '0 auto 16px auto' }} />
                            <Typography variant="body1" fontWeight="950" sx={{ color: '#FFF' }}>{t('dash.sovereign_stability') || 'Sovereign Stability Active'}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{t('dash.no_tickets') || 'No active maintenance tickets in your residence.'}</Typography>
                        </Paper>
                    )}
                </Grid>

                <Grid item xs={12} lg={4}>
                    {/* Documents & Notices */}
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }}>
                        <FileText size={20} color={binThemeTokens.gold} /> {t('dash.documents_notices') || 'DOCUMENTS & NOTICES'}
                    </Typography>
                    
                    <Stack spacing={2} sx={{ mb: 4 }}>
                        {notices.length > 0 ? notices.map(notice => (
                            <Paper key={notice.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                                <Typography variant="body2" fontWeight="900" color={binThemeTokens.gold}>{notice.title || 'System Update'}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 0.5 }}>{notice.message || 'The building system is being updated.'}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', mt: 1, display: 'block' }}>{notice.timestamp?.toDate().toLocaleDateString()}</Typography>
                            </Paper>
                        )) : (
                            <Box sx={{ p: 3, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 3, border: '1px dashed rgba(255,255,255,0.05)' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>No current notices.</Typography>
                            </Box>
                        )}
                        <Button fullWidth variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900 }} onClick={() => navigate('/tenant/documents')}>
                            OPEN DOCUMENT VAULT
                        </Button>
                    </Stack>

                    {/* Sovereign Add-ons */}
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }}>
                        <Sparkles size={20} color={binThemeTokens.gold} /> {t('dash.sovereign_addons') || 'SOVEREIGN ADD-ONS'}
                    </Typography>
                    <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        {ADD_ONS.map((service, idx) => (
                            <Grid item xs={6} key={idx}>
                                <Paper 
                                    onClick={() => navigate(service.route)}
                                    sx={{ 
                                        p: 2.5, 
                                        cursor: 'pointer',
                                        bgcolor: 'rgba(15, 23, 42, 0.4)', 
                                        border: '1px solid rgba(255,255,255,0.05)', 
                                        borderRadius: 4,
                                        transition: 'all 0.2s',
                                        textAlign: isRTL ? 'right' : 'left',
                                        '&:hover': { transform: 'scale(1.02)', borderColor: service.color, bgcolor: alpha(service.color, 0.05) }
                                    }}
                                >
                                    <Box sx={{ p: 1, bgcolor: alpha(service.color, 0.1), borderRadius: 2, color: service.color, width: 'fit-content', mb: 1.5, ml: isRTL ? 'auto' : 0 }}>
                                        {service.icon}
                                    </Box>
                                    <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF', fontSize: '0.75rem' }}>{service.label}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 900, mt: 0.5, display: 'block' }}>REQUEST</Typography>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Grid>
            </Grid>

            {/* Concierge Support */}
            <Paper sx={{ p: 4, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                <Grid container spacing={3} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={12} md={8}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <ShieldCheck size={18} /> {t('dash.sovereign_assistance') || 'SOVEREIGN ASSISTANCE'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                            {t('dash.concierge_desc') || 'Need immediate concierge help? Our Sovereign Support team is available 24/7 for residents.'}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={4} sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                        <Button variant="outlined" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }} startIcon={<MessageSquare size={16} style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} />}>
                            {t('dash.live_concierge') || 'LIVE CONCIERGE'}
                        </Button>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}
