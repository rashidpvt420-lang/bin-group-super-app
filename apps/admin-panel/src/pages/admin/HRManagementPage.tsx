import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Alert, Avatar, Box, Button, Checkbox, Chip, CircularProgress, Container, Dialog, DialogActions,
    DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, Grid, IconButton, InputAdornment,
    InputLabel, MenuItem, Paper, Select, Stack, Tab, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Tabs, TextField, Tooltip, Typography, alpha,
} from '@mui/material';
import {
    CalendarCheck, ChevronRight, FileText, Mail, RefreshCw, Search as SearchIcon, ShieldCheck,
    UserPlus, UserX,
} from 'lucide-react';
import {
    functions, getDownloadURL, httpsCallable, ref, storage, uploadBytes,
} from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { useAuth } from '../../context/AuthContext';
import StaffAccessPage from './StaffAccessPage';
import { PROVISIONABLE_STAFF_ROLES } from '../../security/staffAccessPolicy';

type Snapshot = {
    generatedAt?: string;
    privateFieldsIncluded?: boolean;
    staff: any[];
    leaves: any[];
    documents: any[];
    shifts: any[];
    adjustments: any[];
    payroll: any[];
    summary: { totalStaff: number; activeStaff: number; pendingInvitations: number; documentsExpiring: number; pendingLeave: number; absentToday: number; payrollPending: number };
};

const emptySnapshot: Snapshot = {
    staff: [], leaves: [], documents: [], shifts: [], adjustments: [], payroll: [],
    summary: { totalStaff: 0, activeStaff: 0, pendingInvitations: 0, documentsExpiring: 0, pendingLeave: 0, absentToday: 0, payrollPending: 0 },
};

const DOCUMENT_TYPES = [
    ['employment_contract', 'Employment Contract'], ['emirates_id', 'Emirates ID'], ['passport', 'Passport'],
    ['visa', 'Visa'], ['certificate', 'Certificate'], ['driving_licence', 'Driving Licence'],
    ['warning_letter', 'Warning Letter'], ['leave_evidence', 'Leave / Sick Evidence'], ['insurance', 'Insurance'], ['other', 'Other'],
];
const ATTENDANCE_ACTIONS = ['PRESENT', 'ABSENT', 'ON_LEAVE', 'SICK_LEAVE', 'EXCUSED', 'SHIFT_EXCEPTION'];

function errorText(error: any) {
    return String(error?.details || error?.message || error?.code || 'HR operation failed.').replace(/^FirebaseError:\s*/i, '').slice(0, 360);
}
function formatDate(value: any) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-AE') : String(value);
}
function invitationColor(status: string) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'DELIVERED') return 'success';
    if (normalized === 'ERROR') return 'error';
    return 'warning';
}
function expiryWarning(value: string | null | undefined) {
    if (!value) return false;
    const delta = new Date(`${value}T00:00:00Z`).getTime() - Date.now();
    return delta >= 0 && delta <= 45 * 86400000;
}

