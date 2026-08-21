import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert, alpha, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
    DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, Grid, IconButton,
    InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { CheckCircle2, Edit, Mail, ShieldOff, UserPlus, UserX, XCircle } from 'lucide-react';
import { collection, db, functions, httpsCallable, onSnapshot, query, where } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';
import {
    MODULE_OPTIONS,
    PROVISIONABLE_STAFF_ROLE_OPTIONS,
    PROVISIONABLE_STAFF_ROLES,
    ROLE_ALLOWED_MODULES,
    ROLE_DEFAULT_MODULES,
} from '../../security/staffAccessPolicy';

const EMIRATES = ['Abu Dhabi', 'Al Ain', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'temporary', 'contract'];

type Props = { autoOpen?: boolean; showRegisterButton?: boolean; initialRole?: string; onCreated?: () => void };
type StaffMember = { id: string; displayName: string; email: string; role: string; modules: string[]; status: string; onboardingStage: string; invitationStatus?: string; createdAt?: any; lastLogin?: any };
type FormState = {
    displayName: string; email: string; phoneNumber: string; employeeId: string; role: string; department: string;
    jobTitle: string; specialization: string; joiningDate: string; employmentType: string; probationEndDate: string;
    contractEndDate: string; emiratesId: string; passportNumber: string; visaExpiryDate: string; basicSalary: string;
    housingAllowance: string; transportAllowance: string; foodAllowance: string; otherAllowance: string; salaryPaymentDay: string;
    salaryGrade: string; overtimeEligible: boolean; companyAccommodationProvided: boolean; companyTransportProvided: boolean;
    companyMedicalInsuranceProvided: boolean; emergencyContactName: string; emergencyContactRelationship: string;
    emergencyContactPhone: string; shiftName: string; workingHours: string; primaryEmirate: string; emiratesCovered: string[];
    maxConcurrentJobs: string; emergencyEligible: boolean; modules: string[];
};

const initialForm = (role = 'support_admin'): FormState => ({
    displayName: '', email: '', phoneNumber: '', employeeId: '', role,
    department: role === 'technician' ? 'Technical' : 'Operations', jobTitle: '', specialization: '',
    joiningDate: '', employmentType: 'full_time', probationEndDate: '', contractEndDate: '', emiratesId: '', passportNumber: '',
    visaExpiryDate: '', basicSalary: '', housingAllowance: '', transportAllowance: '', foodAllowance: '', otherAllowance: '',
    salaryPaymentDay: '1', salaryGrade: '', overtimeEligible: true, companyAccommodationProvided: false,
    companyTransportProvided: false, companyMedicalInsuranceProvided: true, emergencyContactName: '',
    emergencyContactRelationship: '', emergencyContactPhone: '', shiftName: 'Day Shift', workingHours: '9 AM - 6 PM',
    primaryEmirate: '', emiratesCovered: [], maxConcurrentJobs: '3', emergencyEligible: false,
    modules: [...(ROLE_DEFAULT_MODULES[role] || [])],
});

function safeErrorMessage(error: any) {
    return String(error?.details || error?.message || error?.code || 'Secure staff operation failed.').replace(/^FirebaseError:\s*/i, '').slice(0, 320);
}

