import React from 'react';
import { Box, Typography, Container, Paper, Grid, Stack, Button, Chip, alpha, CircularProgress, Tabs, Tab, Switch, FormControlLabel, Alert, Dialog } from '@mui/material';
import { Wrench, Clock, ShieldCheck, Activity, MapPin, Navigation, ArrowRight, Calendar, UserCheck, Briefcase, Trophy, Zap, Globe, BellRing, Timer, CheckCircle2 } from 'lucide-react';
import { 
    db, collection, query, orderBy, onSnapshot, limit, where, or, app, 
    getMessaging, isSupported, getToken as getFcmToken, 
    updateDoc, doc, getDoc, writeBatch, serverTimestamp 
} from '../lib/firebase';
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
    tenantId: string;
    tenantPhone?: string;
    createdAt: any;
    assignedTechnicianId?: string;
    preferredTiming?: string;
    unitNumber?: string;
    floorNumber?: string;
    propertyName?: string;
    address?: string;
    tenantName?: string;
    propertyLocation?: {
        address: string;
        propertyName: string;
        unitNumber: string;
        floorNumber?: string;
        location?: { lat: number; lng: number };
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
    const [idModalOpen, setIdModalOpen] = React.useState(false);

    const handleEnableNotifications = async () => {
        setNotifLoading(true);
        setNotifError(null);
        
        if (typeof window === 'undefined' || !user?.uid) {
            setNotifError("V3 Protocol Error: Authorization node missing.");
            setNotifLoading(false);
            return;
        }
        
        try {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

            console.log("📍 [PUSH DIAGNOSTICS] iOS:", isIOS, "Standalone:", isStandalone);

            if (isIOS && !isStandalone) {
                setNotifError("iOS PROTOCOL: To receive emergency dispatch notifications, you must tap the Share icon and select 'Add to Home Screen' first.");
                setNotifLoading(false);
                return;
            }

            const messagingSupported = await isSupported();
            if (!messagingSupported) {
                console.warn("📍 [PUSH DIAGNOSTICS] Messaging unsupported in this context.");
                setNotifError("Notifications are not supported by this browser environment.");
                setNotifLoading(false);
                return;
            }

            console.log("📍 [PUSH DIAGNOSTICS] Requesting permission...");
            const permission = await window.Notification.requestPermission();
            setNotifStatus(permission);
            console.log("📍 [PUSH DIAGNOSTICS] Permission:", permission);
            
            if (permission === 'granted') {
                console.log("📍 [PUSH DIAGNOSTICS] Registering SW...");
                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                const sw = registration.installing || registration.waiting || registration.active;
                if (sw && sw.state !== 'activated') {
                    await new Promise<void>((resolve) => {
                        sw.addEventListener('statechange', (e: any) => {
                            if (e.target.state === 'activated') resolve();
                        });
                    });
                }
                console.log("📍 [PUSH DIAGNOSTICS] SW Active. Fetching token...");

                const messaging = getMessaging(app);
                const currentToken = await getFcmToken(messaging, { 
                    vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ',
                    serviceWorkerRegistration: registration 
                });
                
                if (currentToken) {
                    console.log("📍 [PUSH DIAGNOSTICS] Token received. Writing to Firestore...");
                    await updateDoc(doc(db, 'users', user.uid), {
                        fcmToken: currentToken,
                        updatedAt: new Date().toISOString()
                    });
                    console.log("📍 [PUSH DIAGNOSTICS] Firestore write successful.");
                    alert(t('tech.notif_handshake_success'));
                } else {
                    throw new Error("EMPTY_TOKEN");
                }
            } else {
                setNotifError("Permission was denied. Please allow notifications in your browser settings.");
            }
        } catch (err: any) {
            console.error("📍 [PUSH DIAGNOSTICS] Notification Failure:", err.message, err.stack);
            setNotifError("Handshake aborted. " + (err.message || 'System limitation blocked notification access.'));
        } finally {
            setNotifLoading(false);
        }
    };

    React.useEffect(() => {
        if (!user?.uid) return;

        const userUnsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
            if (snap.exists()) setUserData(snap.data());
        });

        // Query 1: Mission Pool (All Open Tickets)
        const poolQuery = query(
            collection(db, 'maintenanceTickets'), 
            where('status', '==', 'OPEN'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        // Query 2: Active Dispatches (Specifically assigned to this tech)
        const assignedQuery = query(
            collection(db, 'maintenanceTickets'),
            where('assignedTechnicianId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const poolUnsub = onSnapshot(poolQuery, (snapshot) => {
            const poolData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ticket));
            setTickets(prev => {
                const assigned = prev.filter(t => t.assignedTechnicianId === user.uid);
                const combined = [...assigned, ...poolData];
                // Remove duplicates by ID
                return Array.from(new Map(combined.map(item => [item.id, item])).values());
            });
            setLoading(false);
        });

        const assignedUnsub = onSnapshot(assignedQuery, async (snapshot) => {
            const assignedData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ticket));
            
            // [V9] DATA ENRICHMENT: Fetch missing context for assigned tickets
            const enrichedData = await Promise.all(assignedData.map(async (t) => {
                const enriched = { ...t };
                if (!t.tenantPhone && t.tenantId) {
                    try {
                        const tenantSnap = await getDoc(doc(db, 'users', t.tenantId));
                        if (tenantSnap.exists()) enriched.tenantPhone = tenantSnap.data()?.phone || tenantSnap.data()?.phoneNumber;
                    } catch (e) {}
                }
                if ((!t.propertyLocation || !t.propertyLocation.address) && t.propertyId) {
                    try {
                        const propSnap = await getDoc(doc(db, 'properties', t.propertyId));
                        if (propSnap.exists()) {
                            const pData = propSnap.data();
                            enriched.propertyLocation = {
                                ...enriched.propertyLocation,
                                address: pData?.address,
                                propertyName: pData?.name,
                                location: pData?.location
                            } as any;
                        }
                    } catch (e) {}
                }
                return enriched;
            }));

            setTickets(prev => {
                const pool = prev.filter(t => t.status === 'OPEN');
                const combined = [...enrichedData, ...pool];
                return Array.from(new Map(combined.map(item => [item.id, item])).values());
            });
        });

        return () => { userUnsub(); poolUnsub(); assignedUnsub(); };
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

    const handleStatusUpdate = async (ticketId: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, 'maintenanceTickets', ticketId), {
                status: newStatus,
                updatedAt: serverTimestamp(),
                assignedTechnicianId: user?.uid,
                assignedTechnicianName: user?.displayName || 'Maintenance Specialist'
            });
        } catch (err) {
            console.error("Status Update Failed:", err);
        }
    };

    const activeDispatches = tickets.filter(t => t.assignedTechnicianId === user?.uid && (t.status === 'assigned' || t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS' || t.status === 'EN_ROUTE' || t.status === 'ARRIVED'));
    const missionPool = tickets.filter(t => t.status === 'OPEN');

    const handleNavigate = (ticket: Ticket) => {
        if (!ticket.propertyLocation) return;
        const loc = ticket.propertyLocation as any;
        let queryStr = '';
        if (loc.lat && loc.lng) {
            queryStr = `${loc.lat},${loc.lng}`;
        } else if (loc.location && loc.location.lat && loc.location.lng) {
            queryStr = `${loc.location.lat},${loc.location.lng}`;
        } else {
            queryStr = encodeURIComponent(`${loc.address || ''}, ${loc.propertyName || ''}`);
        }
        window.open(`https://www.google.com/maps/search/?api=1&query=${queryStr}`, '_blank');
    };

    const checkVacationUnlock = () => {
        if (!userData?.joinDate) return false;
        const join = userData.joinDate.toDate ? userData.joinDate.toDate() : new Date(userData.joinDate);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        return join <= oneYearAgo;
    };

    const renderReportCard = () => (
        <Paper sx={{ p: 4, mb: 6, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3, mb: 3, display: 'block' }}>
                {t('report.tech_summary') || 'OPERATIONAL PERFORMANCE AUDIT'}
            </Typography>
            <Grid container spacing={4}>
                <Grid item xs={12} md={4}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><CheckCircle2 color={binThemeTokens.gold} /></Box>
                        <Box>
                            <Typography variant="h4" fontWeight="950" color="#FFF">98%</Typography>
                            <Typography variant="caption" color="rgba(255,255,255,0.5)">{t('report.completion_rate') || 'Completion Rate'}</Typography>
                        </Box>
                    </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><Timer color={binThemeTokens.gold} /></Box>
                        <Box>
                            <Typography variant="h4" fontWeight="950" color="#FFF">38m</Typography>
                            <Typography variant="caption" color="rgba(255,255,255,0.5)">{t('report.avg_resolution') || 'Avg. Resolution'}</Typography>
                        </Box>
                    </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><Activity color={binThemeTokens.gold} /></Box>
                        <Box>
                            <Typography variant="h4" fontWeight="950" color="#FFF">{activeDispatches.length}</Typography>
                            <Typography variant="caption" color="rgba(255,255,255,0.5)">{t('report.active_missions') || 'Active Missions'}</Typography>
                        </Box>
                    </Stack>
                </Grid>
            </Grid>
        </Paper>
    );

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#0B0B0C' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: { xs: 4, md: 8 } }}>
            <Box sx={{ mb: 6, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3 }}>
                <Box>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFFFFF', letterSpacing: -1 }}>{t('tech.service_node')}</Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>{userData?.displayName} | {userData?.specialization || 'Maintenance Specialist'}</Typography>
                    <Button 
                        variant="outlined" 
                        size="small" 
                        startIcon={<ShieldCheck size={16} />} 
                        onClick={() => setIdModalOpen(true)}
                        sx={{ mt: 1, color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.4), fontWeight: 900, borderRadius: 2 }}
                    >
                        SHOW DIGITAL ID
                    </Button>
                </Box>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ '& .MuiTab-root': { color: 'rgba(255,255,255,0.5)', fontWeight: 950 }, '& .Mui-selected': { color: binThemeTokens.gold } }}>
                    <Tab label={t('tech.missions')} />
                    <Tab label={t('tech.hr_duty')} />
                </Tabs>
            </Box>

            {activeTab === 0 && (
                <Box>
                    {renderReportCard()}

                    {activeDispatches.length > 0 && (
                        <Box sx={{ mb: 8 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4, mb: 2, display: 'block' }}>● {t('tech.live_ops')}</Typography>
                            <Stack spacing={3}>
                                {activeDispatches.map((ticket) => (
                                    <Paper key={ticket.id} sx={{ p: 0, overflow: 'hidden', bgcolor: alpha(binThemeTokens.gold, 0.05), border: `2px solid ${binThemeTokens.gold}`, borderRadius: 6 }}>
                                        <Grid container>
                                            <Grid item xs={12} md={8} sx={{ p: 4 }}>
                                                <Chip label={t('tech.urgent_dispatch')} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, mb: 2 }} />
                                                <Typography variant="h4" fontWeight="950" dir="auto" sx={{ color: '#FFF', mb: 1 }}>{ticket.description}</Typography>
                                                <Typography variant="body1" dir="auto" sx={{ color: binThemeTokens.gold, fontWeight: 700, mb: 1 }}>
                                                    {ticket.tenantName || 'Resident'} | {ticket.propertyName || ticket.propertyLocation?.propertyName || 'Asset'}
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: binThemeTokens.goldLight, fontWeight: 900, mb: 1 }}>
                                                    {ticket.tenantPhone || 'No Phone Number'}
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                                                    {t('field.units')} {ticket.unitNumber || ticket.propertyLocation?.unitNumber || 'N/A'} | {t('field.floors')} {ticket.floorNumber || 'N/A'}
                                                </Typography>
                                                <Typography variant="body2" dir="auto" sx={{ color: alpha('#FFF', 0.5), mt: 1 }}>
                                                    {ticket.address || ticket.propertyLocation?.address || 'Location details in Navigator'}
                                                </Typography>
                                            </Grid>
                                            <Grid item xs={12} md={4} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), p: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <Button variant="contained" fullWidth startIcon={<Navigation />} onClick={() => handleNavigate(ticket)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{t('tech.navigate')}</Button>
                                                <Stack direction="row" spacing={1}>
                                                    {(ticket.status === 'assigned' || ticket.status === 'ASSIGNED') ? (
                                                        <Button variant="contained" fullWidth onClick={() => handleStatusUpdate(ticket.id, 'EN_ROUTE')} sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 950 }}>{t('tech.action.en_route')}</Button>
                                                    ) : ticket.status === 'EN_ROUTE' ? (
                                                        <Button variant="contained" fullWidth onClick={() => handleStatusUpdate(ticket.id, 'ARRIVED')} sx={{ bgcolor: '#3b82f6', color: '#fff', fontWeight: 950 }}>{t('tech.action.arrived')}</Button>
                                                    ) : ticket.status === 'ARRIVED' ? (
                                                        <Button variant="contained" fullWidth onClick={() => handleStatusUpdate(ticket.id, 'IN_PROGRESS')} sx={{ bgcolor: '#10b981', color: '#fff', fontWeight: 950 }}>{t('tech.action.start_work')}</Button>
                                                    ) : null}
                                                </Stack>
                                                <Button variant="outlined" fullWidth onClick={() => navigate(`/tech/ticket/${ticket.id}`)} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>{t('tech.open_node')}</Button>
                                            </Grid>
                                        </Grid>
                                    </Paper>
                                ))}
                            </Stack>
                        </Box>
                    )}

                    <Typography variant="h5" sx={{ mb: 4, fontWeight: 950, color: '#FFF' }}>{t('tech.mission_pool')}</Typography>
                    <Grid container spacing={3}>
                        {missionPool.map((ticket) => (
                            <Grid item xs={12} key={ticket.id}>
                                <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('tech.pool_id')}: {ticket.id.substring(0,8)}</Typography>
                                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{ticket.description}</Typography>
                                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                                                {ticket.propertyName} | {t('field.units')} {ticket.unitNumber || 'N/A'} ({t('field.floors')} {ticket.floorNumber || 'N/A'})
                                            </Typography>
                                        </Box>
                                        <Button variant="outlined" onClick={() => navigate(`/tech/ticket/${ticket.id}`)} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>{t('tech.accept')}</Button>
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
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>📍 V3 TERRITORIAL ASSIGNMENT</Typography>
                                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{userData?.emirate || 'Global'} {t('nav.operations')}</Typography>
                                        <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap">
                                            {(userData?.assignedZones || []).length > 0 ? userData.assignedZones.map((z: string) => (
                                                <Chip key={z} label={z} sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 950, border: '1px solid rgba(255,255,255,0.2)' }} />
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
                                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{t('tech.notif_link')}</Typography>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{t('tech.notif_ios_pwa')}</Typography>
                                    </Box>
                                    {userData?.fcmToken ? (
                                        <Chip icon={<ShieldCheck size={16} />} label={t('tech.notif_active')} sx={{ bgcolor: '#4ade80', color: '#000', fontWeight: 950 }} />
                                    ) : (
                                        <Button 
                                            variant="contained" 
                                            startIcon={notifLoading ? <CircularProgress size={20} color="inherit" /> : <BellRing size={20} />}
                                            onClick={handleEnableNotifications}
                                            disabled={notifLoading}
                                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3 }}
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
                                            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{t('tech.duty_sync')}</Typography>
                                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{t('tech.duty_subtitle')}</Typography>
                                        </Box>
                                        <FormControlLabel
                                            control={<Switch checked={!userData?.isOffDuty} onChange={toggleDutyStatus} color="primary" sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: binThemeTokens.gold }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: binThemeTokens.gold } }} />}
                                            label={!userData?.isOffDuty ? t('tech.on_duty') : t('tech.off_duty')}
                                            sx={{ color: !userData?.isOffDuty ? '#4ade80' : binThemeTokens.textSecondary, fontWeight: 950 }}
                                        />
                                    </Stack>
                                </Stack>
                            </Paper>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198,167,94,0.15)', borderRadius: 6 }}>
                                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mb: 4 }}>{t('tech.workload_node')}</Typography>
                                <Stack spacing={4}>
                                    <Box>
                                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{t('tech.standard_hours')}</Typography>
                                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 950 }}>32 / 40 hrs</Typography>
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
                                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>{t('tech.reward_unlocked')}</Typography>
                                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 500, mb: 4 }}>{t('tech.vacation_unlocked')}</Typography>
                                </Paper>
                            </Grid>
                        )}
                    </Grid>
                </Box>
            )}
            <DigitalIDModal open={idModalOpen} onClose={() => setIdModalOpen(false)} userData={userData} />
        </Container>
    );
}

