import React, { useEffect, useMemo, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    LinearProgress,
    Paper,
    Stack,
    Typography,
    alpha,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Award,
    BadgeCheck,
    Briefcase,
    CalendarDays,
    Car,
    CheckCircle2,
    Clock,
    Coffee,
    FileText,
    Hammer,
    Mail,
    MapPin,
    Navigation,
    Phone,
    Power,
    Target,
    User,
    Zap,
} from 'lucide-react';
import {
    collection,
    db,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc,
    where,
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { TICKET_STATUS } from '../../utils/ticketConstants';
import { ALL_TECHNICIAN_ACTIVE_STATUSES, TICKET_AUDIT_ACTIONS, logAuditAction, onSnapshotSplitIn } from '../../shared-exports';
import type { SnapshotDoc } from '../../utils/queryUtils';
import { formatUiDate, normalizeEmail, textOrPending, uniqueRows } from '../utils/technicianDashboardFields';
import {
    formatDispatchReadiness,
    formatDocumentStatus,
    formatMissingTechnicianField,
    normalizeTechnicianProfile,
} from '../utils/normalizeTechnicianProfile';

const ui = {
    canvas: '#FFFFFF',
    soft: '#F8F9FB',
    platinum: '#F7F7F4',
    ink: '#111827',
    muted: '#667085',
    line: '#E5E7EB',
    gold: binThemeTokens.gold,
    green: '#059669',
    red: '#DC2626',
    blue: '#2563EB',
};

const statusTone = (status: string) => {
    const value = String(status || '').toLowerCase();
    if (value.includes('active') || value.includes('approved') || value.includes('working') || value.includes('ready') || value.includes('available') || value.includes('healthy') || value.includes('synced')) return ui.green;
    if (value.includes('pending') || value.includes('break') || value.includes('review') || value.includes('partial')) return ui.gold;
    if (value.includes('off') || value.includes('expired') || value.includes('blocked') || value.includes('missing') || value.includes('risk')) return ui.red;
    return ui.muted;
};

const formatTime = (value: any) => {
    try {
        if (!value) return 'Not checked in yet';
        if (typeof value?.toDate === 'function') return value.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return 'Not checked in yet';
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

const readDocByUid = async (collectionName: string, uid?: string | null): Promise<any | null> => {
    if (!uid) return null;
    try {
        const snap = await getDoc(doc(db, collectionName, uid));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
        console.warn(`[TechnicianDashboard] ${collectionName}/${uid} unavailable:`, error);
        return null;
    }
};

function SectionCard({ children, sx = {} }: { children: React.ReactNode; sx?: object }) {
    return (
        <Paper sx={{ p: { xs: 2.5, md: 3.25 }, height: '100%', bgcolor: ui.canvas, border: `1px solid ${ui.line}`, borderRadius: 3.5, boxShadow: '0 12px 30px rgba(17,24,39,0.07)', minWidth: 0, ...sx }}>
            {children}
        </Paper>
    );
}

function MetricCard({ icon, label, value, tone = ui.gold, helper }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string; helper?: string }) {
    return (
        <Paper sx={{ p: { xs: 2, md: 2.5 }, height: '100%', bgcolor: '#FFFFFF', border: `1px solid ${alpha(tone, 0.28)}`, borderRadius: 2.5, minWidth: 0, boxShadow: '0 10px 24px rgba(17,24,39,0.055)' }}>
            <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1 }}>
                <Box sx={{ width: 34, height: 34, borderRadius: 1.5, bgcolor: alpha(tone, 0.10), color: tone, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</Box>
                <Typography variant="caption" sx={{ color: ui.ink, fontWeight: 950, letterSpacing: 0.35, textTransform: 'uppercase' }}>{label}</Typography>
            </Stack>
            <Typography variant="h4" fontWeight="950" sx={{ color: ui.ink, lineHeight: 1 }}>{value}</Typography>
            {helper && <Typography variant="caption" sx={{ color: ui.muted, mt: 0.8, display: 'block', fontWeight: 750 }}>{helper}</Typography>}
        </Paper>
    );
}

function DetailRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '130px minmax(0, 1fr)', md: '142px minmax(0, 1fr)' }, gap: { xs: 0.25, sm: 1.4 }, alignItems: 'start', py: 1.05, minWidth: 0, borderBottom: `1px solid ${alpha(ui.line, 0.75)}` }}>
            <Typography variant="caption" sx={{ color: ui.muted, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.25, lineHeight: 1.25 }}>{label}</Typography>
            <Typography variant="body2" sx={{ color: ui.ink, fontWeight: 850, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.45, display: 'flex', gap: 0.7, alignItems: 'center' }}>
                {icon}{value || 'Not set'}
            </Typography>
        </Box>
    );
}

