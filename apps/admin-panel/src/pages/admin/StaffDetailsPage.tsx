import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Alert, Box, Button, Checkbox, Chip, CircularProgress, Container, Divider, FormControlLabel,
    Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { ArrowLeft, Mail, RefreshCw, ShieldOff, UserX } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { useAuth } from '../../context/AuthContext';

type Snapshot = {
    privateFieldsIncluded?: boolean;
    staff?: any[];
    leaves?: any[];
    documents?: any[];
    shifts?: any[];
    payroll?: any[];
};

function errorText(error: any) {
    return String(error?.details || error?.message || error?.code || 'Staff operation failed.')
        .replace(/^FirebaseError:\s*/i, '')
        .slice(0, 360);
}

function formatDate(value: any) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('en-AE') : String(value);
}

function field(label: string, value: any) {
    return (
        <Box>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 850 }}>{label}</Typography>
            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 800, mt: 0.3 }}>{value ?? '—'}</Typography>
        </Box>
    );
}

export default function StaffDetailsPage() {
    const { uid = '' } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [snapshot, setSnapshot] = useState<Snapshot>({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<{ error: boolean; message: string } | null>(null);
    const [checklist, setChecklist] = useState({ profileComplete: false, documentsComplete: false, contractComplete: false, deviceReady: false, activationApproved: false });

    const privilegedHRRoles = new Set(['super_admin', 'admin', 'ceo', 'hr_admin', 'hr_manager']);
    const isHRManager = Boolean(user?.claims?.admin === true || user?.isAdmin === true || privilegedHRRoles.has(String(user?.role)));

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response: any = await httpsCallable(functions, 'adminGetHrCommandSnapshot')({});
            setSnapshot(response.data || {});
            setNotice(null);
        } catch (error) {
            setNotice({ error: true, message: `Staff profile sync failed: ${errorText(error)}` });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const staff = useMemo(() => (snapshot.staff || []).find((member) => member.id === uid) || null, [snapshot.staff, uid]);
    const leaves = useMemo(() => (snapshot.leaves || []).filter((record) => record.staffId === uid), [snapshot.leaves, uid]);
    const documents = useMemo(() => (snapshot.documents || []).filter((record) => record.staffId === uid), [snapshot.documents, uid]);
    const shifts = useMemo(() => (snapshot.shifts || []).filter((record) => record.staffId === uid).slice(0, 30), [snapshot.shifts, uid]);
    const payroll = useMemo(() => (snapshot.payroll || []).filter((record) => [record.staffId, record.uid, record.employeeId].includes(uid)), [snapshot.payroll, uid]);

    useEffect(() => {
        if (!staff) return;
        const current = staff.onboardingChecklist || {};
        setChecklist({
            profileComplete: current.profileComplete === true,
            documentsComplete: current.documentsComplete === true,
            contractComplete: current.contractComplete === true,
            deviceReady: staff.role === 'technician' ? current.deviceReady === true : true,
            activationApproved: current.activationApproved === true,
        });
    }, [staff]);

    const invoke = async (name: string, data: Record<string, unknown>, success: string) => {
        setBusy(true); setNotice(null);
        try {
            await httpsCallable(functions, name)(data);
            setNotice({ error: false, message: success });
            await load();
        } catch (error) {
            setNotice({ error: true, message: errorText(error) });
        } finally {
            setBusy(false);
        }
    };

    const saveOnboarding = async () => invoke('adminUpdateStaffOnboarding', { uid, ...checklist }, `${staff?.displayName || 'Staff'} onboarding updated.`);
    const resendInvitation = async () => invoke('adminResendStaffInvitation', { uid }, `Invitation re-queued for ${staff?.displayName || 'staff'}.`);
    const suspendOrRestore = async () => {
        const next = staff?.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
        await invoke('adminSetStaffStatus', { uid, status: next }, next === 'SUSPENDED' ? 'Account suspended and refresh tokens revoked.' : 'Account restored to its prior onboarding state.');
    };
    const offboard = async () => {
        const reason = window.prompt(`Offboarding reason for ${staff?.displayName || uid}:`);
        if (!reason?.trim() || !window.confirm('Offboard this staff member? Auth will be disabled and historical records archived, not deleted.')) return;
        await invoke('adminOffboardStaff', { uid, reason: reason.trim() }, 'Staff member offboarded and historical records archived.');
    };

    if (loading) return <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!staff) return <Container sx={{ py: 8 }}><Alert severity="error">No provisioned staff record exists for UID {uid}.</Alert><Button onClick={() => navigate('/hr')} sx={{ mt: 2 }}>BACK TO HR COMMAND</Button></Container>;

    const salary = staff.salaryPackage || {};

    return (
        <Box sx={{ bgcolor: '#020617', minHeight: '100%', py: 4 }} data-testid="admin-staff-details-page">
            <Container maxWidth="xl">
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 4 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Button onClick={() => navigate('/hr')} startIcon={<ArrowLeft size={17} />}>HR COMMAND</Button>
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>CANONICAL STAFF PROFILE</Typography>
                            <Typography variant="h4" color="#fff" fontWeight={950}>{staff.displayName}</Typography>
                            <Typography variant="body2" color="text.secondary">{staff.email} · {String(staff.role || '').replace(/_/g, ' ').toUpperCase()}</Typography>
                        </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Button startIcon={<RefreshCw size={16} />} onClick={load} disabled={busy}>REFRESH</Button>
                        {isHRManager && <Button startIcon={<Mail size={16} />} onClick={resendInvitation} disabled={busy || staff.status === 'OFFBOARDED'}>RESEND INVITE</Button>}
                        {isHRManager && <Button startIcon={<ShieldOff size={16} />} onClick={suspendOrRestore} disabled={busy || staff.status === 'OFFBOARDED'}>{staff.status === 'SUSPENDED' ? 'RESTORE' : 'SUSPEND'}</Button>}
                        {isHRManager && <Button color="error" startIcon={<UserX size={16} />} onClick={offboard} disabled={busy || staff.status === 'OFFBOARDED'}>OFFBOARD</Button>}
                    </Stack>
                </Stack>

                {notice && <Alert severity={notice.error ? 'error' : 'success'} onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice.message}</Alert>}

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {[['STATUS', staff.status], ['ONBOARDING', staff.onboardingStage], ['INVITATION', staff.invitationStatus || 'QUEUED'], ['KPI', staff.performanceScore != null ? `${staff.performanceScore}%` : 'N/A']].map(([label, value]) => <Grid item xs={6} md={3} key={label}><Paper sx={{ p: 2.5, bgcolor: 'rgba(15,23,42,0.74)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" color="#fff" fontWeight={950}>{value}</Typography></Paper></Grid>)}
                </Grid>

                <Grid container spacing={3}>
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4 }}>
                            <Typography variant="h6" fontWeight={950} color="#fff">Identity & employment</Typography>
                            <Divider sx={{ my: 2 }} />
                            <Grid container spacing={3}>
                                <Grid item xs={6} md={4}>{field('Employee ID', staff.employeeId)}</Grid>
                                <Grid item xs={6} md={4}>{field('Phone', staff.phoneNumber)}</Grid>
                                <Grid item xs={6} md={4}>{field('Department', staff.department)}</Grid>
                                <Grid item xs={6} md={4}>{field('Job title', staff.jobTitle)}</Grid>
                                <Grid item xs={6} md={4}>{field('Specialization', staff.specialization)}</Grid>
                                <Grid item xs={6} md={4}>{field('Joining date', staff.joiningDate)}</Grid>
                                <Grid item xs={6} md={4}>{field('Contract expiry', staff.contractEndDate)}</Grid>
                                <Grid item xs={6} md={4}>{field('Visa expiry', snapshot.privateFieldsIncluded ? staff.visaExpiryDate : 'Manager-only')}</Grid>
                                <Grid item xs={6} md={4}>{field('Salary grade', snapshot.privateFieldsIncluded ? staff.salaryGrade : 'Manager-only')}</Grid>
                            </Grid>
                            {snapshot.privateFieldsIncluded && <><Divider sx={{ my: 3 }} /><Typography variant="subtitle2" color={binThemeTokens.gold} fontWeight={950}>PRIVATE HR / PAYROLL</Typography><Grid container spacing={3} sx={{ mt: 0.5 }}><Grid item xs={6} md={4}>{field('Basic salary', salary.basicSalary != null ? `AED ${salary.basicSalary}` : null)}</Grid><Grid item xs={6} md={4}>{field('Housing allowance', salary.housingAllowance != null ? `AED ${salary.housingAllowance}` : null)}</Grid><Grid item xs={6} md={4}>{field('Transport allowance', salary.transportAllowance != null ? `AED ${salary.transportAllowance}` : null)}</Grid><Grid item xs={6} md={4}>{field('Food allowance', salary.foodAllowance != null ? `AED ${salary.foodAllowance}` : null)}</Grid><Grid item xs={6} md={4}>{field('Other allowance', salary.otherAllowance != null ? `AED ${salary.otherAllowance}` : null)}</Grid><Grid item xs={6} md={4}>{field('Salary day', salary.salaryPaymentDay)}</Grid></Grid></>}
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4 }}>
                            <Typography variant="h6" fontWeight={950} color="#fff">Activation checklist</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>INVITED → EMAIL_VERIFIED → PROFILE_COMPLETE → DOCUMENTS_COMPLETE → CONTRACT_COMPLETE → DEVICE_READY → ACTIVE.</Typography>
                            <Stack>
                                <FormControlLabel control={<Checkbox checked={checklist.profileComplete} onChange={(e) => setChecklist((v) => ({ ...v, profileComplete: e.target.checked }))} />} label="Profile complete" />
                                <FormControlLabel control={<Checkbox checked={checklist.documentsComplete} onChange={(e) => setChecklist((v) => ({ ...v, documentsComplete: e.target.checked }))} />} label="Documents complete" />
                                <FormControlLabel control={<Checkbox checked={checklist.contractComplete} onChange={(e) => setChecklist((v) => ({ ...v, contractComplete: e.target.checked }))} />} label="Contract complete" />
                                {staff.role === 'technician' && <FormControlLabel control={<Checkbox checked={checklist.deviceReady} onChange={(e) => setChecklist((v) => ({ ...v, deviceReady: e.target.checked }))} />} label="Device ready" />}
                                <FormControlLabel control={<Checkbox checked={checklist.activationApproved} onChange={(e) => setChecklist((v) => ({ ...v, activationApproved: e.target.checked }))} />} label="Activation approved" />
                            </Stack>
                            {isHRManager ? <Button fullWidth variant="contained" onClick={saveOnboarding} disabled={busy} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>SAVE ONBOARDING</Button> : <Alert severity="info" sx={{ mt: 2 }}>HR Staff has read-only access to activation state.</Alert>}
                        </Paper>
                    </Grid>
                </Grid>

                <Grid container spacing={3} sx={{ mt: 0 }}>
                    <Grid item xs={12} lg={4}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4, height: '100%' }}><Typography variant="h6" fontWeight={950}>Documents</Typography><Stack spacing={1.2} sx={{ mt: 2 }}>{documents.slice(0, 12).map((record) => <Box key={record.id}><Typography variant="body2" color="#fff" fontWeight={800}>{record.fileName || record.documentType}</Typography><Typography variant="caption" color="text.secondary">{String(record.documentType || '').replace(/_/g, ' ')} · expiry {record.expiresOn || '—'}</Typography></Box>)}{documents.length === 0 && <Typography color="text.secondary">No document records.</Typography>}</Stack></Paper></Grid>
                    <Grid item xs={12} lg={4}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4, height: '100%' }}><Typography variant="h6" fontWeight={950}>Leave & attendance</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{leaves.length} leave requests · {shifts.length} recent shifts</Typography><Stack spacing={1} sx={{ mt: 2 }}>{leaves.slice(0, 8).map((record) => <Box key={record.id}><Chip size="small" label={record.status || 'PENDING'} /><Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{record.leaveType} · {record.startDate} → {record.endDate}</Typography></Box>)}{leaves.length === 0 && <Typography color="text.secondary">No leave requests.</Typography>}</Stack></Paper></Grid>
                    <Grid item xs={12} lg={4}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4, height: '100%' }}><Typography variant="h6" fontWeight={950}>Payroll history</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{payroll.length} linked payroll records</Typography><TableContainer sx={{ mt: 1 }}><Table size="small"><TableHead><TableRow><TableCell>PERIOD</TableCell><TableCell>STATUS</TableCell></TableRow></TableHead><TableBody>{payroll.slice(0, 8).map((record) => <TableRow key={record.id}><TableCell>{record.month || record.period || formatDate(record.createdAt)}</TableCell><TableCell>{record.status || '—'}</TableCell></TableRow>)}{payroll.length === 0 && <TableRow><TableCell colSpan={2}>No payroll records.</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper></Grid>
                </Grid>
            </Container>
        </Box>
    );
}
