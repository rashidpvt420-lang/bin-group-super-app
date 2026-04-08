import React from 'react';
import { Box, Typography, Container, Paper, Grid, Stack, Button, Chip, alpha, CircularProgress, Tabs, Tab, Switch, FormControlLabel, Alert } from '@mui/material';
import { Wrench, Clock, ShieldCheck, Activity, MapPin, Navigation, ArrowRight, Calendar, UserCheck, Briefcase, Trophy, Zap, Globe, BellRing } from 'lucide-react';
import { db, collection, query, orderBy, onSnapshot, limit, where, or, app, getMessaging, isSupported, getToken as getFcmToken, updateDoc, doc, writeBatch, serverTimestamp } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';

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
    const { t, isRTL } = useLanguage();
    const { user } = useRole();
    const navigate = useNavigate();
    const [tickets, setTickets] = React.useState<Ticket[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [notifStatus, setNotifStatus] = React.useState<NotificationPermission>(typeof Notification !== 'undefined' ? Notification.permission : 'default');
    const [activeTab, setActiveTab] = React.useState(0);
    const [userData, setUserData] = React.useState<any>(null);
    const [notifError, setNotifError] = React.useState<string | null>(null);
    const [notifLoading, setNotifLoading] = React.useState(false);

    const handleEnableNotifications = async () => {
        setNotifLoading(true);
        setNotifError(null);
        
        if (typeof window === 'undefined' || !user?.uid) {
            setNotifError("V3 Protocol Error: Authorization node missing.");
            setNotifLoading(false);
            return;
        }
        
        try {
            const messagingSupported = await isSupported();
            if (!messagingSupported) {
                throw new Error("This browser does not support Sovereign Push protocols.");
            }

            const messaging = getMessaging(app);
            const permission = await Notification.requestPermission();
            setNotifStatus(permission);
            
            if (permission === 'granted') {
                await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                const registration = await navigator.serviceWorker.ready;
                const token = await getFcmToken(messaging, { 
                    vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ',
                    serviceWorkerRegistration: registration 
                });
                
                if (token) {
                    await updateDoc(doc(db, 'users', user.uid), {
                        fcmToken: token,
                        notifEnabledAt: serverTimestamp()
                    });
                    alert(t('tech.notif_handshake_success'));
                } else {
                    throw new Error("FCM_TOKEN_GENERATION_FAILED: Check VAPID key configuration.");
                }
            } else {
                throw new Error("PERMISSION_DENIED: Apple/User blocked the communication link.");
            }
        } catch (err: any) {
            console.error("📍 [V3-PATCH] Notification Failure bypass:", err);
            setNotifError("Notifications could not be enabled right now. Please try again after refreshing the app. If the issue continues, contact admin support.");
        } finally {
            setNotifLoading(false);
        }
    };

    React.useEffect(() => {
        if (!user?.uid) return;

        const userUnsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
            if (snap.exists()) setUserData(snap.data());
        });

        const q = query(
            collection(db, 'maintenanceTickets'), 
            or(
                where('status', '==', 'OPEN'),
                where('assignedTechnicianId', '==', user?.uid)
            ),
            orderBy('createdAt', 'desc'),
            limit(100)
        );

        const ticketsUnsub = onSnapshot(q, (snapshot) => {
            const ticketData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));
            setTickets(ticketData);
            setLoading(false);
        });

        return () => { userUnsub(); ticketsUnsub(); };
    }, [user]);

    const toggleDutyStatus = async () => {
        if (!user?.uid || !userData) return;
        const newStatus = !userData.isOffDuty;
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                isOffDuty: newStatus,
                updatedAt: serverTimestamp()
            });
        } catch (err) { console.error("Duty Toggle Failed:", err); }
    };

    const activeDispatches = tickets.filter(t => t.assignedTechnicianId === user?.uid && (t.status === 'assigned' || t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS' || t.status === 'EN_ROUTE'));
    const missionPool = tickets.filter(t => t.status === 'OPEN');

    const handleNavigate = (ticket: Ticket) => {
        if (!ticket.propertyLocation) return;
        const loc = ticket.propertyLocation;
        let queryStr = loc.location ? `${(loc.location as any).lat},${(loc.location as any).lng}` : encodeURIComponent(`${loc.address}, ${loc.propertyName}`);
        window.open(`https://www.google.com/maps/search/?api=1&query=${queryStr}`, '_blank');
    };

    const checkVacationUnlock = () => {
        if (!userData?.joinDate) return false;
        const join = userData.joinDate.toDate ? userData.joinDate.toDate() : new Date(userData.joinDate);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        return join <= oneYearAgo;
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#0B0B0C' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: { xs: 4, md: 8 } }}>
            <Box sx={{ mb: 6, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3 }}>
                <Box>
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF', letterSpacing: -1 }}>{t('tech.service_node')}</Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>{userData?.displayName} | {userData?.specialization || 'Maintenance Specialist'}</Typography>
                </Box>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ '& .MuiTab-root': { color: 'rgba(255,255,255,0.5)', fontWeight: 900 }, '& .Mui-selected': { color: binThemeTokens.gold } }}>
                    <Tab label={t('tech.missions')} />
                    <Tab label={t('tech.hr_duty')} />
                </Tabs>
            </Box>

            {activeTab === 0 && (
                <Box>
                    {activeDispatches.length > 0 && (
                        <Box sx={{ mb: 8 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4, mb: 2, display: 'block' }}>● {t('tech.live_ops')}</Typography>
                            <Stack spacing={3}>
                                {activeDispatches.map((ticket) => (
                                    <Paper key={ticket.id} sx={{ p: 0, overflow: 'hidden', bgcolor: alpha(binThemeTokens.gold, 0.05), border: `2px solid ${binThemeTokens.gold}`, borderRadius: 6 }}>
                                        <Grid container>
                                            <Grid item xs={12} md={8} sx={{ p: 4 }}>
                                                <Chip label={t('tech.urgent_dispatch')} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, mb: 2 }} />
                                                <Typography variant="h4" fontWeight="900" sx={{ color: '#FFF', mb: 1 }}>{ticket.description}</Typography>
                                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{ticket.propertyLocation?.propertyName} ({ticket.propertyLocation?.unitNumber})</Typography>
                                            </Grid>
                                            <Grid item xs={12} md={4} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), p: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <Button variant="contained" fullWidth startIcon={<Navigation />} onClick={() => handleNavigate(ticket)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>{t('tech.navigate')}</Button>
                                                <Button variant="outlined" fullWidth onClick={() => navigate(`/tech/ticket/${ticket.id}`)} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }}>{t('tech.open_node')}</Button>
                                            </Grid>
                                        </Grid>
                                    </Paper>
                                ))}
                            </Stack>
                        </Box>
                    )}

                    <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: '#FFF' }}>{t('tech.mission_pool')}</Typography>
                    <Grid container spacing={3}>
                        {missionPool.map((ticket) => (
                            <Grid item xs={12} key={ticket.id}>
                                <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('tech.pool_id')}: {ticket.id.substring(0,8)}</Typography>
                                            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>{ticket.description}</Typography>
                                        </Box>
                                        <Button variant="outlined" onClick={() => navigate(`/tech/ticket/${ticket.id}`)} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>{t('tech.accept')}</Button>
                                    </Stack>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            )}

            {activeTab === 1 && (
                <Box>
                    <Grid container spacing={4}>
                        {/* V3 TERRITORY INDICATOR */}
                        <Grid item xs={12}>
                            <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, borderRadius: 6 }}>
                                <Stack direction="row" spacing={3} alignItems="center">
                                    <Globe size={32} color={binThemeTokens.gold} />
                                    <Box sx={{ flexGrow: 1 }}>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>📍 V3 TERRITORIAL ASSIGNMENT</Typography>
                                        <Typography variant="h5" fontWeight="900" sx={{ color: '#FFF' }}>{userData?.emirate || 'Global'} {t('nav.operations')}</Typography>
                                        <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap">
                                            {(userData?.assignedZones || []).length > 0 ? userData.assignedZones.map((z: string) => (
                                                <Chip key={z} label={z} sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900, border: '1px solid rgba(255,255,255,0.2)' }} />
                                            )) : <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>No specific zones assigned. Operating at Emirate level.</Typography>}
                                        </Stack>
                                    </Box>
                                </Stack>
                            </Paper>
                        </Grid>

                        {/* [iOS-PERMISSION-OVERRIDE] Dedicated Notification Button */}
                        <Grid item xs={12}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198,167,94,0.15)', borderRadius: 6 }}>
                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center" justifyContent="space-between">
                                    <Box>
                                        <Typography variant="h5" fontWeight="900" sx={{ color: '#FFF' }}>{t('tech.notif_link')}</Typography>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{t('tech.notif_ios_pwa')}</Typography>
                                    </Box>
                                    {userData?.fcmToken ? (
                                        <Chip icon={<ShieldCheck size={16} />} label={t('tech.notif_active')} sx={{ bgcolor: '#4ade80', color: '#000', fontWeight: 900 }} />
                                    ) : (
                                        <Button 
                                            variant="contained" 
                                            startIcon={notifLoading ? <CircularProgress size={20} color="inherit" /> : <BellRing size={20} />}
                                            onClick={handleEnableNotifications}
                                            disabled={notifLoading}
                                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 4, py: 1.5, borderRadius: 3 }}
                                        >
                                            {t('tech.notif_enable')}
                                        </Button>
                                    )}
                                </Stack>
                                {notifError && (
                                    <Alert severity="error" sx={{ mt: 2, bgcolor: 'rgba(211,47,47,0.1)', color: '#ffb74d' }}>
                                        {notifError}
                                    </Alert>
                                )}
                            </Paper>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198,167,94,0.15)', borderRadius: 6 }}>
                                <Stack spacing={3}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="h5" fontWeight="900" sx={{ color: '#FFF' }}>{t('tech.duty_sync')}</Typography>
                                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{t('tech.duty_subtitle')}</Typography>
                                        </Box>
                                        <FormControlLabel
                                            control={<Switch checked={!userData?.isOffDuty} onChange={toggleDutyStatus} color="primary" sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: binThemeTokens.gold }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: binThemeTokens.gold } }} />}
                                            label={!userData?.isOffDuty ? t('tech.on_duty') : t('tech.off_duty')}
                                            sx={{ color: !userData?.isOffDuty ? '#4ade80' : binThemeTokens.textSecondary, fontWeight: 900 }}
                                        />
                                    </Stack>
                                </Stack>
                            </Paper>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198,167,94,0.15)', borderRadius: 6 }}>
                                <Typography variant="h5" fontWeight="900" sx={{ color: '#FFF', mb: 4 }}>{t('tech.workload_node')}</Typography>
                                <Stack spacing={4}>
                                    <Box>
                                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{t('tech.standard_hours')}</Typography>
                                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>32 / 40 hrs</Typography>
                                        </Stack>
                                        <Box sx={{ height: 8, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                                            <Box sx={{ height: '100%', width: '80%', bgcolor: binThemeTokens.gold }} />
                                        </Box>
                                    </Box>
                                </Stack>
                            </Paper>
                        </Grid>

                        {checkVacationUnlock() && (
                            <Grid item xs={12}>
                                <Paper sx={{ p: 6, bgcolor: alpha(binThemeTokens.gold, 0.1), border: `2px solid ${binThemeTokens.gold}`, borderRadius: 8, textAlign: 'center' }}>
                                    <Trophy size={64} color={binThemeTokens.gold} style={{ margin: '0 auto 24px' }} />
                                    <Typography variant="h3" fontWeight="900" sx={{ color: '#FFF', mb: 2 }}>{t('tech.reward_unlocked')}</Typography>
                                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 500, mb: 4 }}>{t('tech.vacation_unlocked')}</Typography>
                                </Paper>
                            </Grid>
                        )}
                    </Grid>
                </Box>
            )}
        </Container>
    );
}
