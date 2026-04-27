import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Collapse,
    Container,
    Divider,
    Grid,
    IconButton,
    LinearProgress,
    Paper,
    Stack,
    Switch,
    Tab,
    Tabs,
    Typography,
    alpha,
    CircularProgress,
    Dialog
} from '@mui/material';
import {
    Activity,
    BellRing,
    Briefcase,
    CheckCircle,
    CheckCircle2,
    Clock,
    Globe,
    Languages,
    LogOut,
    MapPin,
    MessageCircle,
    Navigation,
    Phone,
    Play,
    Settings,
    ShieldCheck,
    Truck,
    UserCheck,
    Wrench
} from 'lucide-react';
import {
    app,
    arrayUnion,
    collection,
    db,
    doc,
    getMessaging,
    getToken as getFcmToken,
    isSupported,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where
} from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useAI } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import CeoContactButtons from '../components/CeoContactButtons';

interface Ticket {
    id: string;
    trade?: string;
    title?: string;
    description?: string;
    status: string;
    priority?: string;
    propertyId?: string;
    unitId?: string;
    ownerId?: string;
    tenantId?: string;
    tenantName?: string;
    tenantPhone?: string;
    phoneNumber?: string;
    createdAt?: any;
    completedAt?: any;
    resolvedAt?: any;
    assignedTechnicianId?: string;
    assignedTechnicianName?: string;
    unitNumber?: string;
    floorNumber?: string | number;
    propertyName?: string;
    address?: string;
    geo?: { lat?: number; lng?: number; geohash?: string; address?: string };
    propertyLocation?: {
        address?: string;
        propertyName?: string;
        unitNumber?: string;
        floorNumber?: string | number;
        location?: { lat: number; lng: number };
        geo?: { lat?: number; lng?: number; geohash?: string; address?: string };
        lat?: number | null;
        lng?: number | null;
    };
}

interface WorkLog {
    hours?: number;
    durationHours?: number;
    minutes?: number;
    technicianId?: string;
}

const activeStatuses = ['ASSIGNED', 'assigned', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];
const completedStatuses = ['COMPLETED', 'RESOLVED', 'CLOSED', 'completed', 'resolved', 'closed'];
const debugNotifications = () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('DEBUG_TECH_NOTIFICATIONS') === 'true' || new URLSearchParams(window.location.search).get('debugTech') === '1';
};

const safeText = (value: any, fallback: string) => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
    return fallback;
};

const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const hasValidLinkage = (ticket: Ticket) => !!ticket.propertyId && !!ticket.unitId && ticket.propertyId !== 'UNASSOCIATED';

const getNavigationTarget = (ticket: Ticket) => {
    const loc = ticket.propertyLocation;
    const lat = ticket.geo?.lat ?? loc?.geo?.lat ?? loc?.location?.lat ?? loc?.lat;
    const lng = ticket.geo?.lng ?? loc?.geo?.lng ?? loc?.location?.lng ?? loc?.lng;
    if (typeof lat === 'number' && typeof lng === 'number') return `${lat},${lng}`;
    const address = loc?.address || ticket.address;
    const propertyName = loc?.propertyName || ticket.propertyName;
    if (address || propertyName) return encodeURIComponent([address, propertyName].filter(Boolean).join(', '));
    return '';
};