function TitleRow({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2.5 }}>
            <Box sx={{ color: ui.gold, display: 'flex' }}>{icon}</Box>
            <Typography variant="h6" fontWeight="950" sx={{ color: ui.ink, letterSpacing: '-0.02em' }}>{title}</Typography>
        </Stack>
    );
}

const readable = (...values: any[]) => {
    const value = textOrPending(...values);
    return value === 'Pending sync' ? 'Not set' : value;
};

export default function TechnicianDashboardPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [dutyStatus, setDutyStatus] = useState(user?.dutyStatus || 'OFF');
    const [updating, setUpdating] = useState(false);
    const [profileSources, setProfileSources] = useState<any>({});
    const [certRows, setCertRows] = useState<any[]>([]);
    const [recentCompleted, setRecentCompleted] = useState<any[]>([]);
    const [profileReadWarnings, setProfileReadWarnings] = useState<string[]>([]);
    const [stats, setStats] = useState({ assigned: 0, emergency: 0, inProgress: 0, completedToday: 0, completedMonth: 0, slaRisk: 0, quality: 0 });
    const [missionPool, setMissionPool] = useState<any[]>([]);
    const [activeJobs, setActiveJobs] = useState<SnapshotDoc[]>([]);

    useEffect(() => {
        if (!user?.uid) return;
        setDutyStatus(user.dutyStatus || 'OFF');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const unsubAssigned = onSnapshotSplitIn(collection(db, 'maintenanceTickets'), { field: 'assignedTechnicianId', value: user.uid }, 'status', ALL_TECHNICIAN_ACTIVE_STATUSES, (jobs: SnapshotDoc[]) => {
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
        });

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

        return () => { unsubAssigned(); unsubPool(); unsubCompleted(); unsubMonthCompleted(); };
    }, [user]);

    useEffect(() => {
        const loadStaffData = async () => {
            if (!user?.uid) return;
            const warnings: string[] = [];
            const emailValue = normalizeEmail(user.email);
            const userProfile = await readDocByUid('users', user.uid);
            if (!userProfile) warnings.push('Main user profile could not be read.');
            const technicianByUid = await readDocByUid('technicians', user.uid);
            const technicianByEmail = !technicianByUid && emailValue ? await readRows('technicians', 'email', emailValue, 1) : [];
            const technicianProfile = technicianByUid || technicianByEmail[0] || null;
            const hrProfile = await readDocByUid('hrProfiles', user.uid);
            const staffProfile = await readDocByUid('staffProfiles', user.uid);
            const staffAgreement = await readDocByUid('staffAgreements', user.uid);
            const staffAsset = await readDocByUid('staffAssets', user.uid);
            const staffRosterRows = uniqueRows([...(await readRows('staff_roster', 'uid', user.uid, 4)), ...(await readRows('staff_roster', 'email', emailValue, 4))]);
            const hrStaffRows = uniqueRows([...(await readRows('hr_staff', 'uid', user.uid, 4)), ...(await readRows('hr_staff', 'email', emailValue, 4))]);
            const attendanceRows = uniqueRows([...(await readRows('attendance', 'uid', user.uid, 6)), ...(await readRows('attendance', 'technicianId', user.uid, 6)), ...(await readRows('attendanceLogs', 'uid', user.uid, 6))]);
            const certs = uniqueRows([
                ...(await readRows('technician_certifications', 'technicianId', user.uid, 8)),
                ...(await readRows('certifications', 'technicianId', user.uid, 8)),
                ...(await readRows('staffTraining', 'uid', user.uid, 8)),
                ...(((technicianProfile as any)?.certifications || (userProfile as any)?.certifications || []) as any[]).map((item: any, index: number) => ({ id: `embedded-${index}`, ...(typeof item === 'string' ? { name: item } : item) })),
            ]);
            setProfileSources({ technician: technicianProfile, staffRoster: staffRosterRows[0] || null, hrStaff: hrStaffRows[0] || null, hrProfile, staffProfile, staffAsset, staffAgreement, user: userProfile, attendance: attendanceRows[0] || null });
            setCertRows(certs);
            setProfileReadWarnings(warnings);
        };
        loadStaffData();
    }, [user]);

    const profile = useMemo(() => normalizeTechnicianProfile({ ...profileSources, certifications: certRows }), [profileSources, certRows]);
    const raw = profile.raw || {};
    const technicianName = readable(profile.fullName, user?.displayName, 'Technician');
    const employeeId = readable(raw.employeeCode, raw.employeeId, raw.staffId, raw.badgeNumber, user?.uid);
    const trade = readable(profile.primaryTrade, raw.department, 'General Maintenance');
    const phone = readable(profile.phone, raw.phoneNumber, raw.phone, raw.mobile);
    const email = readable(profile.email, user?.email);
    const supervisor = readable(raw.supervisorName, raw.managerName, raw.reportingManager, 'Operations Lead');
    const shift = readable(raw.shiftName, raw.shift, raw.workSchedule, raw.workingHours, 'Day Shift');
    const baseLocation = readable(raw.baseLocation, raw.serviceZone, raw.zone, raw.area, raw.emirate, 'UAE field operations');
    const contractType = readable(raw.contractType, raw.employmentType, raw.staffType, 'Full-time staff');
    const joiningDate = formatUiDate(raw.joiningDate || raw.joinedAt || raw.createdAt);
    const visaExpiry = formatUiDate(raw.visaExpiry || raw.visaExpiryDate || raw.residencyExpiry);
    const idExpiry = formatUiDate(raw.emiratesIdExpiry || raw.eidExpiry || raw.idExpiry);
    const medicalExpiry = formatUiDate(profile.medicalCardExpiry || raw.medicalExpiry || raw.healthCardExpiry);
    const passportExpiry = formatUiDate(raw.passportExpiry || raw.passportExpiryDate);
    const qualityDisplay = stats.quality ? `${stats.quality}/5` : readable(raw.qualityScore, raw.rating, 'Pending');
    const slaDisplay = readable(raw.slaCompliance, raw.slaScore, stats.slaRisk > 0 ? 'At risk' : 'Healthy');
    const coreWarnings = [...profileReadWarnings, ...profile.missingFields.map(formatMissingTechnicianField)];
    const complianceWarnings = (profile.complianceActionItems || []).map(formatMissingTechnicianField);
    const missingDocuments = [visaExpiry, idExpiry, medicalExpiry, passportExpiry].filter((value) => value === 'Pending sync' || value === 'Not set').length;
    const openActionItems = missingDocuments + complianceWarnings.length;
    const isOnDuty = dutyStatus === 'WORKING' || profile.dutyStatus === 'available';
    const vehicleLabel = profile.vehicleAssigned ? profile.vehicleNumber || 'Assigned' : 'Not assigned';
    const toolKitLabel = profile.toolKitIssued ? 'Issued' : 'Not issued';
    const ppeLabel = profile.ppeIssued ? 'Issued' : 'Not issued';
    const certificationLabel = formatDocumentStatus(profile.certificationsStatus);
    const leaveBalance = readable(raw.leaveBalance, raw.annualLeaveBalance, raw.staffAgreement?.leaveBalance, '30');
    const rosterStatus = readable(raw.rosterStatus, raw.attendanceStatus, raw.status, 'Active');

    const handleDutyToggle = async (newStatus: string) => {
        if (!user?.uid) return;
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), { dutyStatus: newStatus, onDuty: newStatus === 'WORKING', isAvailable: newStatus === 'WORKING', updatedAt: serverTimestamp() });
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
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2, color: ui.ink }}>
            <CircularProgress sx={{ color: ui.gold }} />
            <Typography variant="overline" sx={{ color: ui.muted, fontWeight: 900 }}>{t('dash.initializing_stream') || 'Initializing Operator Stream...'}</Typography>
        </Box>
    );

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pb: { xs: 8, md: 6 }, minWidth: 0, bgcolor: ui.canvas, color: ui.ink }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 2.5 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
                    <Typography variant="overline" sx={{ color: ui.gold, fontWeight: 950, letterSpacing: 3 }}>{t('dash.terminal.technician') || 'FIELD SOVEREIGN'}</Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ mt: 1, color: ui.ink, fontSize: { xs: '2.05rem', md: '2.8rem' }, letterSpacing: '-0.045em' }}>Technical Command Dashboard</Typography>
                    <Typography variant="body1" sx={{ color: ui.muted, mt: 1, maxWidth: 760, fontWeight: 700 }}>Staff profile, duty status, dispatch performance, SLA health, compliance, tools, certificates, and live mission control in one terminal.</Typography>
                </Box>
                <Avatar sx={{ width: 64, height: 64, bgcolor: alpha(ui.gold, 0.12), border: `2px solid ${alpha(ui.gold, 0.55)}`, color: ui.gold, fontWeight: 950, fontSize: 26, borderRadius: 2 }}>{String(technicianName).charAt(0) || 'T'}</Avatar>
            </Box>

            <SectionCard sx={{ mb: 3.5, bgcolor: ui.platinum }}>
                <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={2.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                        <Box sx={{ p: 1.5, bgcolor: alpha(ui.gold, 0.13), borderRadius: 2, color: ui.gold }}><BadgeCheck size={30} /></Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="overline" sx={{ color: ui.muted, fontWeight: 950, letterSpacing: 1.2 }}>TECHNICIAN IDENTITY</Typography>
                            <Typography variant="h5" fontWeight="950" sx={{ color: ui.ink, overflowWrap: 'anywhere' }}>{technicianName}</Typography>
                            <Typography variant="body2" sx={{ color: ui.muted, overflowWrap: 'anywhere', fontWeight: 700 }}>{trade} • {employeeId}</Typography>
                        </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} useFlexGap>
                        {[String(dutyStatus).replace('_', ' '), `Core sync: ${profile.syncStatus}`, `SLA: ${slaDisplay}`, `Actions: ${openActionItems}`].map((item) => <Chip key={item} label={item} sx={{ bgcolor: '#FFFFFF', color: statusTone(item), border: `1px solid ${alpha(statusTone(item), 0.35)}`, fontWeight: 950 }} />)}
                    </Stack>
                </Stack>
            </SectionCard>

            <Grid container spacing={2.5} sx={{ mb: 3.5 }}>
                <Grid item xs={6} md={3}><MetricCard icon={<Activity size={20} />} label="Active Jobs" value={stats.assigned} tone={ui.blue} helper="Assigned live tickets" /></Grid>
                <Grid item xs={6} md={3}><MetricCard icon={<Zap size={20} />} label="Emergency" value={stats.emergency} tone={ui.red} helper="Priority response" /></Grid>
                <Grid item xs={6} md={3}><MetricCard icon={<CheckCircle2 size={20} />} label="Closed Today" value={stats.completedToday} tone={ui.green} helper="Completed jobs" /></Grid>
                <Grid item xs={6} md={3}><MetricCard icon={<Clock size={20} />} label="SLA Risk" value={stats.slaRisk} tone={stats.slaRisk > 0 ? ui.red : ui.green} helper="Requires attention" /></Grid>
            </Grid>

            <Grid container spacing={3} sx={{ mb: 3.5 }} alignItems="stretch">
                <Grid item xs={12} lg={4}><SectionCard><TitleRow icon={<User />} title="Staff Control Profile" /><DetailRow label="Full name" value={technicianName} /><DetailRow label="Employee ID" value={employeeId} /><DetailRow label="Email" value={email} icon={<Mail size={13} />} /><DetailRow label="Phone" value={phone} icon={<Phone size={13} />} /><DetailRow label="Trade" value={trade} /><DetailRow label="Supervisor" value={supervisor} /><DetailRow label="Shift" value={shift} /><DetailRow label="Base zone" value={baseLocation} /></SectionCard></Grid>
                <Grid item xs={12} lg={4}><SectionCard><TitleRow icon={<Briefcase />} title="Duty & Attendance" /><DetailRow label="Duty status" value={profile.dutyStatus || dutyStatus} /><DetailRow label="Last check-in" value={formatTime(raw.checkIn || raw.clockIn || raw.startedAt)} /><DetailRow label="Roster status" value={rosterStatus} /><DetailRow label="Monthly completions" value={stats.completedMonth} /><DetailRow label="Leave balance" value={`${leaveBalance} days`} /><Button fullWidth variant="outlined" onClick={() => navigate('/technician/hr')} sx={{ mt: 2, borderColor: ui.gold, color: ui.gold, fontWeight: 950 }}>HR & REQUESTS</Button></SectionCard></Grid>
                <Grid item xs={12} lg={4}><SectionCard><TitleRow icon={<CalendarDays />} title="Contract & Actions" /><DetailRow label="Contract type" value={contractType} /><DetailRow label="Joining date" value={joiningDate === 'Pending sync' ? 'Not set' : joiningDate} /><DetailRow label="Open action items" value={openActionItems} /><DetailRow label="Core profile sync" value={profile.syncStatus === 'synced' ? 'Ready' : 'Needs core review'} /><DetailRow label="Compliance actions" value={complianceWarnings.length ? `${complianceWarnings.length} pending` : 'Clear'} /></SectionCard></Grid>
            </Grid>

            <SectionCard sx={{ mb: 3.5, bgcolor: isOnDuty ? alpha(ui.green, 0.045) : ui.soft, border: `1px solid ${isOnDuty ? alpha(ui.green, 0.25) : ui.line}` }}>
                <Grid container spacing={3} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={12} md={6}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center"><Box sx={{ p: 1.5, bgcolor: alpha(isOnDuty ? ui.green : ui.gold, 0.10), borderRadius: 2, color: isOnDuty ? ui.green : ui.gold }}>{dutyStatus === 'BREAK' ? <Coffee size={28} /> : <Power size={28} />}</Box><Box><Typography variant="caption" sx={{ color: ui.muted, fontWeight: 900, letterSpacing: 1 }}>DUTY PROTOCOL</Typography><Typography variant="h5" fontWeight="950" sx={{ color: ui.ink, textTransform: 'uppercase' }}>{String(dutyStatus).replace('_', ' ')}</Typography></Box></Stack></Grid>
                    <Grid item xs={12} md={6}><Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5} justifyContent={{ xs: 'flex-start', md: isRTL ? 'flex-start' : 'flex-end' }}>{dutyStatus === 'OFF' ? <Button variant="contained" onClick={() => handleDutyToggle('WORKING')} disabled={updating} sx={{ bgcolor: ui.gold, color: ui.ink, fontWeight: 950, px: 3 }}>ACTIVATE DUTY</Button> : <><Button variant="outlined" onClick={() => handleDutyToggle(dutyStatus === 'WORKING' ? 'BREAK' : 'WORKING')} disabled={updating} sx={{ borderColor: ui.gold, color: ui.gold, fontWeight: 950, px: 3 }}>{dutyStatus === 'WORKING' ? 'STANDBY / BREAK' : 'RESUME OPS'}</Button><Button variant="outlined" color="error" onClick={() => handleDutyToggle('OFF')} disabled={updating} sx={{ fontWeight: 950, px: 3 }}>END SHIFT</Button></>}</Stack></Grid>
                </Grid>
            </SectionCard>

            <Grid container spacing={3} sx={{ mb: 3.5 }}>
                <Grid item xs={12} lg={7}><SectionCard><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}><TitleRow icon={<Target size={20} />} title="Active Mission Feed" /><Button size="small" onClick={() => navigate('/technician/jobs')} sx={{ color: ui.gold, fontWeight: 900 }}>VIEW ALL</Button></Stack>{activeJobs.length === 0 ? <Typography variant="body2" sx={{ color: ui.muted, fontWeight: 700 }}>No active missions assigned. Keep duty status active to receive dispatches.</Typography> : <Stack spacing={1.5}>{activeJobs.slice(0, 5).map((job) => <Paper key={job.id} onClick={() => navigate(`/technician/job/${job.id}`)} sx={{ p: 2, bgcolor: ui.soft, border: `1px solid ${ui.line}`, borderRadius: 2, cursor: 'pointer', minWidth: 0, '&:hover': { borderColor: alpha(ui.gold, 0.5) } }}><Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}><Box sx={{ p: 1.2, bgcolor: alpha(ui.gold, 0.1), borderRadius: 1.5, color: ui.gold, alignSelf: { xs: 'flex-start', sm: 'center' } }}><MapPin size={20} /></Box><Box flex={1} sx={{ minWidth: 0 }}><Typography fontWeight="900" sx={{ color: ui.ink, overflowWrap: 'anywhere' }}>{String(job.category || job.issueType || 'Maintenance')} - {String(job.unitNumber || job.propertyName || '')}</Typography><Typography variant="caption" sx={{ color: ui.muted, fontWeight: 700 }}>{String(job.propertyName || job.address || 'Property')}</Typography><Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap><Chip size="small" label={String(job.status || 'ACTIVE')} sx={{ bgcolor: '#FFFFFF', color: ui.gold, border: `1px solid ${alpha(ui.gold, 0.3)}`, fontWeight: 900 }} /><Chip size="small" label={String(job.priority || 'standard')} sx={{ bgcolor: '#FFFFFF', color: job.priority === 'emergency' ? ui.red : ui.blue, border: `1px solid ${alpha(job.priority === 'emergency' ? ui.red : ui.blue, 0.3)}`, fontWeight: 900 }} /></Stack></Box><ArrowRight size={16} color={ui.muted} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} /></Stack></Paper>)}</Stack>}</SectionCard></Grid>
                <Grid item xs={12} lg={5}><SectionCard><TitleRow icon={<Award size={20} />} title="Performance Command" /><DetailRow label="Completed this month" value={stats.completedMonth} /><DetailRow label="Quality score" value={qualityDisplay} /><DetailRow label="SLA health" value={slaDisplay} /><DetailRow label="Open SLA risks" value={stats.slaRisk} /><Box sx={{ mt: 2 }}><Typography variant="caption" sx={{ color: ui.muted, fontWeight: 900 }}>MONTHLY OPS PROGRESS</Typography><LinearProgress variant="determinate" value={Math.min(100, stats.completedMonth * 5)} sx={{ height: 8, borderRadius: 4, mt: 1, bgcolor: ui.line, '& .MuiLinearProgress-bar': { bgcolor: ui.gold } }} /></Box><Divider sx={{ my: 2.5 }} />{recentCompleted.length === 0 ? <Typography variant="body2" sx={{ color: ui.muted }}>No completed jobs recorded this month.</Typography> : <Stack spacing={1}>{recentCompleted.slice(0, 3).map((job) => <Typography key={job.id} variant="body2" sx={{ color: ui.ink, fontWeight: 750 }}>• {String(job.category || 'Completed job')}</Typography>)}</Stack>}</SectionCard></Grid>
            </Grid>

            <Grid container spacing={3} sx={{ mb: 3.5 }}>
                <Grid item xs={12} md={6}><SectionCard><TitleRow icon={<FileText size={20} />} title="Compliance Documents" /><DetailRow label="Visa expiry" value={visaExpiry === 'Pending sync' ? 'Not set' : visaExpiry} /><DetailRow label="Emirates ID expiry" value={idExpiry === 'Pending sync' ? 'Not set' : idExpiry} /><DetailRow label="Passport expiry" value={passportExpiry === 'Pending sync' ? 'Not set' : passportExpiry} /><DetailRow label="Medical card" value={formatDocumentStatus(profile.medicalCardStatus)} /><DetailRow label="Medical card expiry" value={medicalExpiry === 'Pending sync' ? 'Not set' : medicalExpiry} /><DetailRow label="PPE issued" value={ppeLabel} /><DetailRow label="Driving license" value={formatDocumentStatus(profile.drivingLicenseStatus)} /></SectionCard></Grid>
                <Grid item xs={12} md={6}><SectionCard><TitleRow icon={<Hammer size={20} />} title="Skills, Tools & Assets" /><DetailRow label="Primary trade" value={trade} /><DetailRow label="Skill level" value={profile.skillLevel} /><DetailRow label="Vehicle" value={vehicleLabel} icon={<Car size={13} />} /><DetailRow label="Tool kit" value={toolKitLabel} /><DetailRow label="Certifications" value={certificationLabel} /><DetailRow label="Dispatch readiness" value={formatDispatchReadiness(profile.dispatchReadiness)} /></SectionCard></Grid>
            </Grid>

            {(coreWarnings.length > 0 || complianceWarnings.length > 0) && <SectionCard sx={{ mb: 3.5, bgcolor: alpha('#F59E0B', 0.08), border: `1px solid ${alpha('#F59E0B', 0.24)}` }}><Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}><AlertTriangle size={20} color="#D97706" /><Typography variant="subtitle1" fontWeight="950" sx={{ color: ui.ink }}>Staff Data Review</Typography></Stack>{coreWarnings.map((warning) => <Typography key={warning} variant="body2" sx={{ color: '#92400E', overflowWrap: 'anywhere', fontWeight: 750 }}>• Core sync: {warning}</Typography>)}{complianceWarnings.map((warning) => <Typography key={warning} variant="body2" sx={{ color: '#92400E', overflowWrap: 'anywhere', fontWeight: 750 }}>• Compliance action: {warning}</Typography>)}</SectionCard>}

            {missionPool.length > 0 && isOnDuty && <Box><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 2 }}><Navigation size={20} color={ui.gold} /><Typography variant="h6" fontWeight="950" sx={{ color: ui.ink }}>Available Mission Pool</Typography></Stack><Grid container spacing={3}>{missionPool.map((job) => <Grid item xs={12} md={6} key={job.id}><SectionCard sx={{ bgcolor: job.priority === 'emergency' ? alpha(ui.red, 0.055) : ui.canvas, border: `1px solid ${job.priority === 'emergency' ? alpha(ui.red, 0.25) : ui.line}` }}><Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}><Box sx={{ minWidth: 0 }}><Typography variant="overline" sx={{ color: job.priority === 'emergency' ? ui.red : ui.gold, fontWeight: 950 }}>{String(job.priority || 'standard').toUpperCase()}</Typography><Typography variant="h6" fontWeight="950" sx={{ color: ui.ink, overflowWrap: 'anywhere' }}>{String(job.category || 'Issue')}</Typography></Box>{job.priority === 'emergency' && <Zap color={ui.red} />}</Stack><Typography variant="body2" sx={{ color: ui.muted, mb: 2, fontWeight: 700 }}>{String(job.description || 'No description')}</Typography><Button fullWidth variant="contained" onClick={() => handleAcceptJob(String(job.id))} sx={{ bgcolor: ui.gold, color: ui.ink, fontWeight: 950 }}>CLAIM MISSION</Button></SectionCard></Grid>)}</Grid></Box>}
        </Box>
    );
}
