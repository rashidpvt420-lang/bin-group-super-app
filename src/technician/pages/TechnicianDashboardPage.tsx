import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button,
    CircularProgress, alpha, Avatar, Chip, Divider, LinearProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    Power, Coffee, Clock, Activity, Zap, CheckCircle2,
    ArrowRight, MapPin, Target, User, Phone, Mail, Wrench,
    ShieldCheck, CalendarDays, FileText, Briefcase, Award,
    Navigation, AlertTriangle, Car, Hammer, BadgeCheck
} from 'lucide-react';
import {
    db, doc, updateDoc, collection, query, where, onSnapshot, limit,
    orderBy, serverTimestamp, runTransaction, getDoc, getDocs
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { TICKET_STATUS } from '../../utils/ticketConstants';
import { ALL_TECHNICIAN_ACTIVE_STATUSES, TICKET_AUDIT_ACTIONS, onSnapshotSplitIn, logAuditAction } from '../../shared-exports';
import type { SnapshotDoc } from '../../utils/queryUtils';
import { textOrPending, formatUiDate, normalizeEmail, uniqueRows } from '../utils/technicianDashboardFields';

const statusTone = (status: string) => {
    const value = String(status || '').toLowerCase();
    if (value.includes('active') || value.includes('approved') || value.includes('working') || value.includes('ready')) return '#10b981';
    if (value.includes('pending') || value.includes('break') || value.includes('review')) return binThemeTokens.gold;
    if (value.includes('off') || value.includes('expired') || value.includes('blocked')) return '#ef4444';
    return '#94a3b8';
};

const formatTime = (value: any) => {
    try {
        if (!value) return 'Pending sync';
        if (typeof value?.toDate === 'function') return value.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return 'Pending sync';
    }
};

const readRows = async (collectionName: string, field: string, value?: string | null, max = 8) => {
    if (!value) return [] as any[];
    try {
        const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value), limit(max)));
        return snap.docs.map((row) => ({ id: row.id, ...row.data() }));
    } catch (error) {
        console.warn(`[TechnicianDashboard] ${collectionName}.${field} unavailable:`, error);
        return [] as any[];
    }
};

function MetricCard({ icon, label, value, tone = binThemeTokens.gold, helper }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string; helper?: string }) {
    return (
        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, height: '100%', bgcolor: alpha(tone, 0.06), border: `1px solid ${alpha(tone, 0.22)}`, borderRadius: 5, minWidth: 0, overflowWrap: 'anywhere' }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Box sx={{ color: tone, display: 'flex' }}>{icon}</Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)', fontWeight: 950, letterSpacing: 1 }}>{label}</Typography>
            </Stack>
            <Typography variant="h5" fontWeight="950" color="#FFF" sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
            {helper && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', mt: 0.7, display: 'block' }}>{helper}</Typography>}
        </Paper>
    );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <Stack direction="row" justifyContent="space-between" gap={2} sx={{ py: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 900, textTransform: 'uppercase' }}>{label}</Typography>
            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value || 'Pending sync'}</Typography>
        </Stack>
    );
}