const openNavigator = (ticket: Ticket) => {
    const target = getNavigationTarget(ticket);
    if (!target) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${target}`, '_blank', 'noopener,noreferrer');
};

export default function TechnicianPortalPage() {
    const { t, lang, setLang } = useLanguage();
    const { user } = useRole();
    const navigate = useNavigate();
    const { setPageContext } = useAI();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [notifStatus, setNotifStatus] = useState<NotificationPermission>(typeof Notification !== 'undefined' ? Notification.permission : 'default');
    const [activeTab, setActiveTab] = useState(0);
    const [userData, setUserData] = useState<any>(null);
    const [notifError, setNotifError] = useState<string | null>(null);
    const [notifDeveloperError, setNotifDeveloperError] = useState<string | null>(null);
    const [notifLoading, setNotifLoading] = useState(false);
    const [idModalOpen, setIdModalOpen] = useState(false);
    const [dutyUpdating, setDutyUpdating] = useState(false);

    const activeDispatches = useMemo(() => tickets.filter((ticket) =>
        ticket.assignedTechnicianId === user?.uid &&
        activeStatuses.includes(ticket.status) &&
        hasValidLinkage(ticket)
    ), [tickets, user?.uid]);

    const missionPool = useMemo(() => tickets.filter((ticket) =>
        ticket.status === 'OPEN' &&
        hasValidLinkage(ticket) &&
        !ticket.assignedTechnicianId
    ), [tickets]);

    const diagnosticStats = useMemo(() => ({
        total: tickets.length,
        assignedToMe: tickets.filter((ticket) => ticket.assignedTechnicianId === user?.uid).length,
        poolTickets: tickets.filter((ticket) => ticket.status === 'OPEN').length,
        orphans: tickets.filter((ticket) => (!ticket.propertyId || !ticket.unitId || ticket.propertyId === 'UNASSOCIATED') && (ticket.assignedTechnicianId === user?.uid || ticket.status === 'OPEN')).length,
        wrongStatus: tickets.filter((ticket) => ticket.assignedTechnicianId === user?.uid && !activeStatuses.includes(ticket.status) && !completedStatuses.includes(ticket.status)).length
    }), [tickets, user?.uid]);

    const performance = useMemo(() => {
        const mine = tickets.filter((ticket) => ticket.assignedTechnicianId === user?.uid);
        const completed = mine.filter((ticket) => completedStatuses.includes(ticket.status));
        const completionRate = mine.length ? Math.round((completed.length / mine.length) * 100) : Number(userData?.completionRate || 0);
        const resolutionHours = completed
            .map((ticket) => {
                const start = toDate(ticket.createdAt);
                const end = toDate(ticket.completedAt || ticket.resolvedAt);
                if (!start || !end) return null;
                return Math.max(0, (end.getTime() - start.getTime()) / 36e5);
            })
            .filter((value): value is number => typeof value === 'number');
        const avgHours = resolutionHours.length
            ? resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length
            : Number(userData?.avgResolutionHours || userData?.averageResolutionHours || 0);
        return {
            completionRate,
            avgResolution: avgHours ? `${avgHours.toFixed(avgHours >= 10 ? 0 : 1)} hrs` : 'N/A',
            activeMissions: activeDispatches.length
        };
    }, [activeDispatches.length, tickets, user?.uid, userData]);

    const weeklyHours = useMemo(() => {
        const logHours = workLogs.reduce((sum, log) => sum + Number((log.hours ?? log.durationHours ?? ((log.minutes || 0) / 60)) || 0), 0);
        return Math.round(Number(logHours || userData?.weeklyHours || userData?.hoursThisWeek || 0));
    }, [workLogs, userData]);

    const standardHours = Number(userData?.standardWeeklyHours || 40);
    const isOnDuty = typeof userData?.onDuty === 'boolean' ? userData.onDuty : userData?.dutyStatus === 'ON_DUTY';
    const displayName = safeText(userData?.displayName || user?.displayName, 'Maintenance Specialist');
    const specialization = safeText(userData?.specialization || userData?.specialty || userData?.trade, 'General Maintenance');
    const assignedZone = safeText(userData?.assignedZone || userData?.zone || userData?.emirate, 'Global Operations');
    const hasSpecificZone = Boolean(userData?.assignedZone || userData?.zone);
    const workloadPercent = Math.min(100, Math.round((weeklyHours / standardHours) * 100));

    useEffect(() => {
        setPageContext(activeDispatches.length ? { activeDispatches } : null);
        return () => setPageContext(null);
    }, [activeDispatches, setPageContext]);

    useEffect(() => {
        if (!user?.uid) return;

        const userUnsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
            if (snap.exists()) setUserData({ uid: snap.id, ...snap.data() });
        });

        const poolQuery = query(collection(db, 'maintenanceTickets'), where('status', '==', 'OPEN'), orderBy('createdAt', 'desc'), limit(50));
        const assignedQuery = query(collection(db, 'maintenanceTickets'), where('assignedTechnicianId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50));
        const workLogQuery = query(collection(db, 'workLogs'), where('technicianId', '==', user.uid), limit(50));

        const poolUnsub = onSnapshot(poolQuery, (snapshot) => {
            const poolData = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Ticket));
            setTickets((prev) => {
                const assigned = prev.filter((ticket) => ticket.assignedTechnicianId === user.uid);
                return Array.from(new Map([...assigned, ...poolData].map((item) => [item.id, item])).values());
            });
            setLoading(false);
        }, (err) => {
            console.error('Technician mission pool listener failed:', err);
            setLoading(false);
        });

        const assignedUnsub = onSnapshot(assignedQuery, (snapshot) => {
            const assignedData = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Ticket));
            setTickets((prev) => {
                const pool = prev.filter((ticket) => ticket.status === 'OPEN');
                return Array.from(new Map([...assignedData, ...pool].map((item) => [item.id, item])).values());
            });
            setLoading(false);
        }, (err) => {
            console.error('Technician assigned mission listener failed:', err);
            setLoading(false);
        });

        const workLogUnsub = onSnapshot(workLogQuery, (snapshot) => {
            setWorkLogs(snapshot.docs.map((entry) => entry.data() as WorkLog));
        }, (err) => {
            console.warn('Technician workload logs unavailable:', err);
            setWorkLogs([]);
        });

        return () => {
            userUnsub();
            poolUnsub();
            assignedUnsub();
            workLogUnsub();
        };
    }, [user?.uid]);

    const handleEnableNotifications = async () => {
        setNotifLoading(true);
        setNotifError(null);
        setNotifDeveloperError(null);

        const friendlyFailure = 'Push notification setup could not be completed on this device. Please retry or check browser permissions.';

        if (typeof window === 'undefined' || !user?.uid) {
            setNotifError(friendlyFailure);
            setNotifDeveloperError('Authorization node missing.');
            setNotifLoading(false);
            return;
        }

        try {
            const userAgent = window.navigator.userAgent.toLowerCase();
            const isIOS = /iphone|ipad|ipod/.test(userAgent);
            const isStandalone = ('standalone' in window.navigator) && (window.navigator as any).standalone;
            const messagingSupported = await isSupported();
            if (!messagingSupported || typeof Notification === 'undefined') {
                setNotifError(isIOS && !isStandalone
                    ? 'Push notifications on iPhone require opening BIN GROUP from the Home Screen app. Add it to Home Screen, reopen, and retry.'
                    : friendlyFailure);
                setNotifDeveloperError('Firebase Messaging unsupported in this environment.');
                setNotifLoading(false);
                return;
            }

            const permission = await Notification.requestPermission();
            setNotifStatus(permission);
            if (permission !== 'granted') {
                setNotifError('Push notification permission was not granted. Enable notifications in browser settings and retry.');
                setNotifLoading(false);
                return;
            }

            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
            const messaging = getMessaging(app);
            const currentToken = await getFcmToken(messaging, {
                vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ',
                serviceWorkerRegistration: registration
            });

            if (!currentToken) {
                setNotifError(friendlyFailure);
                setNotifDeveloperError('FCM returned an empty token.');
                return;
            }

            await updateDoc(doc(db, 'users', user.uid), {
                fcmTokens: arrayUnion(currentToken),
                notificationLinkedAt: serverTimestamp(),
                notificationPlatform: isIOS ? 'ios' : 'web',
                notificationStandalone: !!isStandalone,
                updatedAt: serverTimestamp()
            });
            setNotifError(null);
        } catch (err: any) {
            console.error('Technician push notification setup failed:', err);
            setNotifError(friendlyFailure);
            setNotifDeveloperError(`${err?.code || 'unknown'}: ${err?.message || String(err)}`);
        } finally {
            setNotifLoading(false);
        }
    };

    const handleStatusUpdate = async (ticketId: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, 'maintenanceTickets', ticketId), {
                status: newStatus,
                updatedAt: serverTimestamp(),
                assignedTechnicianId: user?.uid,
                assignedTechnicianName: displayName
            });
        } catch (err) {
            console.error('Technician status update failed:', err);
        }
    };

    const handleDutyToggle = async (checked: boolean) => {
        if (!user?.uid) return;
        setDutyUpdating(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                onDuty: checked,
                dutyStatus: checked ? 'ON_DUTY' : 'OFF_DUTY',
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Duty synchronization failed:', err);
        } finally {
            setDutyUpdating(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 } }}>
            <TechTopHeader
                lang={lang}
                setLang={setLang}
                navigate={navigate}
                onLogout={() => { localStorage.clear(); signOut(auth).then(() => window.location.href = '/'); }}
            />

            <Paper sx={{ mt: 3, mb: 4, p: { xs: 3, md: 5 }, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.78)', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
                <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} md={8}>
                        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
                            <Chip label="TECHNICIAN" size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950 }} />
                            <Chip label={isOnDuty ? 'ON DUTY' : 'OFF DUTY'} size="small" sx={{ bgcolor: isOnDuty ? alpha('#10b981', 0.16) : alpha('#64748b', 0.18), color: isOnDuty ? '#10b981' : '#cbd5e1', fontWeight: 950 }} />
                        </Stack>
                        <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', letterSpacing: 0 }}>
                            Service Node
                        </Typography>
                        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.62)', mt: 1 }}>
                            {displayName} | {specialization}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={4} sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                        <Button variant="contained" onClick={() => setIdModalOpen(true)} startIcon={<ShieldCheck size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, px: 3, py: 1.4 }}>
                            Show Digital ID
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3, '& .MuiTab-root': { color: 'rgba(255,255,255,0.46)', fontWeight: 950 }, '& .Mui-selected': { color: `${binThemeTokens.gold} !important` }, '& .MuiTabs-indicator': { bgcolor: binThemeTokens.gold } }}>
                <Tab label="MISSIONS" />
                <Tab label="HR & DUTY" />
            </Tabs>

            {activeTab === 0 ? (
                <MissionsTab
                    activeDispatches={activeDispatches}
                    missionPool={missionPool}
                    diagnosticStats={diagnosticStats}
                    performance={performance}
                    onNavigate={openNavigator}
                    onOpenNode={(id) => navigate(`/tech/ticket/${id}`)}
                    onAccept={(id) => handleStatusUpdate(id, 'ASSIGNED')}
                    onStatusUpdate={handleStatusUpdate}
                />
            ) : (
                <HrDutyTab
                    assignedZone={assignedZone}
                    hasSpecificZone={hasSpecificZone}
                    notifStatus={notifStatus}
                    notifError={notifError}
                    notifDeveloperError={notifDeveloperError}
                    notifLoading={notifLoading}
                    isOnDuty={isOnDuty}
                    dutyUpdating={dutyUpdating}
                    weeklyHours={weeklyHours}
                    standardHours={standardHours}
                    workloadPercent={workloadPercent}
                    onEnableNotifications={handleEnableNotifications}
                    onDutyToggle={handleDutyToggle}
                />
            )}

            <DigitalIDModal open={idModalOpen} onClose={() => setIdModalOpen(false)} userData={{ ...userData, uid: user?.uid, displayName }} />
        </Container>
    );
}

function TechTopHeader({ lang, setLang, navigate, onLogout }: { lang: 'en' | 'ar'; setLang: (lang: 'en' | 'ar') => void; navigate: (path: string) => void; onLogout: () => void }) {
    return (
        <Paper sx={{ p: 1.5, borderRadius: 4, bgcolor: 'rgba(10,10,11,0.86)', border: '1px solid rgba(198,167,94,0.18)' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box component="img" src="/logo.png" sx={{ width: 38, height: 38, borderRadius: 1 }} onError={(event: any) => { event.currentTarget.style.display = 'none'; }} />
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>BIN <Box component="span" sx={{ color: binThemeTokens.gold }}>GROUP</Box></Typography>
                    <Chip label="Technician" size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} />
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'space-between', md: 'flex-end' }} sx={{ flexWrap: 'wrap' }}>
                    <Button size="small" onClick={() => navigate('/dashboard')} sx={{ color: 'rgba(255,255,255,0.76)', fontWeight: 900 }}>Dashboard</Button>
                    <Button size="small" onClick={() => navigate('/onboarding')} sx={{ color: 'rgba(255,255,255,0.76)', fontWeight: 900 }}>Onboarding</Button>
                    <IconButton onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} sx={{ color: binThemeTokens.gold }}><Languages size={19} /></IconButton>
                    <IconButton onClick={() => navigate('/notifications')} sx={{ color: binThemeTokens.gold }}><Settings size={19} /></IconButton>
                    <Button size="small" onClick={onLogout} startIcon={<LogOut size={16} />} sx={{ color: '#ef4444', fontWeight: 950 }}>Logout</Button>
                </Stack>
            </Stack>
        </Paper>
    );
}

function MissionsTab({
    activeDispatches,
    missionPool,
    diagnosticStats,
    performance,
    onNavigate,
    onOpenNode,
    onAccept,
    onStatusUpdate
}: {
    activeDispatches: Ticket[];
    missionPool: Ticket[];
    diagnosticStats: any;
    performance: { completionRate: number; avgResolution: string; activeMissions: number };
    onNavigate: (ticket: Ticket) => void;
    onOpenNode: (id: string) => void;
    onAccept: (id: string) => void;
    onStatusUpdate: (id: string, status: string) => void;
}) {
    const showDebug = typeof window !== 'undefined' && localStorage.getItem('DEBUG_TECH_DIAGNOSTICS') === 'true';

    return (
        <Box>
            <Paper sx={{ p: 3, mb: 4, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.76)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>Operational Performance Audit</Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <StatCard icon={<CheckCircle2 size={22} />} label="Completion Rate" value={`${performance.completionRate || 0}%`} />
                    <StatCard icon={<Clock size={22} />} label="Avg. Resolution" value={performance.avgResolution} />
                    <StatCard icon={<Activity size={22} />} label="Active Missions" value={String(performance.activeMissions || 0)} />
                </Grid>
            </Paper>

            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>Live Operations</Typography>
                <Chip label={`${activeDispatches.length} ACTIVE`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950 }} />
            </Stack>

            {activeDispatches.length === 0 ? (
                <Paper sx={{ p: 5, mb: 4, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.025)', border: '1px dashed rgba(198,167,94,0.24)', borderRadius: 5 }}>
                    <Briefcase size={54} color={binThemeTokens.gold} style={{ opacity: 0.55, marginBottom: 16 }} />
                    <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>No Active Missions</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.54)', mt: 1 }}>
                        Dispatch is clear. New verified missions will appear here when assigned.
                    </Typography>
                    <Collapse in={showDebug}>
                        <Box sx={{ mt: 3, textAlign: 'left', p: 2, bgcolor: 'rgba(0,0,0,0.28)', borderRadius: 2 }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>DEVELOPER DIAGNOSTICS</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: '#FFF' }}>Assigned: {diagnosticStats.assignedToMe}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: '#FFF' }}>Pool: {diagnosticStats.poolTickets}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: '#FFF' }}>Suppressed orphan links: {diagnosticStats.orphans}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: '#FFF' }}>Non-operational status: {diagnosticStats.wrongStatus}</Typography>
                        </Box>
                    </Collapse>
                </Paper>
            ) : (
                <Stack spacing={2} sx={{ mb: 5 }}>
                    {activeDispatches.map((ticket) => (
                        <MissionCard key={ticket.id} ticket={ticket} onNavigate={onNavigate} onOpenNode={onOpenNode} onStatusUpdate={onStatusUpdate} />
                    ))}
                </Stack>
            )}

            <Typography variant="h5" fontWeight="950" sx={{ mb: 2, color: '#FFF' }}>Mission Pool</Typography>
            {missionPool.length === 0 ? (
                <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)' }}>No verified open missions are available in the pool.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={2}>
                    {missionPool.map((ticket) => (
                        <Grid item xs={12} md={6} key={ticket.id}>
                            <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                                <Stack spacing={1.5}>
                                    <Chip label="AVAILABLE" size="small" sx={{ alignSelf: 'flex-start', bgcolor: alpha('#10b981', 0.16), color: '#10b981', fontWeight: 900 }} />
                                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{safeText(ticket.trade || ticket.title || ticket.description, 'Mission Node')}</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)' }}>{safeText(ticket.propertyName || ticket.propertyLocation?.propertyName, 'Assigned Property')} | {safeText(ticket.address || ticket.propertyLocation?.address, 'Location details in Navigator')}</Typography>
                                    <Button variant="contained" onClick={() => onAccept(ticket.id)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Accept Mission</Button>
                                </Stack>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2.5, height: '100%', borderRadius: 4, bgcolor: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ color: binThemeTokens.gold }}>{icon}</Box>
                    <Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 900 }}>{label}</Typography>
                        <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{value}</Typography>
                    </Box>
                </Stack>
            </Paper>
        </Grid>
    );
}

function MissionCard({ ticket, onNavigate, onOpenNode, onStatusUpdate }: { ticket: Ticket; onNavigate: (ticket: Ticket) => void; onOpenNode: (id: string) => void; onStatusUpdate: (id: string, status: string) => void }) {
    const navTarget = getNavigationTarget(ticket);
    const propertyLabel = safeText(ticket.propertyName || ticket.propertyLocation?.propertyName, 'Assigned Property');
    const tenantName = safeText(ticket.tenantName, 'Tenant');
    const tenantPhone = safeText(ticket.tenantPhone || ticket.phoneNumber, 'No Phone Number');
    const unitFloor = `Unit ${safeText(ticket.unitNumber || ticket.propertyLocation?.unitNumber, 'N/A')} / Floor ${safeText(ticket.floorNumber || ticket.propertyLocation?.floorNumber, 'N/A')}`;
    const locationHint = safeText(ticket.address || ticket.propertyLocation?.address, 'Location details in Navigator');
    const phoneHref = tenantPhone !== 'No Phone Number' ? `tel:${tenantPhone.replace(/\s+/g, '')}` : '';
    const whatsappHref = tenantPhone !== 'No Phone Number' ? `https://wa.me/${tenantPhone.replace(/[^\d]/g, '')}` : '';
    const statusChip = ticket.priority?.toUpperCase() === 'EMERGENCY' || ticket.priority?.toUpperCase() === 'URGENT' ? 'URGENT DISPATCH' : safeText(ticket.status, 'ASSIGNED').toUpperCase();

    return (
        <Paper sx={{ overflow: 'hidden', bgcolor: 'rgba(22,22,24,0.84)', border: `1px solid ${alpha(binThemeTokens.gold, 0.42)}`, borderRadius: 5 }}>
            <Grid container>
                <Grid item xs={12} md={8}>
                    <Box sx={{ p: 3 }}>
                        <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                            <Chip label={statusChip} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} />
                            <Chip label={safeText(ticket.priority, 'NORMAL').toUpperCase()} size="small" sx={{ bgcolor: alpha('#ef4444', 0.12), color: '#fca5a5', fontWeight: 900 }} />
                        </Stack>
                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{safeText(ticket.trade || ticket.title || ticket.description, 'Fault Mission')}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 0.75 }}>{safeText(ticket.description, 'Mission details available in node.')}</Typography>

                        <Grid container spacing={2} sx={{ mt: 2 }}>
                            <InfoLine icon={<UserCheck size={16} />} label="Tenant" value={tenantName} />
                            <InfoLine icon={<Phone size={16} />} label="Phone" value={tenantPhone} />
                            <InfoLine icon={<Wrench size={16} />} label="Property" value={propertyLabel} />
                            <InfoLine icon={<Globe size={16} />} label="Unit / Floor" value={unitFloor} />
                            <InfoLine icon={<MapPin size={16} />} label="Location" value={locationHint} wide />
                        </Grid>
                    </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Box sx={{ height: '100%', p: 3, bgcolor: alpha(binThemeTokens.gold, 0.07), borderLeft: { md: '1px solid rgba(198,167,94,0.18)' }, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5 }}>
                        <Button variant="contained" disabled={!navTarget} onClick={() => onNavigate(ticket)} startIcon={<Navigation size={17} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.4 }}>
                            Open in Google Maps
                        </Button>
                        <Button variant="outlined" onClick={() => onOpenNode(ticket.id)} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950, py: 1.4 }}>
                            Open Node
                        </Button>
                        <Stack direction="row" spacing={1}>
                            <Button component="a" href={phoneHref || undefined} disabled={!phoneHref} size="small" startIcon={<Phone size={15} />} sx={{ color: '#FFF', fontWeight: 900, flex: 1 }}>
                                Call Tenant
                            </Button>
                            <Button component="a" href={whatsappHref || undefined} target="_blank" disabled={!whatsappHref} size="small" startIcon={<MessageCircle size={15} />} sx={{ color: '#FFF', fontWeight: 900, flex: 1 }}>
                                Message
                            </Button>
                        </Stack>
                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1 }} />
                        {(ticket.status === 'ASSIGNED' || ticket.status === 'assigned') && <Button size="small" startIcon={<Truck size={15} />} onClick={() => onStatusUpdate(ticket.id, 'EN_ROUTE')} sx={{ color: '#FFF', fontWeight: 900 }}>Notify Tenant: I am on the way</Button>}
                        {ticket.status === 'EN_ROUTE' && <Button size="small" startIcon={<MapPin size={15} />} onClick={() => onStatusUpdate(ticket.id, 'ARRIVED')} sx={{ color: '#FFF', fontWeight: 900 }}>Arrived</Button>}
                        {ticket.status === 'ARRIVED' && <Button size="small" startIcon={<Play size={15} />} onClick={() => onStatusUpdate(ticket.id, 'IN_PROGRESS')} sx={{ color: '#FFF', fontWeight: 900 }}>Start Work</Button>}
                        {ticket.status === 'IN_PROGRESS' && <Button size="small" startIcon={<CheckCircle size={15} />} onClick={() => onOpenNode(ticket.id)} sx={{ color: '#FFF', fontWeight: 900 }}>Complete Job</Button>}
                    </Box>
                </Grid>
            </Grid>
        </Paper>
    );
}