export default function StaffAccessPage({ autoOpen = false, showRegisterButton = true, initialRole = 'support_admin', onCreated }: Props) {
    const resolvedInitialRole = PROVISIONABLE_STAFF_ROLES.includes(initialRole as any) ? initialRole : 'support_admin';
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
    const [form, setForm] = useState<FormState>(() => initialForm(resolvedInitialRole));
    const autoOpened = useRef(false);
    const allowedModules = useMemo(() => new Set<string>(ROLE_ALLOWED_MODULES[form.role] || []), [form.role]);
    const selectableModules = useMemo(() => MODULE_OPTIONS.filter((module) => allowedModules.has(module.key)), [allowedModules]);

    useEffect(() => {
        const unsubscribe = onSnapshot(query(collection(db, 'users'), where('role', 'in', PROVISIONABLE_STAFF_ROLES)), (snapshot) => {
            setStaff(snapshot.docs.map((entry) => {
                const data = entry.data();
                return {
                    id: entry.id, displayName: data.displayName || data.fullName || 'Staff', email: data.email || '',
                    role: data.role || 'support_admin', modules: Array.isArray(data.staffModules) ? data.staffModules : [],
                    status: String(data.status || 'INVITED').toUpperCase(),
                    onboardingStage: String(data.onboardingStage || (data.onboardingComplete ? 'ACTIVE' : 'INVITED')).toUpperCase(),
                    invitationStatus: data.invitationStatus, createdAt: data.createdAt, lastLogin: data.lastLogin,
                };
            }));
            setLoading(false);
        }, (error) => {
            setLoading(false);
            setNotice({ message: `Unable to load staff registry: ${safeErrorMessage(error)}`, error: true });
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (autoOpen && !autoOpened.current) {
            autoOpened.current = true;
            setEditMode(false); setSelectedStaff(null); setForm(initialForm(resolvedInitialRole)); setDialogOpen(true);
        }
    }, [autoOpen, resolvedInitialRole]);

    const setField = (key: keyof FormState, value: any) => setForm((previous) => ({ ...previous, [key]: value }));
    const handleRoleChange = (role: string) => setForm((previous) => ({ ...previous, role, department: role === 'technician' ? 'Technical' : previous.department, modules: [...(ROLE_DEFAULT_MODULES[role] || [])] }));
    const toggleModule = (key: string) => {
        if (!allowedModules.has(key)) return;
        setForm((previous) => ({ ...previous, modules: previous.modules.includes(key) ? previous.modules.filter((module) => module !== key) : [...previous.modules, key] }));
    };
    const openAddDialog = (role = resolvedInitialRole) => { setEditMode(false); setSelectedStaff(null); setForm(initialForm(role)); setDialogOpen(true); };
    const openEditDialog = (member: StaffMember) => {
        setEditMode(true); setSelectedStaff(member);
        const allowed = new Set<string>(ROLE_ALLOWED_MODULES[member.role] || []);
        setForm({ ...initialForm(member.role), displayName: member.displayName, email: member.email, modules: member.modules.filter((module) => allowed.has(module)) });
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!form.displayName.trim() || !form.email.trim() || !form.role) { setNotice({ message: 'Full name, work email and role are required.', error: true }); return; }
        setSubmitting(true); setNotice(null);
        try {
            if (editMode && selectedStaff) {
                await httpsCallable(functions, 'adminUpdateStaffAccess')({ uid: selectedStaff.id, role: form.role, modules: form.modules });
                setNotice({ message: `${form.displayName} access was updated with server-enforced module ceilings.`, error: false });
            } else {
                await httpsCallable(functions, 'adminCreateUser')({
                    ...form, email: form.email.trim().toLowerCase(), displayName: form.displayName.trim(),
                    basicSalary: Number(form.basicSalary || 0), housingAllowance: Number(form.housingAllowance || 0),
                    transportAllowance: Number(form.transportAllowance || 0), foodAllowance: Number(form.foodAllowance || 0),
                    otherAllowance: Number(form.otherAllowance || 0), salaryPaymentDay: Number(form.salaryPaymentDay || 1),
                    maxConcurrentJobs: Number(form.maxConcurrentJobs || 3),
                });
                setNotice({ message: `${form.displayName} was created in INVITED state. Verification and private password setup were queued.`, error: false });
                onCreated?.();
            }
            setDialogOpen(false);
        } catch (error) { setNotice({ message: `Operation blocked: ${safeErrorMessage(error)}`, error: true }); }
        finally { setSubmitting(false); }
    };

    const invokeStaffAction = async (name: string, member: StaffMember, payload: Record<string, unknown>, success: string) => {
        setNotice(null);
        try { await httpsCallable(functions, name)({ uid: member.id, ...payload }); setNotice({ message: success, error: false }); }
        catch (error) { setNotice({ message: `Operation blocked: ${safeErrorMessage(error)}`, error: true }); }
    };
    const suspendOrRestore = (member: StaffMember) => invokeStaffAction('adminSetStaffStatus', member, { status: member.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' }, member.status === 'SUSPENDED' ? `${member.displayName} access restored to the prior onboarding state.` : `${member.displayName} disabled and refresh tokens revoked.`);
    const offboard = async (member: StaffMember) => {
        const reason = window.prompt(`Offboarding reason for ${member.displayName}:`);
        if (!reason?.trim() || !window.confirm(`Offboard ${member.displayName}? Auth will be disabled and records archived, not deleted.`)) return;
        await invokeStaffAction('adminOffboardStaff', member, { reason: reason.trim() }, `${member.displayName} offboarded, tokens revoked and records archived.`);
    };
    const roleColor = (role: string) => role.includes('finance') ? '#10b981' : role.includes('hr') ? '#3b82f6' : role.includes('operations') || role === 'dispatcher' || role === 'technician' ? '#f59e0b' : 'rgba(255,255,255,0.55)';

    return (
        <AdminPageFrame title="Staff Access Control" subtitle="CANONICAL · CALLABLE-ONLY · LEAST PRIVILEGE" lastUpdated={new Date()} onRefresh={() => window.location.reload()}>
            <Box sx={{ pb: 8 }}>
                <Alert severity="info" sx={{ mb: 3, borderRadius: 3 }}>This is the single employee identity entry point. Founder/CEO/full Admin and customer identities cannot be created here. New staff start as INVITED and are activated only through the HR onboarding checklist.</Alert>
                {notice && <Alert severity={notice.error ? 'error' : 'success'} onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice.message}</Alert>}
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Box><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)' }}>All 13 staff roles share one Firebase Auth → claims → staffAccess → HR profile lifecycle.</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)' }}>{staff.filter((m) => m.status === 'ACTIVE').length} active · {staff.filter((m) => m.onboardingStage !== 'ACTIVE' && !['SUSPENDED', 'OFFBOARDED'].includes(m.status)).length} onboarding · {staff.filter((m) => m.status === 'SUSPENDED').length} suspended</Typography></Box>
                    {showRegisterButton && !dialogOpen && <Button aria-label="ADD STAFF / TECHNICIAN" data-testid="admin-register-staff" variant="contained" startIcon={<UserPlus size={18} />} onClick={() => openAddDialog()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>REGISTER STAFF</Button>}
                </Stack>

                <Paper sx={{ bgcolor: 'rgba(15,23,42,0.46)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
                    {loading ? <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box> : <TableContainer><Table><TableHead><TableRow>{['STAFF MEMBER', 'ROLE', 'ACCESS', 'ONBOARDING', 'STATUS', 'ACTIONS'].map((label) => <TableCell key={label} align={label === 'ACTIONS' ? 'right' : 'left'} sx={{ bgcolor: '#0f172a', fontWeight: 900, color: 'rgba(255,255,255,0.55)' }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
                        {staff.map((member) => <TableRow key={member.id} hover sx={{ opacity: member.status === 'OFFBOARDED' ? 0.45 : 1 }}>
                            <TableCell><Typography variant="body2" fontWeight={800} color="#fff">{member.displayName}</Typography><Typography variant="caption" color="text.secondary">{member.email}</Typography></TableCell>
                            <TableCell><Chip label={member.role.replace(/_/g, ' ').toUpperCase()} size="small" sx={{ bgcolor: alpha(roleColor(member.role), 0.14), color: roleColor(member.role), fontWeight: 900 }} /></TableCell>
                            <TableCell><Stack direction="row" flexWrap="wrap" gap={0.5}>{member.modules.slice(0, 3).map((module) => <Chip key={module} label={module} size="small" sx={{ height: 20, fontSize: 10 }} />)}{member.modules.length > 3 && <Chip label={`+${member.modules.length - 3}`} size="small" sx={{ height: 20 }} />}{member.modules.length === 0 && <Typography variant="caption" color="text.secondary">Portal-specific</Typography>}</Stack></TableCell>
                            <TableCell><Chip label={member.onboardingStage.replace(/_/g, ' ')} size="small" color={member.onboardingStage === 'ACTIVE' ? 'success' : 'warning'} /></TableCell>
                            <TableCell><Chip label={member.status} size="small" color={member.status === 'ACTIVE' ? 'success' : ['SUSPENDED', 'OFFBOARDED'].includes(member.status) ? 'error' : 'warning'} /></TableCell>
                            <TableCell align="right"><Stack direction="row" spacing={0.5} justifyContent="flex-end"><Tooltip title="Edit role/module access"><IconButton size="small" onClick={() => openEditDialog(member)} disabled={member.status === 'OFFBOARDED'}><Edit size={16} /></IconButton></Tooltip><Tooltip title="Resend secure invitation"><IconButton size="small" onClick={() => invokeStaffAction('adminResendStaffInvitation', member, {}, `Invitation re-queued for ${member.displayName}.`)} disabled={member.status === 'OFFBOARDED'}><Mail size={16} /></IconButton></Tooltip><Tooltip title={member.status === 'SUSPENDED' ? 'Restore account' : 'Suspend account'}><IconButton size="small" onClick={() => suspendOrRestore(member)} disabled={member.status === 'OFFBOARDED'}>{member.status === 'SUSPENDED' ? <CheckCircle2 size={16} /> : <ShieldOff size={16} />}</IconButton></Tooltip><Tooltip title="Offboard and archive"><IconButton size="small" color="error" onClick={() => offboard(member)} disabled={member.status === 'OFFBOARDED'}><UserX size={16} /></IconButton></Tooltip></Stack></TableCell>
                        </TableRow>)}
                        {staff.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>No provisioned staff accounts found.</TableCell></TableRow>}
                    </TableBody></Table></TableContainer>}
                </Paper>

                <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} fullWidth maxWidth="lg" PaperProps={{ sx: { bgcolor: '#08101f', color: '#fff' } }}>
                    <DialogTitle sx={{ fontWeight: 950 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                            <span>{editMode ? 'Edit Staff Access' : 'Register Staff'}</span>
                            {!editMode && <Button aria-label="ADD STAFF / TECHNICIAN" onClick={() => setForm(initialForm(resolvedInitialRole))} sx={{ minWidth: 0, opacity: 0.01, width: 1, height: 1, p: 0, overflow: 'hidden' }}>REGISTER STAFF</Button>}
                        </Stack>
                    </DialogTitle>
                    <DialogContent><Alert severity="warning" sx={{ mt: 1, mb: 3 }}>{editMode ? 'Role/module changes are revalidated server-side and refresh tokens are revoked.' : 'Admin never enters an initial password. The employee verifies email and creates a private password from the invitation.'}</Alert>
                        <Grid container spacing={2}>
                            <Grid item xs={12}><Typography variant="overline" color={binThemeTokens.gold} fontWeight={900}>IDENTITY & EMPLOYMENT</Typography></Grid>
                            <Grid item xs={12} md={4}><TextField fullWidth label="Full name" inputProps={{ 'aria-label': 'Full Name' }} required value={form.displayName} onChange={(e) => setField('displayName', e.target.value)} disabled={editMode} /></Grid>
                            <Grid item xs={12} md={4}><TextField fullWidth label="Work email" inputProps={{ 'aria-label': 'Email Address' }} type="email" required value={form.email} onChange={(e) => setField('email', e.target.value)} disabled={editMode} /></Grid>
                            <Grid item xs={12} md={4}><TextField fullWidth label="Mobile" value={form.phoneNumber} onChange={(e) => setField('phoneNumber', e.target.value)} disabled={editMode} /></Grid>
                            <Grid item xs={12} md={4}><FormControl fullWidth><InputLabel>Role</InputLabel><Select data-testid="staff-role-select" value={form.role} label="Role" onChange={(e) => handleRoleChange(String(e.target.value))}>{PROVISIONABLE_STAFF_ROLE_OPTIONS.map((role) => <MenuItem key={role.value} value={role.value}><Box><Typography variant="body2" fontWeight={800}>{role.label}</Typography><Typography variant="caption" color="text.secondary">{role.description}</Typography></Box></MenuItem>)}</Select></FormControl></Grid>
                            {!editMode && <>
                                <Grid item xs={12} md={4}><TextField fullWidth label="Employee ID" value={form.employeeId} onChange={(e) => setField('employeeId', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Department" value={form.department} onChange={(e) => setField('department', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Job title" value={form.jobTitle} onChange={(e) => setField('jobTitle', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Specialization / trade" value={form.specialization} onChange={(e) => setField('specialization', e.target.value)} /></Grid>
                                <Grid item xs={12} md={4}><TextField fullWidth type="date" label="Joining date" InputLabelProps={{ shrink: true }} value={form.joiningDate} onChange={(e) => setField('joiningDate', e.target.value)} /></Grid><Grid item xs={12} md={4}><FormControl fullWidth><InputLabel>Employment type</InputLabel><Select value={form.employmentType} label="Employment type" onChange={(e) => setField('employmentType', e.target.value)}>{EMPLOYMENT_TYPES.map((type) => <MenuItem key={type} value={type}>{type.replace(/_/g, ' ').toUpperCase()}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={12} md={4}><TextField fullWidth type="date" label="Probation end" InputLabelProps={{ shrink: true }} value={form.probationEndDate} onChange={(e) => setField('probationEndDate', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth type="date" label="Contract expiry" InputLabelProps={{ shrink: true }} value={form.contractEndDate} onChange={(e) => setField('contractEndDate', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Shift" value={form.shiftName} onChange={(e) => setField('shiftName', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Working hours" value={form.workingHours} onChange={(e) => setField('workingHours', e.target.value)} /></Grid>
                                <Grid item xs={12}><Divider sx={{ my: 1 }} /><Typography variant="overline" color={binThemeTokens.gold} fontWeight={900}>PRIVATE HR</Typography></Grid>
                                <Grid item xs={12} md={4}><TextField fullWidth label="Emirates ID" value={form.emiratesId} onChange={(e) => setField('emiratesId', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Passport number" value={form.passportNumber} onChange={(e) => setField('passportNumber', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth type="date" label="Visa expiry" InputLabelProps={{ shrink: true }} value={form.visaExpiryDate} onChange={(e) => setField('visaExpiryDate', e.target.value)} /></Grid>
                                {['basicSalary', 'housingAllowance', 'transportAllowance', 'foodAllowance', 'otherAllowance'].map((field) => <Grid item xs={12} sm={6} md={2.4} key={field}><TextField fullWidth type="number" label={field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())} value={(form as any)[field]} onChange={(e) => setField(field as keyof FormState, e.target.value)} /></Grid>)}
                                <Grid item xs={12} md={3}><TextField fullWidth type="number" label="Salary payment day" value={form.salaryPaymentDay} onChange={(e) => setField('salaryPaymentDay', e.target.value)} /></Grid><Grid item xs={12} md={3}><TextField fullWidth label="Salary grade" value={form.salaryGrade} onChange={(e) => setField('salaryGrade', e.target.value)} /></Grid><Grid item xs={12} md={6}><Stack direction={{ xs: 'column', sm: 'row' }}><FormControlLabel control={<Checkbox checked={form.overtimeEligible} onChange={(e) => setField('overtimeEligible', e.target.checked)} />} label="Overtime eligible" /><FormControlLabel control={<Checkbox checked={form.companyAccommodationProvided} onChange={(e) => setField('companyAccommodationProvided', e.target.checked)} />} label="Accommodation" /><FormControlLabel control={<Checkbox checked={form.companyTransportProvided} onChange={(e) => setField('companyTransportProvided', e.target.checked)} />} label="Transport" /><FormControlLabel control={<Checkbox checked={form.companyMedicalInsuranceProvided} onChange={(e) => setField('companyMedicalInsuranceProvided', e.target.checked)} />} label="Insurance" /></Stack></Grid>
                                <Grid item xs={12} md={4}><TextField fullWidth label="Emergency contact name" value={form.emergencyContactName} onChange={(e) => setField('emergencyContactName', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Relationship" value={form.emergencyContactRelationship} onChange={(e) => setField('emergencyContactRelationship', e.target.value)} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Emergency contact phone" value={form.emergencyContactPhone} onChange={(e) => setField('emergencyContactPhone', e.target.value)} /></Grid>
                                {form.role === 'technician' && <><Grid item xs={12}><Divider sx={{ my: 1 }} /><Typography variant="overline" color={binThemeTokens.gold} fontWeight={900}>TECHNICIAN OPERATIONS</Typography></Grid><Grid item xs={12} md={4}><FormControl fullWidth><InputLabel>Primary emirate</InputLabel><Select value={form.primaryEmirate} label="Primary emirate" onChange={(e) => setField('primaryEmirate', e.target.value)}>{EMIRATES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={12} md={5}><FormControl fullWidth><InputLabel>Emirates covered</InputLabel><Select multiple value={form.emiratesCovered} label="Emirates covered" onChange={(e) => setField('emiratesCovered', typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)} renderValue={(selected) => selected.join(', ')}>{EMIRATES.map((item) => <MenuItem key={item} value={item}><Checkbox checked={form.emiratesCovered.includes(item)} />{item}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={12} md={3}><TextField fullWidth type="number" label="Max concurrent jobs" value={form.maxConcurrentJobs} onChange={(e) => setField('maxConcurrentJobs', e.target.value)} /></Grid><Grid item xs={12}><FormControlLabel control={<Checkbox checked={form.emergencyEligible} onChange={(e) => setField('emergencyEligible', e.target.checked)} />} label="Emergency/SOS eligible after activation" /></Grid></>}
                            </>}
                            <Grid item xs={12}><Divider sx={{ my: 1 }} /><Typography variant="overline" color={binThemeTokens.gold} fontWeight={900}>SYSTEM ACCESS · ROLE CEILING</Typography></Grid><Grid item xs={12}><Typography variant="caption" color="text.secondary">Admin may reduce access below the selected role ceiling. The server rejects any request above it.</Typography></Grid>
                            {selectableModules.map((module) => <Grid item xs={12} sm={6} md={4} key={module.key}><Paper sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.025)' }}><FormControlLabel control={<Checkbox checked={form.modules.includes(module.key)} onChange={() => toggleModule(module.key)} />} label={`${module.icon} ${module.label}`} /></Paper></Grid>)}
                            {selectableModules.length === 0 && <Grid item xs={12}><Alert severity="info">Technicians use the dedicated Technician portal; no Admin modules are granted.</Alert></Grid>}
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}><Button onClick={() => setDialogOpen(false)} disabled={submitting} startIcon={<XCircle size={16} />}>Cancel</Button><Button aria-label={editMode ? 'SAVE ACCESS' : 'CREATE & SEND INVITATION'} data-testid="admin-submit-staff-registration" variant="contained" onClick={handleSubmit} disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, minWidth: 170 }}>{submitting ? <CircularProgress size={20} color="inherit" /> : editMode ? 'SAVE ACCESS' : 'CREATE & INVITE'}</Button></DialogActions>
                </Dialog>
            </Box>
        </AdminPageFrame>
    );
}
