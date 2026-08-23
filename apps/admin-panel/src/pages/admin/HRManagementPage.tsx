import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Alert, Avatar, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions,
    DialogContent, DialogTitle, Grid, MenuItem, Paper, Stack, Tab, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography, alpha,
} from '@mui/material';
import { CalendarDays, DollarSign, FileText, RefreshCw, Search, ShieldAlert, UserPlus } from 'lucide-react';
import { collection, db, functions, httpsCallable, onSnapshot, query } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { useAuth } from '../../context/AuthContext';
import StaffAccessPage from './StaffAccessPage';

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
    onboardingComplete: boolean;
};

type HrOps = { attendance: any[]; leaveRequests: any[]; documents: any[] };

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'ON_LEAVE', 'SICK_LEAVE', 'REMOTE', 'OFF_DAY'];
const LEAVE_TYPES = ['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'COMPASSIONATE', 'OTHER'];
const DOCUMENT_TYPES = ['EMPLOYMENT_CONTRACT', 'EMIRATES_ID', 'PASSPORT', 'VISA', 'CERTIFICATE', 'DRIVING_LICENCE', 'WARNING_LETTER', 'MEDICAL_INSURANCE', 'OTHER'];

function errorText(error: any) {
    return String(error?.details || error?.message || error?.code || 'HR operation failed.').replace(/^FirebaseError:\s*/i, '').slice(0, 300);
}

function lifecycleColor(state: string) {
    if (state === 'ACTIVE') return 'success';
    if (state === 'SUSPENDED') return 'error';
    if (state === 'INVITED') return 'warning';
    return 'info';
}

export default function HRManagementPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState(0);
    const [staff, setStaff] = useState<StaffLifecycle[]>([]);
    const [hrOps, setHrOps] = useState<HrOps>({ attendance: [], leaveRequests: [], documents: [] });
    const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const [attendanceForm, setAttendanceForm] = useState({ uid: '', workDate: new Date().toISOString().slice(0, 10), status: 'PRESENT', checkIn: '', checkOut: '', note: '' });
    const [leaveForm, setLeaveForm] = useState({ uid: '', leaveType: 'ANNUAL', startDate: '', endDate: '', reason: '' });
    const [documentForm, setDocumentForm] = useState({ uid: '', documentType: 'EMPLOYMENT_CONTRACT', storagePath: '', fileName: '', expiryDate: '' });
    const [offboardTarget, setOffboardTarget] = useState<StaffLifecycle | null>(null);
    const [offboardReason, setOffboardReason] = useState('');

    const privilegedHRRoles = new Set(['super_admin', 'admin', 'ceo', 'hr_admin', 'hr_manager']);
    const isHRManager = Boolean(user?.claims?.admin === true || user?.isAdmin === true || privilegedHRRoles.has(String(user?.role)));
    const isHRStaff = Boolean(isHRManager || user?.role === 'hr_staff');

    const loadProtectedHr = useCallback(async () => {
        setRefreshing(true);
        setNotice(null);
        try {
            const getLifecycle = httpsCallable(functions, 'adminGetStaffLifecycle');
            const lifecycleResponse: any = await getLifecycle({});
            const rows = Array.isArray(lifecycleResponse.data?.staff) ? lifecycleResponse.data.staff : [];
            setStaff(rows);
            if (isHRManager) {
                const getOps = httpsCallable(functions, 'adminGetHrOperations');
                const opsResponse: any = await getOps({});
                setHrOps({
                    attendance: Array.isArray(opsResponse.data?.attendance) ? opsResponse.data.attendance : [],
                    leaveRequests: Array.isArray(opsResponse.data?.leaveRequests) ? opsResponse.data.leaveRequests : [],
                    documents: Array.isArray(opsResponse.data?.documents) ? opsResponse.data.documents : [],
                });
            }
        } catch (error) {
            setNotice({ type: 'error', message: `HR Command could not load protected lifecycle data: ${errorText(error)}` });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [isHRManager]);

    useEffect(() => { void loadProtectedHr(); }, [loadProtectedHr]);

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, 'payroll')), (snap) => {
            setPayrollRecords(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        }, (error) => setNotice({ type: 'error', message: `Payroll ledger sync failed: ${errorText(error)}` }));
        return unsub;
    }, []);

    useEffect(() => {
        if (!attendanceForm.uid && staff[0]?.uid) setAttendanceForm((v) => ({ ...v, uid: staff[0].uid }));
        if (!leaveForm.uid && staff[0]?.uid) setLeaveForm((v) => ({ ...v, uid: staff[0].uid }));
        if (!documentForm.uid && staff[0]?.uid) setDocumentForm((v) => ({ ...v, uid: staff[0].uid }));
    }, [staff, attendanceForm.uid, leaveForm.uid, documentForm.uid]);

    const filteredStaff = useMemo(() => staff.filter((member) => {
        const haystack = [member.displayName, member.email, member.role, member.specialization, member.department, member.lifecycleState].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(searchTerm.trim().toLowerCase());
    }), [staff, searchTerm]);

    const staffByUid = useMemo(() => new Map(staff.map((member) => [member.uid, member])), [staff]);
    const activeCount = staff.filter((member) => member.lifecycleState === 'ACTIVE').length;
    const invitationCount = staff.filter((member) => member.lifecycleState === 'INVITED').length;
    const incompleteCount = staff.filter((member) => !member.onboardingComplete && member.lifecycleState !== 'SUSPENDED').length;
    const suspendedCount = staff.filter((member) => member.lifecycleState === 'SUSPENDED').length;

    const treasuryLogsByMonth = Object.values(payrollRecords.reduce((acc: Record<string, { month: string; total: number; allPaid: boolean }>, rec: any) => {
        const key = rec.month || 'UNKNOWN';
        if (!acc[key]) acc[key] = { month: key, total: 0, allPaid: true };
        acc[key].total += Number(rec.amount) || 0;
        if (String(rec.status).toLowerCase() !== 'paid') acc[key].allPaid = false;
        return acc;
    }, {})).sort((a: any, b: any) => b.month.localeCompare(a.month)).slice(0, 8) as any[];

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

    const resendInvitation = async (member: StaffLifecycle) => run('adminResendStaffInvitation', { uid: member.uid }, `Secure invitation queued again for ${member.displayName}.`);
    const recordAttendance = async () => run('adminRecordStaffAttendance', attendanceForm, 'Attendance record saved and audited.');
    const createLeave = async () => run('adminCreateStaffLeaveRequest', leaveForm, 'Leave request created in the HR workflow.');
    const reviewLeave = async (requestId: string, decision: string) => run('adminReviewStaffLeaveRequest', { requestId, decision }, `Leave request ${decision.toLowerCase()}.`);
    const registerDocument = async () => run('adminRegisterHrDocumentMetadata', documentForm, 'Private HR document metadata registered.');
    const confirmOffboard = async () => {
        if (!offboardTarget) return;
        await run('adminOffboardStaff', { uid: offboardTarget.uid, reason: offboardReason || 'Administrative offboarding' }, `${offboardTarget.displayName} suspended, tokens revoked, and records preserved.`);
        setOffboardTarget(null);
        setOffboardReason('');
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
                            <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.58)', maxWidth: 900 }}>
                                One protected staff lifecycle: provisioning, invitation, HR profile, attendance, leave, documents, payroll handoff and offboarding.
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1.5}>
                            <Button startIcon={<RefreshCw size={17} />} onClick={() => void loadProtectedHr()} disabled={refreshing} sx={{ color: '#fff' }}>REFRESH</Button>
                            {isHRManager && <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={() => setTab(4)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>REGISTER STAFF</Button>}
                        </Stack>
                    </Box>

                    {notice && <Alert severity={notice.type}>{notice.message}</Alert>}

                    <Grid container spacing={2}>
                        {[
                            ['ACTIVE', activeCount, '#10b981'],
                            ['INVITED', invitationCount, '#f59e0b'],
                            ['ONBOARDING INCOMPLETE', incompleteCount, '#38bdf8'],
                            ['SUSPENDED / OFFBOARDED', suspendedCount, '#ef4444'],
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
                        <Tab label="ATTENDANCE & LEAVE" disabled={!isHRStaff} />
                        <Tab label="PAYROLL HUB" disabled={!isHRManager} />
                        <Tab label="HR DOCUMENTS" disabled={!isHRManager} />
                        <Tab label="STAFF ACCESS" disabled={!isHRManager} />
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
                                                <TableCell>
                                                    <Stack direction="row" spacing={1.5} alignItems="center"><Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, .15), color: binThemeTokens.gold }}>{(member.displayName || '?')[0]}</Avatar><Box><Typography sx={{ color: '#fff', fontWeight: 900 }}>{member.displayName}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>{member.email}</Typography></Box></Stack>
                                                </TableCell>
                                                <TableCell><Typography sx={{ color: '#fff', fontWeight: 800 }}>{member.role.replace(/_/g, ' ').toUpperCase()}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>{member.department || '—'} · {member.specialization || '—'}</Typography></TableCell>
                                                <TableCell><Stack spacing={.5}><Chip size="small" color={lifecycleColor(member.lifecycleState) as any} label={member.lifecycleState.replace(/_/g, ' ')} sx={{ width: 'fit-content', fontWeight: 900 }} /><Typography variant="caption" sx={{ color: member.emailVerified ? '#10b981' : '#f59e0b' }}>{member.emailVerified ? 'Email verified' : 'Email not verified'}</Typography></Stack></TableCell>
                                                <TableCell><Stack direction="row" spacing={.5} flexWrap="wrap"><Chip size="small" label={member.employeeIdConfigured ? 'EMP ID ✓' : 'EMP ID !'} /><Chip size="small" label={member.emiratesIdConfigured ? 'EID ✓' : 'EID !'} /><Chip size="small" label={member.salaryConfigured ? 'SALARY ✓' : 'SALARY !'} /></Stack></TableCell>
                                                <TableCell><Typography sx={{ color: '#fff' }}>{member.shiftName || 'Unassigned'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>{member.workingHours || 'No working hours'} · {member.offDay || 'No off day'}</Typography></TableCell>
                                                <TableCell>
                                                    <Stack direction="row" spacing={1} flexWrap="wrap">
                                                        {!member.emailVerified && member.lifecycleState !== 'SUSPENDED' && <Button size="small" onClick={() => void resendInvitation(member)}>RESEND INVITE</Button>}
                                                        <Button size="small" onClick={() => { setTab(4); }}>ACCESS</Button>
                                                        {member.lifecycleState !== 'SUSPENDED' && <Button size="small" color="error" onClick={() => setOffboardTarget(member)}>OFFBOARD</Button>}
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )}

                    {tab === 1 && isHRStaff && (
                        <Grid container spacing={3}>
                            <Grid item xs={12} lg={6}>
                                <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 }}>
                                    <Stack direction="row" spacing={1} alignItems="center"><CalendarDays size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight={950}>Attendance</Typography></Stack>
                                    <Grid container spacing={2} sx={{ mt: 1 }}>
                                        <Grid item xs={12}><TextField select fullWidth label="Staff" value={attendanceForm.uid} onChange={(e) => setAttendanceForm({ ...attendanceForm, uid: e.target.value })}>{staff.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName} · {member.role}</MenuItem>)}</TextField></Grid>
                                        <Grid item xs={6}><TextField fullWidth type="date" label="Work date" InputLabelProps={{ shrink: true }} value={attendanceForm.workDate} onChange={(e) => setAttendanceForm({ ...attendanceForm, workDate: e.target.value })} /></Grid>
                                        <Grid item xs={6}><TextField select fullWidth label="Status" value={attendanceForm.status} onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })}>{ATTENDANCE_STATUSES.map((status) => <MenuItem key={status} value={status}>{status.replace(/_/g, ' ')}</MenuItem>)}</TextField></Grid>
                                        <Grid item xs={6}><TextField fullWidth label="Check in" placeholder="09:00" value={attendanceForm.checkIn} onChange={(e) => setAttendanceForm({ ...attendanceForm, checkIn: e.target.value })} /></Grid>
                                        <Grid item xs={6}><TextField fullWidth label="Check out" placeholder="18:00" value={attendanceForm.checkOut} onChange={(e) => setAttendanceForm({ ...attendanceForm, checkOut: e.target.value })} /></Grid>
                                        <Grid item xs={12}><TextField fullWidth label="Note" value={attendanceForm.note} onChange={(e) => setAttendanceForm({ ...attendanceForm, note: e.target.value })} /></Grid>
                                        <Grid item xs={12}><Button variant="contained" onClick={() => void recordAttendance()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>SAVE ATTENDANCE</Button></Grid>
                                    </Grid>
                                    <Stack spacing={1} sx={{ mt: 3 }}>{hrOps.attendance.slice(0, 8).map((entry) => <Paper key={entry.id} sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,.03)' }}><Typography sx={{ color: '#fff', fontWeight: 800 }}>{staffByUid.get(entry.uid)?.displayName || entry.uid}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.5)' }}>{entry.workDate} · {entry.status} · {entry.checkIn || '—'}–{entry.checkOut || '—'}</Typography></Paper>)}</Stack>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} lg={6}>
                                <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 }}>
                                    <Typography variant="h6" fontWeight={950}>Leave workflow</Typography>
                                    <Grid container spacing={2} sx={{ mt: 1 }}>
                                        <Grid item xs={12}><TextField select fullWidth label="Staff" value={leaveForm.uid} onChange={(e) => setLeaveForm({ ...leaveForm, uid: e.target.value })}>{staff.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName} · {member.role}</MenuItem>)}</TextField></Grid>
                                        <Grid item xs={12}><TextField select fullWidth label="Leave type" value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}>{LEAVE_TYPES.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}</TextField></Grid>
                                        <Grid item xs={6}><TextField fullWidth type="date" label="Start" InputLabelProps={{ shrink: true }} value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} /></Grid>
                                        <Grid item xs={6}><TextField fullWidth type="date" label="End" InputLabelProps={{ shrink: true }} value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} /></Grid>
                                        <Grid item xs={12}><TextField fullWidth label="Reason" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></Grid>
                                        <Grid item xs={12}><Button variant="contained" onClick={() => void createLeave()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>CREATE LEAVE REQUEST</Button></Grid>
                                    </Grid>
                                    <Stack spacing={1} sx={{ mt: 3 }}>{hrOps.leaveRequests.slice(0, 8).map((entry) => <Paper key={entry.id} sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,.03)' }}><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography sx={{ color: '#fff', fontWeight: 800 }}>{staffByUid.get(entry.uid)?.displayName || entry.uid}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.5)' }}>{entry.leaveType} · {entry.startDate} → {entry.endDate} · {entry.status}</Typography></Box>{entry.status === 'PENDING' && <Stack direction="row" spacing={.5}><Button size="small" color="success" onClick={() => void reviewLeave(entry.id, 'APPROVED')}>APPROVE</Button><Button size="small" color="error" onClick={() => void reviewLeave(entry.id, 'REJECTED')}>REJECT</Button></Stack>}</Stack></Paper>)}</Stack>
                                </Paper>
                            </Grid>
                        </Grid>
                    )}

                    {tab === 2 && isHRManager && (
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={4}><Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, .06), border: `1px solid ${alpha(binThemeTokens.gold, .35)}`, borderRadius: 4, textAlign: 'center' }}><DollarSign size={44} color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950} sx={{ mt: 1 }}>PAYROLL HUB</Typography><Typography sx={{ color: 'rgba(255,255,255,.55)', my: 2 }}>{staff.filter((s) => s.salaryConfigured).length} staff with salary configuration</Typography><Button fullWidth variant="contained" onClick={() => navigate('/financials/payroll')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>OPEN PAYROLL</Button></Paper></Grid>
                            <Grid item xs={12} md={8}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', borderRadius: 4 }}><Typography variant="h6" fontWeight={950}>Treasury logs</Typography><Table size="small"><TableHead><TableRow><TableCell>MONTH</TableCell><TableCell>GROSS</TableCell><TableCell>STATUS</TableCell></TableRow></TableHead><TableBody>{treasuryLogsByMonth.map((log) => <TableRow key={log.month}><TableCell>{log.month}</TableCell><TableCell>AED {log.total.toLocaleString('en-AE')}</TableCell><TableCell><Chip size="small" color={log.allPaid ? 'success' : 'warning'} label={log.allPaid ? 'SETTLED' : 'PENDING'} /></TableCell></TableRow>)}{treasuryLogsByMonth.length === 0 && <TableRow><TableCell colSpan={3} align="center">No payroll runs recorded.</TableCell></TableRow>}</TableBody></Table></Paper></Grid>
                        </Grid>
                    )}

                    {tab === 3 && isHRManager && (
                        <Grid container spacing={3}>
                            <Grid item xs={12} lg={5}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', borderRadius: 4 }}><Stack direction="row" spacing={1}><FileText size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight={950}>Private HR document registry</Typography></Stack><Alert severity="info" sx={{ mt: 2 }}>File bytes remain in the protected <b>privateHrDocuments/&lt;uid&gt;/</b> storage boundary. This screen records auditable metadata only.</Alert><Stack spacing={2} sx={{ mt: 2 }}><TextField select fullWidth label="Staff" value={documentForm.uid} onChange={(e) => setDocumentForm({ ...documentForm, uid: e.target.value, storagePath: `privateHrDocuments/${e.target.value}/` })}>{staff.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName}</MenuItem>)}</TextField><TextField select fullWidth label="Document type" value={documentForm.documentType} onChange={(e) => setDocumentForm({ ...documentForm, documentType: e.target.value })}>{DOCUMENT_TYPES.map((type) => <MenuItem key={type} value={type}>{type.replace(/_/g, ' ')}</MenuItem>)}</TextField><TextField fullWidth label="Canonical storage path" value={documentForm.storagePath} onChange={(e) => setDocumentForm({ ...documentForm, storagePath: e.target.value })} helperText="Must begin with privateHrDocuments/<staff uid>/" /><TextField fullWidth label="File name" value={documentForm.fileName} onChange={(e) => setDocumentForm({ ...documentForm, fileName: e.target.value })} /><TextField fullWidth type="date" label="Expiry date" InputLabelProps={{ shrink: true }} value={documentForm.expiryDate} onChange={(e) => setDocumentForm({ ...documentForm, expiryDate: e.target.value })} /><Button variant="contained" onClick={() => void registerDocument()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>REGISTER DOCUMENT</Button></Stack></Paper></Grid>
                            <Grid item xs={12} lg={7}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', borderRadius: 4 }}><Typography variant="h6" fontWeight={950}>Document register</Typography><Table size="small"><TableHead><TableRow><TableCell>STAFF</TableCell><TableCell>TYPE</TableCell><TableCell>FILE</TableCell><TableCell>EXPIRY</TableCell></TableRow></TableHead><TableBody>{hrOps.documents.map((entry) => <TableRow key={entry.id}><TableCell>{staffByUid.get(entry.uid)?.displayName || entry.uid}</TableCell><TableCell>{entry.documentType}</TableCell><TableCell>{entry.fileName || 'Protected file'}</TableCell><TableCell>{entry.expiryDate || '—'}</TableCell></TableRow>)}{hrOps.documents.length === 0 && <TableRow><TableCell colSpan={4} align="center">No document metadata registered yet.</TableCell></TableRow>}</TableBody></Table></Paper></Grid>
                        </Grid>
                    )}

                    {tab === 4 && isHRManager && <StaffAccessPage />}
                </Stack>
            </Container>

            <Dialog open={Boolean(offboardTarget)} onClose={() => setOffboardTarget(null)} fullWidth maxWidth="sm">
                <DialogTitle><Stack direction="row" spacing={1} alignItems="center"><ShieldAlert size={20} color="#ef4444" /> <span>Offboard staff safely</span></Stack></DialogTitle>
                <DialogContent><Typography sx={{ mb: 2 }}>This will disable Firebase Auth, revoke refresh tokens, suspend access, preserve HR/payroll/job history and write an audit record.</Typography><TextField fullWidth label="Reason" value={offboardReason} onChange={(e) => setOffboardReason(e.target.value)} /></DialogContent>
                <DialogActions><Button onClick={() => setOffboardTarget(null)}>CANCEL</Button><Button color="error" variant="contained" onClick={() => void confirmOffboard()}>SUSPEND & OFFBOARD</Button></DialogActions>
            </Dialog>
        </Box>
    );
}