const DigitalIDModal = ({ open, onClose, userData }: { open: boolean, onClose: () => void, userData: any }) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`https://bin-groups.com/v/${userData?.uid}`)}&bgcolor=0B0B0B&color=D4AF37`;

    return (
        <Dialog 
            open={open} 
            onClose={onClose}
            PaperProps={{
                sx: { borderRadius: 8, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, overflow: 'hidden' }
            }}
        >
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>BIN GROUP OFFICIAL</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>VERIFIED SPECIALIST</Typography>
                </Box>
                
                <Box sx={{ p: 2, bgcolor: '#FFF', borderRadius: 4, display: 'inline-block', mb: 3 }}>
                    <Box component="img" src={qrUrl} alt="Specialist QR" sx={{ width: 200, height: 200, display: 'block' }} />
                </Box>

                <Box sx={{ mb: 4 }}>
                    <Typography variant="h5" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{userData?.displayName}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>ID: {userData?.uid?.substring(0, 12).toUpperCase()}</Typography>
                    <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 950, mt: 1, display: 'block' }}>● SECURE IDENTITY VERIFIED</Typography>
                </Box>

                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', display: 'block', mb: 3 }}>
                    Scanning this code connects to the Sovereign Registry to verify real-time credentials.
                </Typography>

                <Button fullWidth onClick={onClose} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 4 }}>
                    DISMISS ID
                </Button>
            </Box>
        </Dialog>
    );
};
