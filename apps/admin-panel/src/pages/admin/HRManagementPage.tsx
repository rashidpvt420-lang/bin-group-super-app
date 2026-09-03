import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Alert, Avatar, Box, Button, Chip, CircularProgress, Container, Grid, MenuItem, Paper, Stack,
    Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField,
    Typography, alpha,
} from '@mui/material';
import { CalendarDays, FileText, RefreshCw, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { useAuth } from '../../context/AuthContext';
import StaffAccessPage from './StaffAccessPage';
import StaffLifecycleDetailsDialog from './StaffLifecycleDetailsDialog';

type StaffLifecycle = {
    uid: string;
    displayName: string;
    email: string;
    phoneNumber?: string;
    role: string;
    department?: string;
    specialization?: string;
    status: string;
    emailVerified: boolean;
    authDisabled: boolean;
    modules: string[];
    joiningDate?: string | null;
    contractEndDate?: string | null;
    employmentType?: string | null;
    shiftName?: string | null;
    workingHours?: string | null;
    offDay?: string | null;
    employeeIdConfigured: boolean;
    emiratesIdConfigured: boolean;
    salaryConfigured: boolean;
    lifecycleState: string;
    onboardingStage?: string;
    onboardingComplete: boolean;
    invitationStatus?: string | null;
};

type HrOps = { attendance: any[]; leaveRequests: any[]; documents: any[] };

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'ON_LEAVE', 'SICK_LEAVE', 'REMOTE', 'OFF_DAY'];
const LEAVE_TYPES = ['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'COMPASSIONATE', 'OTHER'];
const DOCUMENT_TYPES = ['EMPLOYMENT_CONTRACT', 'EMIRATES_ID', 'PASSPORT', 'VISA', 'CERTIFICATE', 'DRIVING_LICENCE', 'WARNING_LETTER', 'MEDICAL_INSURANCE', 'OTHER'];

function errorText(error: any) {
    return String(error?.details || error?.message || error?.code || 'HR operation failed.')
        .replace(/^FirebaseError:\s*/i, '')
        .slice(0, 300);
}

function lifecycleColor(state: string) {
    const value = String(state || '').toUpperCase();
    if (value === 'ACTIVE') return 'success';
    if (value === 'SUSPENDED' || value === 'OFFBOARDED') return 'error';
    if (value === 'INVITED') return 'warning';
    return 'info';
}

export default function HRManagementPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState(0);
    const [staff, setStaff] = useState<StaffLifecycle[]>([]);
    const [hrOps, setHrOps] = useState<HrOps>({ attendance: [], leaveRequests: [], documents: [] });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [canManageLifecycle, setCanManageLifecycle] = useState(false);

    const [attendanceForm, setAttendanceForm] = useState({ uid: '', workDate: new Date().toISOString().slice(0, 10), status: 'PRESENT', checkIn: '', checkOut: '', note: '' });
    const [leaveForm, setLeaveForm] = useState({ uid: '', leaveType: 'ANNUAL', startDate: '', endDate: '', reason: '' });
    const [documentForm, setDocumentForm] = useState({ uid: '', documentType: 'EMPLOYMENT_CONTRACT', storagePath: '', fileName: '', expiryDate: '' });

    const privilegedHRRoles = new Set(['super_admin', 'admin', 'ceo', 'hr_admin', 'hr_manager']);
    const provisioningAdminRoles = new Set(['super_admin', 'admin', 'ceo']);
    const isHRManager = Boolean(user?.claims?.admin === true || user?.isAdmin === true || privilegedHRRoles.has(String(user?.role)));
    const isHRStaff = Boolean(isHRManager || user?.role === 'hr_staff');
    const isProvisioningAdmin = Boolean(
        user?.claims?.admin === true ||
        user?.claims?.isAdmin === true ||
        user?.claims?.super_admin === true ||
        user?.claims?.superAdmin === true ||
        user?.claims?.ceo === true ||
        provisioningAdminRoles.has(String(user?.role)),
    );

    const selectedStaffUid = searchParams.get('staff') || '';

    const loadProtectedHr = useCallback(async () => {
        setRefreshing(true);
        setNotice(null);
        try {
            const getLifecycle = httpsCallable(functions, 'adminGetStaffLifecycle');
            const lifecycleResponse: any = await getLifecycle({});
            const rows = Array.isArray(lifecycleResponse.data?.staff) ? lifecycleResponse.data.staff : [];
            setStaff(rows);
            setCanManageLifecycle(lifecycleResponse.data?.canManageLifecycle === true);
            if (isHRManager) {
                const getOps = httpsCallable(functions, 'adminGetHrOperations');
                const opsResponse: any = await getOps({});
                setHrOps({
                    attendance: Array.isArray(opsResponse.data?.attendance) ? opsResponse.data.attendance : [],
                    leaveRequests: Array.isArray(opsResponse.data?.leaveRequests) ? opsResponse.data.leaveRequests : [],
                    documents: Array.isArray(opsResponse.data?.documents) ? opsResponse.data.documents : [],
                });
            } else {
                setHrOps({ attendance: [], leaveRequests: [], documents: [] });
            }
        } catch (error) {
            setStaff([]);
            setCanManageLifecycle(false);
            setNotice({ type: 'error', message: `HR Command could not load protected lifecycle data: ${errorText(error)}` });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [isHRManager]);

    useEffect(() => { void loadProtectedHr(); }, [loadProtectedHr]);

    useEffect(() => {
        if (!attendanceForm.uid && staff[0]?.uid) setAttendanceForm((value) => ({ ...value, uid: staff[0].uid }));
        if (!leaveForm.uid && staff[0]?.uid) setLeaveForm((value) => ({ ...value, uid: staff[0].uid }));
        if (!documentForm.uid && staff[0]?.uid) setDocumentForm((value) => ({ ...value, uid: staff[0].uid, storagePath: `privateHrDocuments/${staff[0].uid}/` }));
    }, [staff, attendanceForm.uid, leaveForm.uid, documentForm.uid]);

    const filteredStaff = useMemo(() => staff.filter((member) => {
        const haystack = [member.displayName, member.email, member.role, member.specialization, member.department, member.lifecycleState].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(searchTerm.trim().toLowerCase());
    }), [staff, searchTerm]);

    const staffByUid = useMemo(() => new Map(staff.map((member) => [member.uid, member])), [staff]);
    const activeCount = staff.filter((member) => member.lifecycleState === 'ACTIVE').length;
    const invitationCount = staff.filter((member) => member.lifecycleState === 'INVITED').length;
    const incompleteCount = staff.filter((member) => !member.onboardingComplete && !['SUSPENDED', 'OFFBOARDED'].includes(member.lifecycleState)).length;
    const terminalCount = staff.filter((member) => ['SUSPENDED', 'OFFBOARDED'].includes(member.lifecycleState) || ['SUSPENDED', 'OFFBOARDED'].includes(member.status)).length;
    const salaryConfiguredCount = staff.filter((member) => member.salaryConfigured).length;

    const run = async (name: string, payload: any, success: string) => {
        setNotice(null);
        try {
            const callable = httpsCallable(functions, name);
            await callable(payload);
            setNotice({ type: 'success', message: success });
            await loadProtectedHr();
        } catch (error) {
            setNotice({ type: 'error', message: errorText(error) });
        }
    };

    const recordAttendance = async () => run('adminRecordStaffAttendance', attendanceForm, 'Attendance record saved and audited.');
    const createLeave = async () => run('adminCreateStaffLeaveRequest', leaveForm, 'Leave request created in the HR workflow.');
    const reviewLeave = async (requestId: string, decision: string) => run('adminReviewStaffLeaveRequest', { requestId, decision }, `Leave request ${decision.toLowerCase()}.`);
    const registerDocument = async () => run('adminRegisterHrDocumentMetadata', documentForm, 'Private HR document metadata registered.');
    const resendInvitation = async (member: StaffLifecycle) => run('adminResendStaffInvitation', { uid: member.uid }, `Secure invitation queued again for ${member.displayName}.`);
    const offboardStaff = async (member: StaffLifecycle) => {
        const reason = window.prompt(`Offboarding reason for ${member.displayName}:`);
        if (!reason?.trim()) return;
        await run('adminOffboardStaff', { uid: member.uid, reason: reason.trim() }, `${member.displayName} offboarded, Auth disabled, tokens revoked and records preserved.`);
    };

    const openProfile = (uid: string) => {
        const next = new URLSearchParams(searchParams);
        next.set('staff', uid);
        setSearchParams(next);
    };

    const closeProfile = () => {
        const next = new URLSearchParams(searchParams);
        next.delete('staff');
        setSearchParams(next, { replace: true });
    };

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4 }} data-testid="admin-staff-access-route">
            <Container maxWidth="xl">
                <Stack spacing={3}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>SOVEREIGN HUMAN CAPITAL</Typography>
                            <Typography variant="h3" fontWeight="950" color="#FFF">HR <Box component="span" sx={{ color: binThemeTokens.gold }}>Command</Box></Typography>
                            <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.58)', maxWidth: 940 }}>
                                Canonical employee authority: Staff Registry → protected profile → invitation/onboarding → attendance/leave → HR documents → payroll evidence → offboarding/audit. Technician Corps is operational only; employee lifecycle changes happen here.
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1.5}>
                            <Button startIcon={<RefreshCw size={17} />} onClick={() => void loadProtectedHr()} disabled={refreshing} sx={{ color: '#fff' }}>REFRESH</Button>
                            {isProvisioningAdmin && <Button data-testid="admin-register-staff" variant="contained" startIcon={<UserPlus size={18} />} onClick={() => setTab(4)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>REGISTER STAFF</Button>}
                        </Stack>
                    </Box>

                    {notice && <Alert severity={notice.type}>{notice.message}</Alert>}
                    {!canManageLifecycle && isHRStaff && <Alert severity="info">HR Staff has protected read-only lifecycle access. Profile changes, activation, invitation resend and offboarding require HR Manager or Founder/Admin authority.</Alert>}

                    <Grid container spacing={2}>
                        {[
                            ['ACTIVE', activeCount, '#10b981'],
                            ['INVITED', invitationCount, '#f59e0b'],
                            ['ONBOARDING INCOMPLETE', incompleteCount, '#38bdf8'],
                            ['SUSPENDED / OFFBOARDED', terminalCount, '#ef4444'],
                        ].map(([label, value, color]) => (
                            <Grid item xs={12} sm={6} md={3} key={String(label)}>
                                <Paper sx={{ p: 2.5, bgcolor: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 }}>
                                    <Typography variant="caption" sx={{ color: String(color), fontWeight: 950 }}>{String(label)}</Typography>
                                    <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950 }}>{Number(value)}</Typography>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>

                    <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ '& .MuiTab-root': { color: 'rgba(255,255,255,.5)', fontWeight: 900 } }}>
                        <Tab label="STAFF REGISTRY" />
                        <Tab label="ATTENDANCE & LEAVE" disabled={!isHRManager} />
                        <Tab label="PAYROLL HANDOFF" disabled={!isHRManager} />
                        <Tab label="HR DOCUMENTS" disabled={!isHRManager} />
                        <Tab label="STAFF ACCESS" disabled={!isProvisioningAdmin} />
                    </Tabs>

                    {tab === 0 && (
                        <Paper sx={{ bgcolor: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4, overflow: 'hidden' }}>
                            <Box sx={{ p: 2.5, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                                <TextField size="small" placeholder="Search staff, role, department, lifecycle..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <Search size={17} style={{ marginRight: 8 }} /> }} sx={{ minWidth: 360 }} />
                                <Chip label={`${filteredStaff.length} OF ${staff.length} STAFF`} sx={{ fontWeight: 900 }} />
                            </Box>
                            <TableContainer>
                                <Table>
                                    <TableHead><TableRow>
                                        {['STAFF', 'ROLE / DEPARTMENT', 'LIFECYCLE', 'HR READINESS', 'SHIFT', 'ACTIONS'].map((label) => <TableCell key={label} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{label}</TableCell>)}
                                    </TableRow></TableHead>
                                    <TableBody>
                                        {filteredStaff.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6, color: 'rgba(255,255,255,.45)' }}>No staff matched this filter.</TableCell></TableRow>}
                                        {filteredStaff.map((member) => (
                                            <TableRow key={member.uid} hover>
                                                <TableCell><Stack direction="row" spacing={1.5} alignItems="center"><Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, .15), color: binThemeTokens.gold }}>{(member.displayName || '?')[0]}</Avatar><Box><Typography sx={{ color: '#fff', fontWeight: 900 }}>{member.displayName}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>{member.email}</Typography></Box></Stack></TableCell>
                                                <TableCell><Typography sx={{ color: '#fff', fontWeight: 800 }}>{member.role.replace(/_/g, ' ').toUpperCase()}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>{member.department || '—'} · {member.specialization || '—'}</Typography></TableCell>
                                                <TableCell><Stack spacing={.5}><Chip size="small" color={lifecycleColor(member.lifecycleState) as any} label={member.lifecycleState.replace(/_/g, ' ')} sx={{ width: 'fit-content', fontWeight: 900 }} /><Typography variant="caption" sx={{ color: member.emailVerified ? '#10b981' : '#f59e0b' }}>{member.emailVerified ? 'Email verified' : 'Email not verified'}</Typography></Stack></TableCell>
                                                <TableCell><Stack direction="row" spacing={.5} flexWrap="wrap"><Chip size="small" label={member.employeeIdConfigured ? 'EMP ID ✓' : 'EMP ID !'} /><Chip size="small" label={member.emiratesIdConfigured ? 'EID ✓' : 'EID !'} /><Chip size="small" label={member.salaryConfigured ? 'SALARY ✓' : 'SALARY !'} /></Stack></TableCell>
                                                <TableCell><Typography sx={{ color: '#fff' }}>{member.shiftName || 'Unassigned'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>{member.workingHours || 'No working hours'} · {member.offDay || 'No off day'}</Typography></TableCell>
                                                <TableCell><Stack direction="row" spacing={1} flexWrap="wrap"><Button size="small" onClick={() => openProfile(member.uid)} data-testid={`admin-staff-profile-${member.uid}`}>PROFILE</Button>{canManageLifecycle && !member.emailVerified && !['SUSPENDED', 'OFFBOARDED'].includes(member.status) && <Button size="small" onClick={() => void resendInvitation(member)}>RESEND INVITE</Button>}{isProvisioningAdmin && <Button size="small" onClick={() => setTab(4)}>ACCESS</Button>}{canManageLifecycle && !['SUSPENDED', 'OFFBOARDED'].includes(member.status) && <Button size="small" color="error" onClick={() => void offboardStaff(member)}>OFFBOARD</Button>}</Stack></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )}

                    {tab === 1 && isHRManager && (
                        <Grid container spacing={3}>
                            <Grid item xs={12} lg={6}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 }}><Stack direction="row" spacing={1} alignItems="center"><CalendarDays size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight={950}>Attendance</Typography></Stack><Grid container spacing={2} sx={{ mt: 1 }}><Grid item xs={12}><TextField select fullWidth label="Staff" value={attendanceForm.uid} onChange={(e) => setAttendanceForm({ ...attendanceForm, uid: e.target.value })}>{staff.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName} · {member.role}</MenuItem>)}</TextField></Grid><Grid item xs={6}><TextField fullWidth type="date" label="Work date" InputLabelProps={{ shrink: true }} value={attendanceForm.workDate} onChange={(e) => setAttendanceForm({ ...attendanceForm, workDate: e.target.value })} /></Grid><Grid item xs={6}><TextField select fullWidth label="Status" value={attendanceForm.status} onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })}>{ATTENDANCE_STATUSES.map((status) => <MenuItem key={status} value={status}>{status.replace(/_/g, ' ')}</MenuItem>)}</TextField></Grid><Grid item xs={6}><TextField fullWidth label="Check in" value={attendanceForm.checkIn} onChange={(e) => setAttendanceForm({ ...attendanceForm, checkIn: e.target.value })} /></Grid><Grid item xs={6}><TextField fullWidth label="Check out" value={attendanceForm.checkOut} onChange={(e) => setAttendanceForm({ ...attendanceForm, checkOut: e.target.value })} /></Grid><Grid item xs={12}><TextField fullWidth label="Note" value={attendanceForm.note} onChange={(e) => setAttendanceForm({ ...attendanceForm, note: e.target.value })} /></Grid><Grid item xs={12}><Button variant="contained" onClick={() => void recordAttendance()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>SAVE ATTENDANCE</Button></Grid></Grid><Stack spacing={1} sx={{ mt: 3 }}>{hrOps.attendance.slice(0, 8).map((entry) => <Paper key={entry.id} sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,.03)' }}><Typography sx={{ color: '#fff', fontWeight: 800 }}>{staffByUid.get(entry.uid)?.displayName || entry.uid}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.5)' }}>{entry.workDate} · {entry.status} · {entry.checkIn || '—'}–{entry.checkOut || '—'}</Typography></Paper>)}</Stack></Paper></Grid>
                            <Grid item xs={12} lg={6}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 }}><Typography variant="h6" fontWeight={950}>Leave workflow</Typography><Grid container spacing={2} sx={{ mt: 1 }}><Grid item xs={12}><TextField select fullWidth label="Staff" value={leaveForm.uid} onChange={(e) => setLeaveForm({ ...leaveForm, uid: e.target.value })}>{staff.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName} · {member.role}</MenuItem>)}</TextField></Grid><Grid item xs={12}><TextField select fullWidth label="Leave type" value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}>{LEAVE_TYPES.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}</TextField></Grid><Grid item xs={6}><TextField fullWidth type="date" label="Start" InputLabelProps={{ shrink: true }} value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} /></Grid><Grid item xs={6}><TextField fullWidth type="date" label="End" InputLabelProps={{ shrink: true }} value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} /></Grid><Grid item xs={12}><TextField fullWidth label="Reason" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></Grid><Grid item xs={12}><Button variant="contained" onClick={() => void createLeave()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>CREATE LEAVE REQUEST</Button></Grid></Grid><Stack spacing={1} sx={{ mt: 3 }}>{hrOps.leaveRequests.slice(0, 8).map((entry) => <Paper key={entry.id} sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,.03)' }}><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography sx={{ color: '#fff', fontWeight: 800 }}>{staffByUid.get(entry.uid)?.displayName || entry.uid}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.5)' }}>{entry.leaveType} · {entry.startDate} → {entry.endDate} · {entry.status}</Typography></Box>{entry.status === 'PENDING' && <Stack direction="row" spacing={.5}><Button size="small" color="success" onClick={() => void reviewLeave(entry.id, 'APPROVED')}>APPROVE</Button><Button size="small" color="error" onClick={() => void reviewLeave(entry.id, 'REJECTED')}>REJECT</Button></Stack>}</Stack></Paper>)}</Stack></Paper></Grid>
                        </Grid>
                    )}

                    {tab === 2 && isHRManager && <Grid container spacing={3}><Grid item xs={12} md={5}><Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, .06), border: `1px solid ${alpha(binThemeTokens.gold, .35)}`, borderRadius: 4 }}><ShieldCheck size={42} color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950} sx={{ mt: 1 }}>PAYROLL HANDOFF</Typography><Typography sx={{ color: 'rgba(255,255,255,.55)', my: 2 }}>{salaryConfiguredCount} staff have protected salary configuration. Per-staff payroll evidence is visible inside the canonical profile; financial execution stays in the Finance module.</Typography><Button variant="outlined" onClick={() => navigate('/financials/payroll')}>OPEN FINANCE PAYROLL</Button></Paper></Grid><Grid item xs={12} md={7}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', borderRadius: 4 }}><Typography variant="h6" fontWeight={950}>Payroll readiness</Typography><Table size="small"><TableHead><TableRow><TableCell>STAFF</TableCell><TableCell>ROLE</TableCell><TableCell>SALARY CONFIG</TableCell><TableCell>PROFILE</TableCell></TableRow></TableHead><TableBody>{staff.map((member) => <TableRow key={member.uid}><TableCell>{member.displayName}</TableCell><TableCell>{member.role.replace(/_/g, ' ')}</TableCell><TableCell><Chip size="small" color={member.salaryConfigured ? 'success' : 'warning'} label={member.salaryConfigured ? 'CONFIGURED' : 'MISSING'} /></TableCell><TableCell><Button size="small" onClick={() => openProfile(member.uid)}>VIEW</Button></TableCell></TableRow>)}</TableBody></Table></Paper></Grid></Grid>}

                    {tab === 3 && isHRManager && <Grid container spacing={3}><Grid item xs={12} lg={5}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', borderRadius: 4 }}><Stack direction="row" spacing={1}><FileText size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight={950}>Private HR document registry</Typography></Stack><Alert severity="info" sx={{ mt: 2 }}>File bytes remain in the protected <b>privateHrDocuments/&lt;uid&gt;/</b> boundary. This form records auditable metadata only.</Alert><Stack spacing={2} sx={{ mt: 2 }}><TextField select fullWidth label="Staff" value={documentForm.uid} onChange={(e) => setDocumentForm({ ...documentForm, uid: e.target.value, storagePath: `privateHrDocuments/${e.target.value}/` })}>{staff.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName}</MenuItem>)}</TextField><TextField select fullWidth label="Document type" value={documentForm.documentType} onChange={(e) => setDocumentForm({ ...documentForm, documentType: e.target.value })}>{DOCUMENT_TYPES.map((type) => <MenuItem key={type} value={type}>{type.replace(/_/g, ' ')}</MenuItem>)}</TextField><TextField fullWidth label="Canonical storage path" value={documentForm.storagePath} onChange={(e) => setDocumentForm({ ...documentForm, storagePath: e.target.value })} /><TextField fullWidth label="File name" value={documentForm.fileName} onChange={(e) => setDocumentForm({ ...documentForm, fileName: e.target.value })} /><TextField fullWidth type="date" label="Expiry date" InputLabelProps={{ shrink: true }} value={documentForm.expiryDate} onChange={(e) => setDocumentForm({ ...documentForm, expiryDate: e.target.value })} /><Button variant="contained" onClick={() => void registerDocument()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>REGISTER DOCUMENT</Button></Stack></Paper></Grid><Grid item xs={12} lg={7}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', borderRadius: 4 }}><Typography variant="h6" fontWeight={950}>Document register</Typography><Table size="small"><TableHead><TableRow><TableCell>STAFF</TableCell><TableCell>TYPE</TableCell><TableCell>FILE</TableCell><TableCell>EXPIRY</TableCell></TableRow></TableHead><TableBody>{hrOps.documents.map((entry) => <TableRow key={entry.id}><TableCell>{staffByUid.get(entry.uid)?.displayName || entry.uid}</TableCell><TableCell>{entry.documentType}</TableCell><TableCell>{entry.fileName || 'Protected file'}</TableCell><TableCell>{entry.expiryDate || '—'}</TableCell></TableRow>)}{hrOps.documents.length === 0 && <TableRow><TableCell colSpan={4} align="center">No document metadata registered yet.</TableCell></TableRow>}</TableBody></Table></Paper></Grid></Grid>}

                    {tab === 4 && isProvisioningAdmin && <StaffAccessPage />}
                </Stack>
            </Container>

            <StaffLifecycleDetailsDialog uid={selectedStaffUid} open={Boolean(selectedStaffUid)} onClose={closeProfile} onChanged={loadProtectedHr} />
        </Box>
    );
}