export default function TechnicianDashboardPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [dutyStatus, setDutyStatus] = useState(user?.dutyStatus || 'OFF');
    const [updating, setUpdating] = useState(false);
    const [staffProfile, setStaffProfile] = useState<any>(null);
    const [techProfile, setTechProfile] = useState<any>(null);
    const [staffRows, setStaffRows] = useState<any[]>([]);
    const [certRows, setCertRows] = useState<any[]>([]);
    const [recentCompleted, setRecentCompleted] = useState<any[]>([]);
    const [syncWarnings, setSyncWarnings] = useState<string[]>([]);

    const [stats, setStats] = useState({
        assigned: 0,
        emergency: 0,
        inProgress: 0,
        completedToday: 0,
        completedMonth: 0,
        slaRisk: 0,
        quality: 0,
    });

    const [missionPool, setMissionPool] = useState<any[]>([]);
    const [activeJobs, setActiveJobs] = useState<SnapshotDoc[]>([]);

    useEffect(() => {
        if (!user?.uid) return;
        setDutyStatus(user.dutyStatus || 'OFF');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const unsubAssigned = onSnapshotSplitIn(
            collection(db, 'maintenanceTickets'),
            { field: 'assignedTechnicianId', value: user.uid },
            'status',
            ALL_TECHNICIAN_ACTIVE_STATUSES,
            (jobs: SnapshotDoc[]) => {
                let assigned = 0;
                let emergency = 0;
                let inProgress = 0;
                let slaRisk = 0;
                jobs.forEach((data: SnapshotDoc) => {
                    assigned += 1;
                    const status = String(data.status || '');
                    if (['on_the_way', 'arrived', 'in_progress', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(status)) inProgress += 1;
                    if (String(data.priority || '').toLowerCase() === 'emergency') emergency += 1;
                    if (data.slaBreached === true || String(data.slaStatus || '').toLowerCase().includes('risk')) slaRisk += 1;
                });
                setActiveJobs(jobs);
                setStats((prev) => ({ ...prev, assigned, emergency, inProgress, slaRisk }));
                setLoading(false);
            },
        );

        const qPool = query(collection(db, 'maintenanceTickets'), where('assignedTechnicianId', '==', null), where('status', 'in', ['OPEN', 'emergency_submitted']), orderBy('createdAt', 'desc'), limit(5));
        const unsubPool = onSnapshot(qPool, (snap) => setMissionPool(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (error) => console.warn('[TechnicianDashboard] mission pool unavailable:', error));

        const qCompleted = query(collection(db, 'maintenanceTickets'), where('assignedTechnicianId', '==', user.uid), where('status', 'in', ['completed', 'CLOSED', 'COMPLETED']), where('completedAt', '>=', today));
        const unsubCompleted = onSnapshot(qCompleted, (snap) => setStats((prev) => ({ ...prev, completedToday: snap.size })), (error) => console.warn('[TechnicianDashboard] completed today unavailable:', error));

        const qMonthCompleted = query(collection(db, 'maintenanceTickets'), where('assignedTechnicianId', '==', user.uid), where('status', 'in', ['completed', 'CLOSED', 'COMPLETED']), where('completedAt', '>=', monthStart), limit(25));
        const unsubMonthCompleted = onSnapshot(qMonthCompleted, (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const scores = rows.map((job: any) => Number(job.qualityScore || job.rating || job.technicianScore || 0)).filter((score) => Number.isFinite(score) && score > 0);
            const quality = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : 0;
            setRecentCompleted(rows.slice(0, 5));
            setStats((prev) => ({ ...prev, completedMonth: snap.size, quality }));
        }, (error) => console.warn('[TechnicianDashboard] completed month unavailable:', error));

        return () => {
            unsubAssigned();
            unsubPool();
            unsubCompleted();
            unsubMonthCompleted();
        };
    }, [user]);

    useEffect(() => {
        const loadStaffData = async () => {
            if (!user?.uid) return;
            const warnings: string[] = [];
            const email = normalizeEmail(user.email);
            let userProfile: any = null;
            let technicianProfile: any = null;

            try {
                const snap = await getDoc(doc(db, 'users', user.uid));
                userProfile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
                if (!userProfile) warnings.push('Main user profile is not fully synced.');
            } catch (error) {
                warnings.push('Main user profile could not be read.');
            }

            try {
                const snap = await getDoc(doc(db, 'technicians', user.uid));
                technicianProfile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
            } catch (error) {
                console.warn('[TechnicianDashboard] technician profile by UID unavailable:', error);
            }

            const byEmail = !technicianProfile && email ? await readRows('technicians', 'email', email, 1) : [];
            technicianProfile = technicianProfile || byEmail[0] || null;
            if (!technicianProfile) warnings.push('Technician operations profile is not fully synced.');

            const rosterRows = uniqueRows([
                ...(await readRows('staff_roster', 'uid', user.uid, 4)),
                ...(await readRows('staff_roster', 'email', email, 4)),
                ...(await readRows('hr_staff', 'uid', user.uid, 4)),
                ...(await readRows('hr_staff', 'email', email, 4)),
                ...(await readRows('attendance', 'uid', user.uid, 6)),
                ...(await readRows('attendance', 'technicianId', user.uid, 6)),
                ...(await readRows('technician_dispatch_jobs', 'technicianId', user.uid, 6)),
            ]);

            const certs = uniqueRows([
                ...(await readRows('technician_certifications', 'technicianId', user.uid, 8)),
                ...(await readRows('certifications', 'technicianId', user.uid, 8)),
                ...((technicianProfile?.certifications || userProfile?.certifications || []) as any[]).map((item: any, index: number) => ({ id: `embedded-${index}`, ...(typeof item === 'string' ? { name: item } : item) })),
            ]);

            setStaffProfile(userProfile);
            setTechProfile(technicianProfile);
            setStaffRows(rosterRows);
            setCertRows(certs);
            setSyncWarnings(warnings);
        };

        loadStaffData();
    }, [user]);

    const profile = useMemo(() => ({ ...(staffProfile || {}), ...(techProfile || {}) }), [staffProfile, techProfile]);
    const latestStaffRow = staffRows[0] || {};
    const technicianName = textOrPending(profile.displayName, profile.fullName, profile.name, user?.displayName, 'Technician');
    const employeeId = textOrPending(profile.employeeCode, profile.employeeId, profile.staffId, profile.badgeNumber, user?.uid);
    const trade = textOrPending(profile.trade, profile.specialization, profile.skill, profile.department, 'General Maintenance');
    const phone = textOrPending(profile.phoneNumber, profile.phone, profile.mobile);
    const email = textOrPending(profile.email, user?.email);
    const supervisor = textOrPending(profile.supervisorName, profile.managerName, profile.reportingManager);
    const shift = textOrPending(profile.shiftName, profile.shift, profile.workSchedule, latestStaffRow.shift);
    const baseLocation = textOrPending(profile.baseLocation, profile.zone, profile.area, profile.emirate, 'UAE field operations');
    const contractType = textOrPending(profile.contractType, profile.employmentType, profile.staffType);
    const joiningDate = formatUiDate(profile.joiningDate || profile.joinedAt || profile.createdAt);
    const visaExpiry = formatUiDate(profile.visaExpiry || profile.visaExpiryDate || profile.residencyExpiry);
    const idExpiry = formatUiDate(profile.emiratesIdExpiry || profile.eidExpiry || profile.idExpiry);
    const medicalExpiry = formatUiDate(profile.medicalExpiry || profile.healthCardExpiry);
    const passportExpiry = formatUiDate(profile.passportExpiry || profile.passportExpiryDate);
    const qualityDisplay = stats.quality ? `${stats.quality}/5` : textOrPending(profile.qualityScore, profile.rating, 'Pending');
    const slaDisplay = textOrPending(profile.slaCompliance, profile.slaScore, stats.slaRisk > 0 ? 'At risk' : 'Healthy');
    const openActionItems = [visaExpiry, idExpiry, medicalExpiry, passportExpiry].filter((value) => value === 'Pending sync').length + syncWarnings.length;

    const handleDutyToggle = async (newStatus: string) => {
        if (!user?.uid) return;
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), { dutyStatus: newStatus, onDuty: newStatus === 'WORKING', updatedAt: serverTimestamp() });
            await logAuditAction({ action: TICKET_AUDIT_ACTIONS.DUTY_CHANGE, actorId: user.uid, actorRole: 'technician', targetType: 'users', targetId: user.uid, metadata: { newStatus } });
            setDutyStatus(newStatus);
        } catch (err) {
            console.error('Failed to update duty status', err);
        } finally {
            setUpdating(false);
        }
    };

    const handleAcceptJob = async (jobId: string) => {
        if (!user?.uid) return;
        try {
            await runTransaction(db, async (transaction: any) => {
                const jobRef = doc(db, 'maintenanceTickets', jobId);
                transaction.update(jobRef, { assignedTechnicianId: user.uid, assignedTechnicianName: user.displayName || technicianName || 'Technician', status: TICKET_STATUS.ACCEPTED, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() });
                const auditRef = doc(collection(db, 'audit_logs'));
                transaction.set(auditRef, { action: TICKET_AUDIT_ACTIONS.JOB_ACCEPTED, targetType: 'maintenanceTickets', targetId: jobId, actorId: user.uid, actorRole: 'technician', createdAt: serverTimestamp() });
            });
            navigate(`/technician/job/${jobId}`);
        } catch (err) {
            console.error('Failed to accept job', err);
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('dash.initializing_stream') || 'Initializing Operator Stream...'}</Typography>
        </Box>
    );

    const isOnDuty = dutyStatus === 'WORKING';

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pr: { xs: 9, md: 0 }, pb: { xs: 12, md: 6 }, minWidth: 0 }}>
            <Box sx={{ mb: 5, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 3 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{t('dash.terminal.technician') || 'FIELD SOVEREIGN'}</Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF" sx={{ mt: 1, fontSize: { xs: '2.25rem', md: '3rem' }, overflowWrap: 'anywhere' }}>Technical Command Dashboard</Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.55)', mt: 1, maxWidth: 760 }}>Staff profile, duty status, dispatch performance, SLA health, compliance, tools, certificates, and live mission control in one terminal.</Typography>
                </Box>
                <Avatar sx={{ width: 72, height: 72, bgcolor: alpha(binThemeTokens.gold, 0.12), border: `2px solid ${alpha(binThemeTokens.gold, 0.55)}`, color: binThemeTokens.gold, fontWeight: 950, fontSize: 28 }}>{String(technicianName).charAt(0) || 'T'}</Avatar>
            </Box>

            <Paper sx={{ p: { xs: 3, md: 4 }, mb: 4, bgcolor: 'rgba(15, 23, 42, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.24)}`, borderRadius: 6, minWidth: 0 }}>
                <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={3} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2.5} alignItems="center" sx={{ minWidth: 0 }}>
                        <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.12), borderRadius: 4, color: binThemeTokens.gold }}><BadgeCheck size={34} /></Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950, letterSpacing: 1.3 }}>TECHNICIAN IDENTITY</Typography>
                            <Typography variant="h5" fontWeight="950" color="#FFF" sx={{ overflowWrap: 'anywhere' }}>{technicianName}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', overflowWrap: 'anywhere' }}>{trade} • {employeeId}</Typography>
                        </Box>
                    </Stack>
                    <Stack direction="row" spacing={1.2} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} useFlexGap>
                        <Chip label={String(dutyStatus).replace('_', ' ')} sx={{ bgcolor: alpha(statusTone(dutyStatus), 0.14), color: statusTone(dutyStatus), fontWeight: 950 }} />
                        <Chip label={`SLA: ${slaDisplay}`} sx={{ bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 950 }} />
                        <Chip label={`Quality: ${qualityDisplay}`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950 }} />
                    </Stack>
                </Stack>
            </Paper>

            <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid item xs={6} md={3}><MetricCard icon={<Activity size={22} />} label="Active Jobs" value={stats.assigned} tone="#3b82f6" helper="Assigned live tickets" /></Grid>
                <Grid item xs={6} md={3}><MetricCard icon={<Zap size={22} />} label="Emergency" value={stats.emergency} tone="#ef4444" helper="Priority response" /></Grid>
                <Grid item xs={6} md={3}><MetricCard icon={<CheckCircle2 size={22} />} label="Closed Today" value={stats.completedToday} tone="#10b981" helper="Completed jobs" /></Grid>
                <Grid item xs={6} md={3}><MetricCard icon={<Clock size={22} />} label="SLA Risk" value={stats.slaRisk} tone={stats.slaRisk > 0 ? '#ef4444' : '#10b981'} helper="Requires attention" /></Grid>
            </Grid>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} lg={5}>
                    <Paper sx={{ p: { xs: 3, md: 4 }, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}><User color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Staff Control Profile</Typography></Stack>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}><DetailRow label="Full name" value={technicianName} /></Grid>
                            <Grid item xs={12} sm={6}><DetailRow label="Employee ID" value={employeeId} /></Grid>
                            <Grid item xs={12} sm={6}><DetailRow label="Email" value={<><Mail size={13} /> {email}</>} /></Grid>
                            <Grid item xs={12} sm={6}><DetailRow label="Phone" value={<><Phone size={13} /> {phone}</>} /></Grid>
                            <Grid item xs={12} sm={6}><DetailRow label="Trade" value={trade} /></Grid>
                            <Grid item xs={12} sm={6}><DetailRow label="Supervisor" value={supervisor} /></Grid>
                            <Grid item xs={12} sm={6}><DetailRow label="Shift" value={shift} /></Grid>
                            <Grid item xs={12} sm={6}><DetailRow label="Base zone" value={baseLocation} /></Grid>
                        </Grid>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: { xs: 3, md: 4 }, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}><Briefcase color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Duty & Attendance</Typography></Stack>
                        <DetailRow label="Duty status" value={dutyStatus} />
                        <DetailRow label="Last check-in" value={formatTime(latestStaffRow.checkIn || latestStaffRow.clockIn || latestStaffRow.startedAt)} />
                        <DetailRow label="Roster status" value={textOrPending(latestStaffRow.status, latestStaffRow.dutyStatus)} />
                        <DetailRow label="Monthly completions" value={stats.completedMonth} />
                        <DetailRow label="Leave balance" value={textOrPending(profile.leaveBalance, profile.annualLeaveBalance)} />
                        <Button 
                            fullWidth 
                            variant="outlined" 
                            onClick={() => navigate('/technician/hr')}
                            sx={{ 
                                mt: 2, 
                                borderColor: binThemeTokens.gold, 
                                color: binThemeTokens.gold, 
                                fontWeight: 950,
                                '&:hover': {
                                    bgcolor: alpha(binThemeTokens.gold, 0.05),
                                    borderColor: binThemeTokens.gold
                                }
                            }}
                        >
                            HR & REQUESTS
                        </Button>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={3}>
                    <Paper sx={{ p: { xs: 3, md: 4 }, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}><CalendarDays color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Contract & Actions</Typography></Stack>
                        <DetailRow label="Contract type" value={contractType} />
                        <DetailRow label="Joining date" value={joiningDate} />
                        <DetailRow label="Open action items" value={openActionItems} />
                        <DetailRow label="Profile sync" value={syncWarnings.length ? 'Needs review' : 'Ready'} />
                    </Paper>
                </Grid>
            </Grid>

            <Paper sx={{ p: { xs: 3, md: 4 }, mb: 4, bgcolor: 'rgba(15, 23, 42, 0.65)', border: `1px solid ${isOnDuty ? alpha(binThemeTokens.gold, 0.4) : 'rgba(255,255,255,0.05)'}`, borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                <Grid container spacing={3} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={12} md={6}>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={3} alignItems="center">
                            <Box sx={{ p: 2, bgcolor: isOnDuty ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.05)', borderRadius: 4, color: isOnDuty ? binThemeTokens.gold : 'rgba(255,255,255,0.3)' }}>{dutyStatus === 'BREAK' ? <Coffee size={32} /> : <Power size={32} />}</Box>
                            <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900, letterSpacing: 1 }}>DUTY PROTOCOL</Typography><Typography variant="h5" fontWeight="950" sx={{ color: isOnDuty ? '#FFF' : 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>{String(dutyStatus).replace('_', ' ')}</Typography></Box>
                        </Stack>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} justifyContent={{ xs: 'flex-start', md: isRTL ? 'flex-start' : 'flex-end' }}>
                            {dutyStatus === 'OFF' ? <Button variant="contained" onClick={() => handleDutyToggle('WORKING')} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, borderRadius: 4 }}>ACTIVATE DUTY</Button> : <><Button variant="outlined" onClick={() => handleDutyToggle(dutyStatus === 'WORKING' ? 'BREAK' : 'WORKING')} disabled={updating} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, px: 4, borderRadius: 4 }}>{dutyStatus === 'WORKING' ? 'STANDBY / BREAK' : 'RESUME OPS'}</Button><Button variant="outlined" color="error" onClick={() => handleDutyToggle('OFF')} disabled={updating} sx={{ fontWeight: 950, px: 3, borderRadius: 4 }}>END SHIFT</Button></>}
                        </Stack>
                    </Grid>
                </Grid>
            </Paper>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} lg={7}>
                    <Paper sx={{ p: { xs: 3, md: 4 }, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}><Stack direction="row" spacing={1.5} alignItems="center"><Target size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Active Mission Feed</Typography></Stack><Button size="small" onClick={() => navigate('/technician/jobs')} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>VIEW ALL</Button></Stack>
                        {activeJobs.length === 0 ? <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>No active missions assigned. Keep duty status active to receive dispatches.</Typography> : <Stack spacing={2}>{activeJobs.slice(0, 5).map((job) => <Paper key={job.id} onClick={() => navigate(`/technician/job/${job.id}`)} sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, cursor: 'pointer', minWidth: 0, '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: alpha(binThemeTokens.gold, 0.3) } }}><Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}><Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold, alignSelf: { xs: 'flex-start', sm: 'center' } }}><MapPin size={20} /></Box><Box flex={1} sx={{ minWidth: 0 }}><Typography fontWeight="900" color="#FFF" sx={{ overflowWrap: 'anywhere' }}>{String(job.category || job.issueType || 'Maintenance')} - {String(job.unitNumber || job.propertyName || '')}</Typography><Typography variant="caption" color="rgba(255,255,255,0.45)">{String(job.propertyName || job.address || 'Property')}</Typography><Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap><Chip size="small" label={String(job.status || 'ACTIVE')} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} /><Chip size="small" label={String(job.priority || 'standard')} sx={{ bgcolor: alpha(job.priority === 'emergency' ? '#ef4444' : '#3b82f6', 0.12), color: job.priority === 'emergency' ? '#ef4444' : '#93c5fd', fontWeight: 900 }} /></Stack></Box><ArrowRight size={16} color="rgba(255,255,255,0.3)" style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} /></Stack></Paper>)}</Stack>}
                    </Paper>
                </Grid>
                <Grid item xs={12} lg={5}>
                    <Paper sx={{ p: { xs: 3, md: 4 }, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}><Award size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Performance Command</Typography></Stack>
                        <DetailRow label="Completed this month" value={stats.completedMonth} /><DetailRow label="Quality score" value={qualityDisplay} /><DetailRow label="SLA health" value={slaDisplay} /><DetailRow label="Open SLA risks" value={stats.slaRisk} />
                        <Box sx={{ mt: 2 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>MONTHLY OPS PROGRESS</Typography><LinearProgress variant="determinate" value={Math.min(100, stats.completedMonth * 5)} sx={{ height: 8, borderRadius: 4, mt: 1, bgcolor: 'rgba(255,255,255,0.06)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} /></Box>
                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', my: 2.5 }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>RECENT COMPLETIONS</Typography>
                        <Stack spacing={1.2} sx={{ mt: 1.5 }}>{recentCompleted.length === 0 ? <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>No completed records synced yet.</Typography> : recentCompleted.slice(0, 3).map((job: any) => <Typography key={job.id} variant="body2" sx={{ color: '#FFF', overflowWrap: 'anywhere' }}>✓ {job.propertyName || job.category || job.id} — {formatUiDate(job.completedAt)}</Typography>)}</Stack>
                    </Paper>
                </Grid>
            </Grid>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={6}><Paper sx={{ p: { xs: 3, md: 4 }, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}><Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}><FileText size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Compliance Documents</Typography></Stack><DetailRow label="Visa expiry" value={visaExpiry} /><DetailRow label="Emirates ID expiry" value={idExpiry} /><DetailRow label="Passport expiry" value={passportExpiry} /><DetailRow label="Medical card" value={medicalExpiry} /><DetailRow label="PPE issued" value={textOrPending(profile.ppeIssued, profile.ppeStatus)} /><DetailRow label="Driving license" value={textOrPending(profile.drivingLicenseStatus, formatUiDate(profile.drivingLicenseExpiry))} /></Paper></Grid>
                <Grid item xs={12} md={6}><Paper sx={{ p: { xs: 3, md: 4 }, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}><Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}><Hammer size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Skills, Tools & Assets</Typography></Stack><DetailRow label="Primary trade" value={trade} /><DetailRow label="Skill level" value={textOrPending(profile.skillLevel, profile.grade, profile.rank)} /><DetailRow label="Vehicle" value={<><Car size={13} /> {textOrPending(profile.vehicleNumber, profile.assignedVehicle)}</>} /><DetailRow label="Tool kit" value={textOrPending(profile.toolKitStatus, profile.toolsIssued)} /><DetailRow label="Certifications" value={certRows.length || 'Pending certification sync'} /><DetailRow label="Dispatch readiness" value={textOrPending(profile.gpsStatus, profile.dispatchStatus, 'Ready for dispatch')} /></Paper></Grid>
            </Grid>

            {syncWarnings.length > 0 && <Paper sx={{ p: 3, mb: 4, bgcolor: alpha('#f59e0b', 0.08), border: `1px solid ${alpha('#f59e0b', 0.24)}`, borderRadius: 4 }}><Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}><AlertTriangle size={20} color="#f59e0b" /><Typography variant="subtitle1" fontWeight="950" color="#FFF">Sync Warnings</Typography></Stack>{syncWarnings.map((warning) => <Typography key={warning} variant="body2" sx={{ color: '#facc15' }}>• {warning}</Typography>)}</Paper>}

            {missionPool.length > 0 && isOnDuty && <Box><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 3 }}><Navigation size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Available Mission Pool</Typography></Stack><Grid container spacing={3}>{missionPool.map((job) => <Grid item xs={12} md={6} key={job.id}><Paper sx={{ p: 4, bgcolor: job.priority === 'emergency' ? alpha('#ef4444', 0.08) : 'rgba(22, 22, 24, 0.7)', border: `1px solid ${job.priority === 'emergency' ? alpha('#ef4444', 0.3) : 'rgba(255,255,255,0.05)'}`, borderRadius: 4, minWidth: 0, '&:hover': { transform: 'translateY(-2px)', borderColor: job.priority === 'emergency' ? alpha('#ef4444', 0.5) : binThemeTokens.gold } }}><Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}><Box sx={{ minWidth: 0 }}><Typography variant="overline" sx={{ color: job.priority === 'emergency' ? '#ef4444' : binThemeTokens.gold, fontWeight: 950 }}>{String(job.priority || 'standard').toUpperCase()}</Typography><Typography variant="h6" fontWeight="950" color="#FFF" sx={{ overflowWrap: 'anywhere' }}>{String(job.category || 'Issue')}</Typography></Box>{job.priority === 'emergency' && <Zap color="#ef4444" />}</Stack><Typography variant="body2" color="rgba(255,255,255,0.5)" sx={{ mb: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(job.description || 'No description')}</Typography><Button fullWidth variant="contained" onClick={() => handleAcceptJob(String(job.id))} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, '&:hover': { bgcolor: '#b4954e' } }}>CLAIM MISSION</Button></Paper></Grid>)}</Grid></Box>}
        </Box>
    );
}