export default function HRManagementPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedRole = searchParams.get('register') || '';
    const [tab, setTab] = useState(requestedRole ? 4 : 0);
    const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [notice, setNotice] = useState<{ error: boolean; message: string } | null>(null);
    const [selectedStaff, setSelectedStaff] = useState<any | null>(null);
    const [profileForm, setProfileForm] = useState<any>({});
    const [profileBusy, setProfileBusy] = useState(false);
    const [attendanceOpen, setAttendanceOpen] = useState(false);
    const [attendanceForm, setAttendanceForm] = useState({ uid: '', date: new Date().toISOString().slice(0, 10), action: 'PRESENT', reason: '' });
    const [documentStaffId, setDocumentStaffId] = useState('');
    const [documentType, setDocumentType] = useState('employment_contract');
    const [documentExpiry, setDocumentExpiry] = useState('');
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [documentBusy, setDocumentBusy] = useState(false);
    const [registrationSequence, setRegistrationSequence] = useState(0);

    const privilegedHRRoles = new Set(['super_admin', 'admin', 'ceo', 'hr_admin', 'hr_manager']);
    const isHRManager = Boolean(user?.claims?.admin === true || user?.isAdmin === true || privilegedHRRoles.has(String(user?.role)));
    const isHRStaff = Boolean(isHRManager || user?.role === 'hr_staff');

    const loadSnapshot = useCallback(async (quiet = false) => {
        if (!isHRStaff) { setLoading(false); return; }
        if (quiet) setRefreshing(true); else setLoading(true);
        try {
            const response: any = await httpsCallable(functions, 'adminGetHrCommandSnapshot')({});
            setSnapshot({ ...emptySnapshot, ...(response.data || {}) });
            setNotice(null);
        } catch (error) {
            setNotice({ error: true, message: `HR command sync failed: ${errorText(error)}` });
        } finally {
            setLoading(false); setRefreshing(false);
        }
    }, [isHRStaff]);

    useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);
    useEffect(() => {
        if (requestedRole && isHRManager) {
            setTab(4);
            setRegistrationSequence((value) => value + 1);
        }
    }, [requestedRole, isHRManager]);

    const filteredStaff = useMemo(() => snapshot.staff.filter((member) => {
        const haystack = [member.displayName, member.email, member.role, member.specialization, member.department, member.employeeId]
            .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(searchTerm.trim().toLowerCase());
    }), [snapshot.staff, searchTerm]);

    const staffById = useMemo(() => new Map(snapshot.staff.map((member) => [member.id, member])), [snapshot.staff]);
    const payrollByStaff = useMemo(() => {
        const map = new Map<string, any[]>();
        snapshot.payroll.forEach((record) => {
            const uid = String(record.staffId || record.uid || record.employeeId || '');
            if (!uid) return;
            map.set(uid, [...(map.get(uid) || []), record]);
        });
        return map;
    }, [snapshot.payroll]);

    const openRegister = (role = 'support_admin') => {
        const safeRole = PROVISIONABLE_STAFF_ROLES.includes(role as any) ? role : 'support_admin';
        setSearchParams({ register: safeRole });
        setTab(4);
        setRegistrationSequence((value) => value + 1);
    };

    const openStaffProfile = (member: any) => {
        setSelectedStaff(member);
        const salary = member.salaryPackage || {};
        setProfileForm({
            displayName: member.displayName || '', phoneNumber: member.phoneNumber || '', employeeId: member.employeeId || '',
            department: member.department || '', jobTitle: member.jobTitle || '', specialization: member.specialization || '',
            joiningDate: member.joiningDate || '', contractEndDate: member.contractEndDate || '', visaExpiryDate: member.visaExpiryDate || '',
            emiratesId: member.emiratesId || '', passportNumber: member.passportNumber || '', salaryGrade: member.salaryGrade || '',
            basicSalary: salary.basicSalary ?? '', housingAllowance: salary.housingAllowance ?? '', transportAllowance: salary.transportAllowance ?? '',
            foodAllowance: salary.foodAllowance ?? '', otherAllowance: salary.otherAllowance ?? '', salaryPaymentDay: salary.salaryPaymentDay ?? 1,
            overtimeEligible: salary.overtimeEligible !== false, companyAccommodationProvided: Boolean(salary.companyAccommodationProvided),
            companyTransportProvided: Boolean(salary.companyTransportProvided), companyMedicalInsuranceProvided: salary.companyMedicalInsuranceProvided !== false,
            profileComplete: member.onboardingChecklist?.profileComplete === true,
            documentsComplete: member.onboardingChecklist?.documentsComplete === true,
            contractComplete: member.onboardingChecklist?.contractComplete === true,
            deviceReady: member.role === 'technician' ? member.onboardingChecklist?.deviceReady === true : true,
            activationApproved: member.onboardingChecklist?.activationApproved === true,
        });
    };

    const saveStaffProfile = async () => {
        if (!selectedStaff) return;
        setProfileBusy(true);
        try {
            await httpsCallable(functions, 'adminUpdateStaffProfile')({ uid: selectedStaff.id, ...profileForm });
            setNotice({ error: false, message: `${selectedStaff.displayName} profile updated through the protected HR lifecycle.` });
            await loadSnapshot(true);
        } catch (error) { setNotice({ error: true, message: `Profile update blocked: ${errorText(error)}` }); }
        finally { setProfileBusy(false); }
    };

    const saveOnboarding = async () => {
        if (!selectedStaff) return;
        setProfileBusy(true);
        try {
            const response: any = await httpsCallable(functions, 'adminUpdateStaffOnboarding')({
                uid: selectedStaff.id,
                profileComplete: profileForm.profileComplete,
                documentsComplete: profileForm.documentsComplete,
                contractComplete: profileForm.contractComplete,
                deviceReady: profileForm.deviceReady,
                activationApproved: profileForm.activationApproved,
            });
            setNotice({ error: false, message: `${selectedStaff.displayName} onboarding is now ${response.data?.stage || 'updated'}.` });
            await loadSnapshot(true);
            setSelectedStaff(null);
        } catch (error) { setNotice({ error: true, message: `Onboarding update blocked: ${errorText(error)}` }); }
        finally { setProfileBusy(false); }
    };

    const resendInvitation = async (member: any) => {
        try {
            await httpsCallable(functions, 'adminResendStaffInvitation')({ uid: member.id });
            setNotice({ error: false, message: `Secure invitation re-queued for ${member.displayName}.` });
            await loadSnapshot(true);
        } catch (error) { setNotice({ error: true, message: `Invitation resend failed: ${errorText(error)}` }); }
    };

    const offboardStaff = async (member: any) => {
        const reason = window.prompt(`Offboarding reason for ${member.displayName}:`);
        if (!reason?.trim() || !window.confirm(`Offboard ${member.displayName}? Auth will be disabled, tokens revoked and records archived.`)) return;
        try {
            await httpsCallable(functions, 'adminOffboardStaff')({ uid: member.id, reason: reason.trim() });
            setNotice({ error: false, message: `${member.displayName} offboarded and archived. Historical HR/payroll/attendance records were preserved.` });
            await loadSnapshot(true);
        } catch (error) { setNotice({ error: true, message: `Offboarding blocked: ${errorText(error)}` }); }
    };

    const resolveLeave = async (leave: any, decision: 'APPROVED' | 'REJECTED') => {
        const note = window.prompt(`${decision === 'APPROVED' ? 'Approval' : 'Rejection'} note (optional):`) || '';
        try {
            await httpsCallable(functions, 'adminResolveStaffLeaveRequest')({ requestId: leave.id || leave.requestId, decision, note });
            setNotice({ error: false, message: `Leave request ${decision.toLowerCase()}.` });
            await loadSnapshot(true);
        } catch (error) { setNotice({ error: true, message: `Leave decision failed: ${errorText(error)}` }); }
    };

    const recordAttendance = async () => {
        if (!attendanceForm.uid || !attendanceForm.reason.trim()) { setNotice({ error: true, message: 'Staff, date and attendance reason are required.' }); return; }
        try {
            await httpsCallable(functions, 'adminRecordAttendanceAdjustment')(attendanceForm);
            setAttendanceOpen(false);
            setNotice({ error: false, message: 'Attendance adjustment recorded and audited.' });
            await loadSnapshot(true);
        } catch (error) { setNotice({ error: true, message: `Attendance update failed: ${errorText(error)}` }); }
    };

    const uploadHrDocument = async () => {
        if (!documentStaffId || !documentFile) { setNotice({ error: true, message: 'Choose a staff member and document file.' }); return; }
        if (!isHRManager) { setNotice({ error: true, message: 'HR Manager/Admin authority is required to add authoritative HR documents.' }); return; }
        setDocumentBusy(true);
        try {
            const safeName = documentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `hrDocuments/${documentStaffId}/${Date.now()}-${safeName}`;
            const fileRef = ref(storage, path);
            await uploadBytes(fileRef, documentFile, {
                contentType: documentFile.type || 'application/pdf',
                customMetadata: { staffId: documentStaffId, documentType },
            });
            await httpsCallable(functions, 'adminRegisterHrDocument')({
                uid: documentStaffId, storagePath: path, documentType, fileName: documentFile.name,
                contentType: documentFile.type || 'application/pdf', expiresOn: documentExpiry || null,
            });
            setDocumentFile(null); setDocumentExpiry('');
            const input = document.getElementById('hr-document-file') as HTMLInputElement | null;
            if (input) input.value = '';
            setNotice({ error: false, message: 'HR document uploaded to the staff-scoped vault and registered for expiry tracking.' });
            await loadSnapshot(true);
        } catch (error) { setNotice({ error: true, message: `HR document upload failed: ${errorText(error)}` }); }
        finally { setDocumentBusy(false); }
    };

    const openDocument = async (record: any) => {
        try {
            const url = await getDownloadURL(ref(storage, record.storagePath));
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (error) { setNotice({ error: true, message: `Unable to open document: ${errorText(error)}` }); }
    };

    if (!isHRStaff) return <Container sx={{ py: 8 }}><Alert severity="error">HR Command requires an authorized HR or Admin role.</Alert></Container>;
    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4 }} data-testid="admin-staff-access-route">
            <Container maxWidth="xl">
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 4 }}>
                    <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>SOVEREIGN HUMAN CAPITAL</Typography><Typography variant="h3" fontWeight={950} color="#fff">HR <Box component="span" sx={{ color: binThemeTokens.gold }}>Command</Box></Typography><Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.58)', maxWidth: 820 }}>One staff lifecycle: identity → invitation → profile → documents → contract → device readiness → activation → attendance/leave → payroll/KPI → suspension/offboarding/audit.</Typography></Box>
                    <Stack direction="row" spacing={1}><Button startIcon={<RefreshCw size={17} />} onClick={() => loadSnapshot(true)} disabled={refreshing}>{refreshing ? 'SYNCING' : 'REFRESH'}</Button>{isHRManager && <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={() => openRegister()} data-testid="admin-open-secure-staff-access" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>REGISTER STAFF</Button>}</Stack>
                </Stack>

                {notice && <Alert severity={notice.error ? 'error' : 'success'} onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice.message}</Alert>}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {[
                        ['Total staff', snapshot.summary.totalStaff], ['Active', snapshot.summary.activeStaff], ['Pending invitations', snapshot.summary.pendingInvitations],
                        ['Documents expiring ≤45d', snapshot.summary.documentsExpiring], ['Leave approvals', snapshot.summary.pendingLeave],
                        ['Absent today', snapshot.summary.absentToday], ['Payroll pending', snapshot.summary.payrollPending],
                    ].map(([label, value]) => <Grid item xs={6} sm={4} md key={String(label)}><Paper sx={{ p: 2, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" fontWeight={950} color="#fff">{value as any}</Typography></Paper></Grid>)}
                </Grid>

                <Tabs value={tab} onChange={(_, value) => { setTab(value); if (value !== 4 && requestedRole) setSearchParams({}); }} variant="scrollable" sx={{ mb: 4, '& .MuiTab-root': { color: 'rgba(255,255,255,0.45)', fontWeight: 900 } }}>
                    <Tab label="STAFF REGISTRY" /><Tab label="ATTENDANCE & LEAVE" /><Tab label="PAYROLL / KPI" disabled={!isHRManager} /><Tab label="HR DOCUMENTS" /><Tab label="STAFF ACCESS" disabled={!isHRManager} />
                </Tabs>

                {tab === 0 && <Paper sx={{ borderRadius: 4, bgcolor: 'rgba(22,22,24,0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}><TextField placeholder="Search name, email, role, department, employee ID..." size="small" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon size={18} /></InputAdornment> }} sx={{ minWidth: { md: 480 } }} /><Chip label={`${filteredStaff.length} PERSONNEL`} /></Stack>
                    <TableContainer><Table><TableHead><TableRow>{['PERSONNEL', 'ROLE / DEPARTMENT', 'ONBOARDING / INVITE', 'EXPIRY', 'KPI', 'ACTIONS'].map((label) => <TableCell key={label} align={label === 'ACTIONS' ? 'right' : 'left'} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
                        {filteredStaff.map((member) => <TableRow key={member.id} hover><TableCell><Stack direction="row" spacing={2} alignItems="center"><Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.2), color: binThemeTokens.gold }}>{String(member.displayName || '?').charAt(0).toUpperCase()}</Avatar><Box><Typography variant="body2" fontWeight={900} color="#fff">{member.displayName}</Typography><Typography variant="caption" color="text.secondary">{member.email}{member.employeeId ? ` · ${member.employeeId}` : ''}</Typography></Box></Stack></TableCell><TableCell><Typography variant="body2" fontWeight={800} color="#fff">{String(member.role || '').replace(/_/g, ' ').toUpperCase()}</Typography><Typography variant="caption" color="text.secondary">{member.department || member.specialization || '—'}</Typography></TableCell><TableCell><Stack spacing={0.5} alignItems="flex-start"><Chip size="small" label={String(member.onboardingStage || 'INVITED').replace(/_/g, ' ')} color={member.onboardingStage === 'ACTIVE' ? 'success' : 'warning'} /><Chip size="small" variant="outlined" label={`MAIL ${member.invitationStatus || 'QUEUED'}`} color={invitationColor(member.invitationStatus) as any} /></Stack></TableCell><TableCell><Stack spacing={0.4}><Typography variant="caption" color={expiryWarning(member.contractEndDate) ? 'warning.main' : 'text.secondary'}>Contract: {member.contractEndDate || '—'}</Typography>{snapshot.privateFieldsIncluded && <Typography variant="caption" color={expiryWarning(member.visaExpiryDate) ? 'warning.main' : 'text.secondary'}>Visa: {member.visaExpiryDate || '—'}</Typography>}</Stack></TableCell><TableCell><Typography variant="body2" fontWeight={900} color={member.performanceScore != null ? '#10b981' : 'text.secondary'}>{member.performanceScore != null ? `${member.performanceScore}%` : 'N/A'}</Typography></TableCell><TableCell align="right"><Stack direction="row" spacing={0.5} justifyContent="flex-end"><Tooltip title="Open staff profile"><IconButton onClick={() => openStaffProfile(member)}><ChevronRight size={18} /></IconButton></Tooltip>{isHRManager && <><Tooltip title="Resend invitation"><IconButton onClick={() => resendInvitation(member)}><Mail size={17} /></IconButton></Tooltip><Tooltip title="Offboard"><IconButton color="error" onClick={() => offboardStaff(member)}><UserX size={17} /></IconButton></Tooltip></>}</Stack></TableCell></TableRow>)}
                        {filteredStaff.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>No staff matched this filter. The registry covers all 13 provisionable staff roles.</TableCell></TableRow>}
                    </TableBody></Table></TableContainer>
                </Paper>}

                {tab === 1 && <Stack spacing={3}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}><Box><Typography variant="h6" fontWeight={900}>Attendance ledger</Typography><Typography variant="body2" color="text.secondary">Clock-in/out comes from the server-owned staff_shifts ledger. HR adjustments never rewrite raw clock evidence.</Typography></Box>{isHRManager && <Button startIcon={<CalendarCheck size={17} />} variant="contained" onClick={() => setAttendanceOpen(true)}>RECORD EXCEPTION</Button>}</Stack><TableContainer sx={{ mt: 2 }}><Table size="small"><TableHead><TableRow><TableCell>STAFF</TableCell><TableCell>SHIFT DATE</TableCell><TableCell>STATUS</TableCell><TableCell>CLOCK IN</TableCell><TableCell>CLOCK OUT</TableCell></TableRow></TableHead><TableBody>{snapshot.shifts.slice(0, 80).map((shift) => <TableRow key={shift.id}><TableCell>{staffById.get(shift.staffId)?.displayName || shift.staffId}</TableCell><TableCell>{shift.shiftDate || '—'}</TableCell><TableCell><Chip size="small" label={shift.status || 'UNKNOWN'} /></TableCell><TableCell>{shift.clockInTime ? new Date(shift.clockInTime).toLocaleString() : '—'}</TableCell><TableCell>{shift.clockOutTime ? new Date(shift.clockOutTime).toLocaleString() : '—'}</TableCell></TableRow>)}{snapshot.shifts.length === 0 && <TableRow><TableCell colSpan={5} align="center">No recent shift records.</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4 }}><Typography variant="h6" fontWeight={900}>Leave / sick leave approvals</Typography><TableContainer sx={{ mt: 2 }}><Table size="small"><TableHead><TableRow><TableCell>STAFF</TableCell><TableCell>TYPE</TableCell><TableCell>DATES</TableCell><TableCell>REASON</TableCell><TableCell>STATUS</TableCell><TableCell align="right">ACTION</TableCell></TableRow></TableHead><TableBody>{snapshot.leaves.map((leave) => <TableRow key={leave.id}><TableCell>{staffById.get(leave.staffId)?.displayName || leave.staffId}</TableCell><TableCell>{leave.leaveType}</TableCell><TableCell>{leave.startDate} → {leave.endDate} ({leave.totalDays}d)</TableCell><TableCell>{leave.reason}</TableCell><TableCell><Chip size="small" label={leave.status || 'PENDING'} color={leave.status === 'APPROVED' ? 'success' : leave.status === 'REJECTED' ? 'error' : 'warning'} /></TableCell><TableCell align="right">{isHRManager && String(leave.status).toUpperCase() === 'PENDING' && <Stack direction="row" spacing={1} justifyContent="flex-end"><Button size="small" color="success" onClick={() => resolveLeave(leave, 'APPROVED')}>APPROVE</Button><Button size="small" color="error" onClick={() => resolveLeave(leave, 'REJECTED')}>REJECT</Button></Stack>}</TableCell></TableRow>)}{snapshot.leaves.length === 0 && <TableRow><TableCell colSpan={6} align="center">No leave requests.</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>
                </Stack>}

                {tab === 2 && isHRManager && <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4 }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h6" fontWeight={900}>Payroll / KPI handoff</Typography><Typography variant="body2" color="text.secondary">Real payroll ledger records are linked by staff identity; performance score comes from the operational staff record.</Typography></Box><Button onClick={() => navigate('/financials/payroll')}>OPEN PAYROLL ENGINE</Button></Stack><TableContainer sx={{ mt: 2 }}><Table size="small"><TableHead><TableRow><TableCell>STAFF</TableCell><TableCell>ROLE</TableCell><TableCell>KPI</TableCell><TableCell>PAYROLL RECORDS</TableCell><TableCell>PENDING</TableCell></TableRow></TableHead><TableBody>{snapshot.staff.map((member) => { const rows = payrollByStaff.get(member.id) || []; return <TableRow key={member.id}><TableCell>{member.displayName}</TableCell><TableCell>{member.role}</TableCell><TableCell>{member.performanceScore != null ? `${member.performanceScore}%` : 'N/A'}</TableCell><TableCell>{rows.length}</TableCell><TableCell>{rows.filter((row) => !['paid', 'settled'].includes(String(row.status || '').toLowerCase())).length}</TableCell></TableRow>; })}</TableBody></Table></TableContainer></Paper>}

                {tab === 3 && <Stack spacing={3}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4 }}><Typography variant="h6" fontWeight={900}>Private HR document vault</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Files stay under staff-scoped Storage rules. Metadata is registered server-side for document type and expiry tracking.</Typography>{isHRManager ? <Grid container spacing={2} alignItems="center"><Grid item xs={12} md={3}><FormControl fullWidth><InputLabel>Staff</InputLabel><Select label="Staff" value={documentStaffId} onChange={(e) => setDocumentStaffId(String(e.target.value))}>{snapshot.staff.filter((member) => member.status !== 'OFFBOARDED').map((member) => <MenuItem key={member.id} value={member.id}>{member.displayName} · {member.role}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={12} md={2}><FormControl fullWidth><InputLabel>Document type</InputLabel><Select label="Document type" value={documentType} onChange={(e) => setDocumentType(String(e.target.value))}>{DOCUMENT_TYPES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={12} md={2}><TextField fullWidth type="date" label="Expiry (optional)" InputLabelProps={{ shrink: true }} value={documentExpiry} onChange={(e) => setDocumentExpiry(e.target.value)} /></Grid><Grid item xs={12} md={3}><Button component="label" fullWidth variant="outlined"><FileText size={16} style={{ marginRight: 8 }} />{documentFile?.name || 'CHOOSE PDF / IMAGE'}<input id="hr-document-file" hidden type="file" accept="application/pdf,image/*" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} /></Button></Grid><Grid item xs={12} md={2}><Button fullWidth variant="contained" onClick={uploadHrDocument} disabled={documentBusy}>{documentBusy ? <CircularProgress size={18} /> : 'UPLOAD'}</Button></Grid></Grid> : <Alert severity="info">HR Staff can review document records. HR Manager/Admin authority is required to add authoritative HR documents.</Alert>}</Paper>
                    <Paper sx={{ bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4, overflow: 'hidden' }}><TableContainer><Table><TableHead><TableRow><TableCell>STAFF</TableCell><TableCell>TYPE</TableCell><TableCell>FILE</TableCell><TableCell>EXPIRY</TableCell><TableCell>UPLOADED</TableCell><TableCell align="right">OPEN</TableCell></TableRow></TableHead><TableBody>{snapshot.documents.map((record) => <TableRow key={record.id}><TableCell>{staffById.get(record.staffId)?.displayName || record.staffId}</TableCell><TableCell>{String(record.documentType || 'other').replace(/_/g, ' ').toUpperCase()}</TableCell><TableCell>{record.fileName}</TableCell><TableCell><Typography color={expiryWarning(record.expiresOn) ? 'warning.main' : 'inherit'}>{record.expiresOn || '—'}</Typography></TableCell><TableCell>{formatDate(record.uploadedAt)}</TableCell><TableCell align="right"><Button size="small" onClick={() => openDocument(record)}>OPEN</Button></TableCell></TableRow>)}{snapshot.documents.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}>No HR documents registered yet.</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>
                </Stack>}

                {tab === 4 && isHRManager && <StaffAccessPage key={`${requestedRole}-${registrationSequence}`} autoOpen={Boolean(requestedRole || registrationSequence)} showRegisterButton initialRole={requestedRole || 'support_admin'} onCreated={() => { setSearchParams({}); void loadSnapshot(true); }} />}
            </Container>

            <Dialog open={Boolean(selectedStaff)} onClose={() => !profileBusy && setSelectedStaff(null)} fullWidth maxWidth="md" PaperProps={{ sx: { bgcolor: '#08101f', color: '#fff' } }}>
                <DialogTitle><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6" fontWeight={950}>{selectedStaff?.displayName}</Typography><Typography variant="caption" color="text.secondary">{selectedStaff?.role} · {selectedStaff?.email}</Typography></Box><Chip icon={<ShieldCheck size={14} />} label={selectedStaff?.onboardingStage || 'INVITED'} /></Stack></DialogTitle>
                <DialogContent><Grid container spacing={2} sx={{ mt: 0.5 }}><Grid item xs={12} md={6}><TextField fullWidth label="Full name" value={profileForm.displayName || ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, displayName: e.target.value }))} disabled={!isHRManager} /></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Phone" value={profileForm.phoneNumber || ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, phoneNumber: e.target.value }))} disabled={!isHRManager} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Employee ID" value={profileForm.employeeId || ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, employeeId: e.target.value }))} disabled={!isHRManager || !snapshot.privateFieldsIncluded} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Department" value={profileForm.department || ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, department: e.target.value }))} disabled={!isHRManager} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Job title" value={profileForm.jobTitle || ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, jobTitle: e.target.value }))} disabled={!isHRManager} /></Grid><Grid item xs={12} md={4}><TextField fullWidth type="date" label="Joining date" InputLabelProps={{ shrink: true }} value={profileForm.joiningDate || ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, joiningDate: e.target.value }))} disabled={!isHRManager} /></Grid><Grid item xs={12} md={4}><TextField fullWidth type="date" label="Contract expiry" InputLabelProps={{ shrink: true }} value={profileForm.contractEndDate || ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, contractEndDate: e.target.value }))} disabled={!isHRManager} /></Grid><Grid item xs={12} md={4}><TextField fullWidth type="date" label="Visa expiry" InputLabelProps={{ shrink: true }} value={profileForm.visaExpiryDate || ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, visaExpiryDate: e.target.value }))} disabled={!isHRManager || !snapshot.privateFieldsIncluded} /></Grid>{snapshot.privateFieldsIncluded && <><Grid item xs={12} md={4}><TextField fullWidth label="Salary grade" value={profileForm.salaryGrade || ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, salaryGrade: e.target.value }))} disabled={!isHRManager} /></Grid><Grid item xs={12} md={4}><TextField fullWidth type="number" label="Basic salary" value={profileForm.basicSalary ?? ''} onChange={(e) => setProfileForm((p: any) => ({ ...p, basicSalary: e.target.value }))} disabled={!isHRManager} /></Grid><Grid item xs={12} md={4}><TextField fullWidth type="number" label="Salary payment day" value={profileForm.salaryPaymentDay ?? 1} onChange={(e) => setProfileForm((p: any) => ({ ...p, salaryPaymentDay: e.target.value }))} disabled={!isHRManager} /></Grid></>}
                    <Grid item xs={12}><Divider sx={{ my: 1 }} /><Typography variant="overline" color={binThemeTokens.gold} fontWeight={900}>ACTIVATION CHECKLIST</Typography></Grid>{['profileComplete', 'documentsComplete', 'contractComplete'].map((key) => <Grid item xs={12} sm={4} key={key}><FormControlLabel control={<Checkbox checked={Boolean(profileForm[key])} onChange={(e) => setProfileForm((p: any) => ({ ...p, [key]: e.target.checked }))} disabled={!isHRManager} />} label={key.replace(/([A-Z])/g, ' $1')} /></Grid>)}{selectedStaff?.role === 'technician' && <Grid item xs={12} sm={4}><FormControlLabel control={<Checkbox checked={Boolean(profileForm.deviceReady)} onChange={(e) => setProfileForm((p: any) => ({ ...p, deviceReady: e.target.checked }))} disabled={!isHRManager} />} label="Device ready" /></Grid>}<Grid item xs={12} sm={4}><FormControlLabel control={<Checkbox checked={Boolean(profileForm.activationApproved)} onChange={(e) => setProfileForm((p: any) => ({ ...p, activationApproved: e.target.checked }))} disabled={!isHRManager} />} label="Final HR activation approved" /></Grid>
                    <Grid item xs={12}><Alert severity={selectedStaff?.invitationStatus === 'ERROR' ? 'error' : 'info'}>Invitation: {selectedStaff?.invitationStatus || 'QUEUED'}. Email verification is read from Firebase Auth on each onboarding update; Admin cannot fake it.</Alert></Grid>
                </Grid></DialogContent>
                <DialogActions sx={{ p: 3 }}><Button onClick={() => selectedStaff && resendInvitation(selectedStaff)} disabled={!isHRManager || profileBusy} startIcon={<Mail size={16} />}>RESEND INVITE</Button><Button onClick={saveStaffProfile} disabled={!isHRManager || profileBusy}>SAVE PROFILE</Button><Button variant="contained" onClick={saveOnboarding} disabled={!isHRManager || profileBusy}>SAVE ONBOARDING</Button></DialogActions>
            </Dialog>

            <Dialog open={attendanceOpen} onClose={() => setAttendanceOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#08101f', color: '#fff' } }}><DialogTitle>Attendance / shift exception</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}><FormControl fullWidth><InputLabel>Staff</InputLabel><Select value={attendanceForm.uid} label="Staff" onChange={(e) => setAttendanceForm((p) => ({ ...p, uid: String(e.target.value) }))}>{snapshot.staff.filter((m) => m.status === 'ACTIVE').map((member) => <MenuItem key={member.id} value={member.id}>{member.displayName}</MenuItem>)}</Select></FormControl><TextField type="date" label="Date" InputLabelProps={{ shrink: true }} value={attendanceForm.date} onChange={(e) => setAttendanceForm((p) => ({ ...p, date: e.target.value }))} /><FormControl fullWidth><InputLabel>Adjustment</InputLabel><Select value={attendanceForm.action} label="Adjustment" onChange={(e) => setAttendanceForm((p) => ({ ...p, action: String(e.target.value) }))}>{ATTENDANCE_ACTIONS.map((action) => <MenuItem key={action} value={action}>{action.replace(/_/g, ' ')}</MenuItem>)}</Select></FormControl><TextField multiline minRows={3} label="Reason / evidence note" value={attendanceForm.reason} onChange={(e) => setAttendanceForm((p) => ({ ...p, reason: e.target.value }))} /></Stack></DialogContent><DialogActions><Button onClick={() => setAttendanceOpen(false)}>CANCEL</Button><Button variant="contained" onClick={recordAttendance}>RECORD & AUDIT</Button></DialogActions></Dialog>
        </Box>
    );
}