function InfoLine({ icon, label, value, wide = false }: { icon: React.ReactNode; label: string; value: string; wide?: boolean }) {
    return (
        <Grid item xs={12} sm={wide ? 12 : 6}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ color: binThemeTokens.gold, mt: 0.2 }}>{icon}</Box>
                <Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 900 }}>{label}</Typography>
                    <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{value}</Typography>
                </Box>
            </Stack>
        </Grid>
    );
}

function HrDutyTab({
    assignedZone,
    hasSpecificZone,
    notifStatus,
    notifError,
    notifDeveloperError,
    notifLoading,
    isOnDuty,
    dutyUpdating,
    weeklyHours,
    standardHours,
    workloadPercent,
    onEnableNotifications,
    onDutyToggle
}: {
    assignedZone: string;
    hasSpecificZone: boolean;
    notifStatus: NotificationPermission;
    notifError: string | null;
    notifDeveloperError: string | null;
    notifLoading: boolean;
    isOnDuty: boolean;
    dutyUpdating: boolean;
    weeklyHours: number;
    standardHours: number;
    workloadPercent: number;
    onEnableNotifications: () => void;
    onDutyToggle: (checked: boolean) => void;
}) {
    return (
        <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
                <DutyCard icon={<Globe />} title="V3 Territorial Assignment">
                    <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{assignedZone}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)' }}>
                        {hasSpecificZone ? 'Assigned operating zone for dispatch routing.' : 'No specific zones assigned / operating at emirate level.'}
                    </Typography>
                </DutyCard>
            </Grid>

            <Grid item xs={12} md={6}>
                <DutyCard icon={<BellRing />} title="Notification Link">
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', mb: 2 }}>
                        Required for emergency dispatches on iOS PWAs.
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: notifError ? 2 : 0 }}>
                        <Chip label={notifStatus === 'granted' ? 'DISPATCH LINK ACTIVE' : 'NOT LINKED'} size="small" sx={{ bgcolor: notifStatus === 'granted' ? alpha('#10b981', 0.14) : alpha('#64748b', 0.18), color: notifStatus === 'granted' ? '#10b981' : '#cbd5e1', fontWeight: 900 }} />
                        <Button size="small" variant="contained" disabled={notifLoading} onClick={onEnableNotifications} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                            {notifLoading ? 'Linking...' : 'Enable Push Notifications'}
                        </Button>
                    </Stack>
                    {notifError && <Alert severity="warning" sx={{ mt: 2 }}>{notifError}</Alert>}
                    <Collapse in={debugNotifications() && !!notifDeveloperError}>
                        <Paper sx={{ mt: 2, p: 2, bgcolor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>DEVELOPER DETAIL</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: '#FFF', wordBreak: 'break-word' }}>{notifDeveloperError}</Typography>
                        </Paper>
                    </Collapse>
                </DutyCard>
            </Grid>

            <Grid item xs={12} md={6}>
                <DutyCard icon={<UserCheck />} title="Duty Synchronization">
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Box>
                            <Typography variant="h5" fontWeight="950" sx={{ color: isOnDuty ? '#10b981' : '#cbd5e1' }}>{isOnDuty ? 'ON DUTY' : 'OFF DUTY'}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)' }}>Set your availability for the automated dispatch engine.</Typography>
                        </Box>
                        <Switch checked={isOnDuty} disabled={dutyUpdating} onChange={(event) => onDutyToggle(event.target.checked)} />
                    </Stack>
                </DutyCard>
            </Grid>

            <Grid item xs={12} md={6}>
                <DutyCard icon={<Briefcase />} title="Workload Node">
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', mb: 1 }}>Standard hours this week</Typography>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{weeklyHours} / {standardHours} hrs</Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{workloadPercent}%</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={workloadPercent} sx={{ height: 10, borderRadius: 100, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                </DutyCard>
            </Grid>
            <Grid item xs={12} md={6}>
                <DutyCard icon={<MessageCircle />} title="Help & Escalation">
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', mb: 2 }}>
                        Use normal support for job, HR, salary, tools, or safety issues. CEO escalation remains available for serious unresolved matters.
                    </Typography>
                    <Button variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.18)', fontWeight: 900, mb: 2 }}>
                        Open Support Complaint
                    </Button>
                    <CeoContactButtons compact />
                </DutyCard>
            </Grid>
        </Grid>
    );
}

function DutyCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <Paper sx={{ p: 3, minHeight: 210, borderRadius: 5, bgcolor: 'rgba(22,22,24,0.76)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                <Box sx={{ color: binThemeTokens.gold }}>{icon}</Box>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{title}</Typography>
            </Stack>
            {children}
        </Paper>
    );
}

const DigitalIDModal = ({ open, onClose, userData }: { open: boolean; onClose: () => void; userData: any }) => {
    const { t } = useLanguage();
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
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{t('tech.verified_specialist') || 'VERIFIED SPECIALIST'}</Typography>
                </Box>

                <Box sx={{ p: 2, bgcolor: '#FFF', borderRadius: 4, display: 'inline-block', mb: 3 }}>
                    <Box component="img" src={qrUrl} alt="Specialist QR" sx={{ width: 200, height: 200, display: 'block' }} />
                </Box>

                <Box sx={{ mb: 4 }}>
                    <Typography variant="h5" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{safeText(userData?.displayName, 'Maintenance Specialist')}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>ID: {userData?.uid?.substring(0, 12).toUpperCase()}</Typography>
                    <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 950, mt: 1, display: 'block' }}>● {t('tech.secure_identity_verified') || 'SECURE IDENTITY VERIFIED'}</Typography>
                </Box>

                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', display: 'block', mb: 3 }}>
                    {t('tech.qr_registry_note') || 'Scanning this code connects to the Sovereign Registry to verify real-time credentials.'}
                </Typography>

                <Button fullWidth onClick={onClose} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 4 }}>
                    {t('tech.dismiss_id') || 'DISMISS ID'}
                </Button>
            </Box>
        </Dialog>
    );
};
