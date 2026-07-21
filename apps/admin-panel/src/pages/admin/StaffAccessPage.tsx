// apps/admin-panel/src/pages/admin/StaffAccessPage.tsx
// Secure staff provisioning: callable-only, fail-closed, least-privilege module access.

import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, alpha, Box, Button, Checkbox, Chip, CircularProgress,
    Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, FormControlLabel, Grid, IconButton, InputLabel,
    MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { CheckCircle2, Edit, UserPlus, XCircle } from 'lucide-react';
import { collection, db, onSnapshot, query, where } from '../../lib/firebase';
import { functions, httpsCallable } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';

const STAFF_ROLES = [
    { value: 'technician', label: 'Technician', description: 'Physical-device field technician access' },
    { value: 'operations_admin', label: 'Operations Admin', description: 'Tickets, technicians, map and SOS' },
    { value: 'operations_manager', label: 'Operations Manager', description: 'Operations oversight and reporting' },
    { value: 'finance_admin', label: 'Finance Admin', description: 'Financial operations and reporting' },
    { value: 'finance_staff', label: 'Finance Staff', description: 'Restricted finance support' },
    { value: 'hr_admin', label: 'HR Admin', description: 'Staff lifecycle and HR administration' },
    { value: 'hr_manager', label: 'HR Manager', description: 'HR approvals and reporting' },
    { value: 'hr_staff', label: 'HR Staff', description: 'Restricted HR support' },
    { value: 'support_admin', label: 'Support Admin', description: 'Tenant support, tickets and SOS' },
    { value: 'account_manager', label: 'Account Manager', description: 'Owners, contracts and documents' },
    { value: 'dispatcher', label: 'Dispatcher', description: 'Ticket assignment and live dispatch' },
    { value: 'manager', label: 'Manager', description: 'Restricted management reports' },
    { value: 'admin_assistant', label: 'Admin Assistant', description: 'Restricted administrative support' },
] as const;

const MODULE_ACCESS = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'owners', label: 'Owner Management', icon: '🏠' },
    { key: 'tenants', label: 'Tenant Management', icon: '👤' },
    { key: 'tickets', label: 'Tickets / Maintenance', icon: '🔧' },
    { key: 'technicians', label: 'Technician Management', icon: '👷' },
    { key: 'financials', label: 'Financials', icon: '💰' },
    { key: 'transactions', label: 'Transactions', icon: '💳' },
    { key: 'contracts', label: 'Contracts', icon: '📝' },
    { key: 'documents', label: 'Document Vault', icon: '📁' },
    { key: 'properties', label: 'Properties', icon: '🏢' },
    { key: 'reports', label: 'Reports & Analytics', icon: '📈' },
    { key: 'audit', label: 'Audit Log', icon: '🔍' },
    { key: 'map', label: 'Live Map', icon: '🗺️' },
    { key: 'sos', label: 'SOS Feed', icon: '🚨' },
    { key: 'hr', label: 'HR Management', icon: '👥' },
] as const;

const ROLE_ALLOWED_MODULES: Record<string, string[]> = {
    technician: [],
    manager: ['dashboard', 'reports', 'audit', 'owners', 'tenants', 'properties'],
    operations_admin: ['dashboard', 'tickets', 'technicians', 'map', 'sos', 'properties', 'owners', 'tenants', 'documents'],
    hr_admin: ['dashboard', 'technicians', 'hr', 'reports', 'audit'],
    support_admin: ['dashboard', 'tenants', 'tickets', 'sos', 'documents'],
    hr_staff: ['dashboard', 'technicians', 'hr'],
    hr_manager: ['dashboard', 'technicians', 'hr', 'reports', 'audit'],
    finance_staff: ['dashboard', 'financials', 'transactions', 'reports'],
    dispatcher: ['dashboard', 'tickets', 'technicians', 'map', 'sos'],
    admin_assistant: ['dashboard', 'owners', 'tenants', 'tickets', 'documents', 'properties'],
    account_manager: ['dashboard', 'owners', 'contracts', 'documents', 'properties'],
    operations_manager: ['dashboard', 'tickets', 'technicians', 'map', 'sos', 'properties', 'reports'],
    finance_admin: ['dashboard', 'financials', 'transactions', 'reports', 'audit'],
};

const ROLE_DEFAULT_MODULES: Record<string, string[]> = {
    technician: [],
    manager: ['dashboard', 'reports'],
    operations_admin: ['dashboard', 'tickets', 'technicians', 'map', 'sos'],
    hr_admin: ['dashboard', 'technicians', 'hr'],
    support_admin: ['dashboard', 'tenants', 'tickets'],
    hr_staff: ['dashboard', 'hr'],
    hr_manager: ['dashboard', 'technicians', 'hr', 'reports'],
    finance_staff: ['dashboard', 'financials', 'transactions'],
    dispatcher: ['dashboard', 'tickets', 'technicians', 'map'],
    admin_assistant: ['dashboard', 'owners', 'tenants', 'documents'],
    account_manager: ['dashboard', 'owners', 'contracts', 'documents', 'properties'],
    operations_manager: ['dashboard', 'tickets', 'technicians', 'reports'],
    finance_admin: ['dashboard', 'financials', 'transactions', 'reports'],
};

interface StaffMember {
    id: string;
    displayName: string;
    email: string;
    role: string;
    modules: string[];
    status: string;
    createdAt?: any;
    lastLogin?: any;
}

function safeErrorMessage(error: any) {
    const message = String(error?.details || error?.message || error?.code || 'Secure staff operation failed.');
    return message.replace(/^FirebaseError:\s*/i, '').slice(0, 280);
}

export default function StaffAccessPage() {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', error: false });
    const [formData, setFormData] = useState({
        displayName: '',
        email: '',
        role: 'support_admin',
        modules: ROLE_DEFAULT_MODULES.support_admin,
    });

    const allowedModules = useMemo(
        () => new Set(ROLE_ALLOWED_MODULES[formData.role] || []),
        [formData.role],
    );
    const selectableModules = useMemo(
        () => MODULE_ACCESS.filter((module) => allowedModules.has(module.key)),
        [allowedModules],
    );

    useEffect(() => {
        const staffRoleValues = STAFF_ROLES.map((role) => role.value);
        const unsubscribe = onSnapshot(
            query(collection(db, 'users'), where('role', 'in', staffRoleValues)),
            (snapshot) => {
                setStaff(snapshot.docs.map((entry) => {
                    const data = entry.data();
                    return {
                        id: entry.id,
                        displayName: data.displayName || data.fullName || 'Staff',
                        email: data.email || '',
                        role: data.role || 'support_admin',
                        modules: Array.isArray(data.staffModules) ? data.staffModules : [],
                        status: String(data.status || 'ACTIVE').toUpperCase(),
                        createdAt: data.createdAt,
                        lastLogin: data.lastLogin,
                    };
                }));
                setLoading(false);
            },
            (error) => {
                setLoading(false);
                setSnackbar({ open: true, message: `Unable to load staff directory: ${safeErrorMessage(error)}`, error: true });
            },
        );
        return unsubscribe;
    }, []);

    const handleRoleChange = (role: string) => {
        setFormData((previous) => ({
            ...previous,
            role,
            modules: [...(ROLE_DEFAULT_MODULES[role] || [])],
        }));
    };

    const toggleModule = (key: string) => {
        if (!allowedModules.has(key)) return;
        setFormData((previous) => ({
            ...previous,
            modules: previous.modules.includes(key)
                ? previous.modules.filter((module) => module !== key)
                : [...previous.modules, key],
        }));
    };

    const openAddDialog = () => {
        setEditMode(false);
        setSelectedStaff(null);
        setFormData({ displayName: '', email: '', role: 'support_admin', modules: [...ROLE_DEFAULT_MODULES.support_admin] });
        setDialogOpen(true);
    };

    const openEditDialog = (member: StaffMember) => {
        setEditMode(true);
        setSelectedStaff(member);
        const allowed = new Set(ROLE_ALLOWED_MODULES[member.role] || []);
        setFormData({
            displayName: member.displayName,
            email: member.email,
            role: member.role,
            modules: member.modules.filter((module) => allowed.has(module)),
        });
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.displayName.trim() || !formData.email.trim() || !formData.role) return;
        setSubmitting(true);
        try {
            if (editMode && selectedStaff) {
                const updateAccess = httpsCallable(functions, 'adminUpdateStaffAccess');
                await updateAccess({ uid: selectedStaff.id, role: formData.role, modules: formData.modules });
                setSnackbar({ open: true, message: `${formData.displayName} access updated. They must refresh their session.`, error: false });
            } else {
                const createStaff = httpsCallable(functions, 'adminCreateUser');
                await createStaff({
                    displayName: formData.displayName.trim(),
                    email: formData.email.trim().toLowerCase(),
                    role: formData.role,
                    modules: formData.modules,
                });
                setSnackbar({ open: true, message: `${formData.displayName} created. Verification and private password setup were queued.`, error: false });
            }
            setDialogOpen(false);
        } catch (error) {
            setSnackbar({ open: true, message: `Operation blocked: ${safeErrorMessage(error)}`, error: true });
        } finally {
            setSubmitting(false);
        }
    };

    const setStaffStatus = async (member: StaffMember, status: 'ACTIVE' | 'SUSPENDED') => {
        try {
            const updateStatus = httpsCallable(functions, 'adminSetStaffStatus');
            await updateStatus({ uid: member.id, status });
            setSnackbar({
                open: true,
                message: status === 'SUSPENDED'
                    ? `${member.displayName} was disabled and all refresh tokens were revoked.`
                    : `${member.displayName} was restored and must sign in again.`,
                error: false,
            });
        } catch (error) {
            setSnackbar({ open: true, message: `Status change blocked: ${safeErrorMessage(error)}`, error: true });
        }
    };

    const roleColor = (role: string) => {
        if (role.includes('finance')) return '#10b981';
        if (role.includes('hr')) return '#3b82f6';
        if (role.includes('operations') || role === 'dispatcher' || role === 'technician') return '#f59e0b';
        return 'rgba(255,255,255,0.5)';
    };

    return (
        <AdminPageFrame
            title="Staff Access Control"
            subtitle="FAIL-CLOSED, LEAST-PRIVILEGE PROVISIONING"
            lastUpdated={new Date()}
            onRefresh={() => window.location.reload()}
        >
            <Box sx={{ pb: 8 }}>
                <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
                    Founder, CEO and full Admin identities cannot be created or edited here. Customer identities cannot be converted into staff. Every operation uses an App Check-protected callable; a failed request creates no fallback record.
                </Alert>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, gap: 2, flexWrap: 'wrap' }}>
                    <Box>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                            Create individual Staff/HR and Technician accounts with server-enforced module ceilings.
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
                            {staff.filter((member) => member.status !== 'SUSPENDED').length} active · {staff.filter((member) => member.status === 'SUSPENDED').length} suspended
                        </Typography>
                    </Box>
                    <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={openAddDialog} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3 }}>
                        ADD STAFF / TECHNICIAN
                    </Button>
                </Box>

                <Paper sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                    {loading ? (
                        <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        {['STAFF MEMBER', 'ROLE', 'MODULE ACCESS', 'STATUS', 'LAST LOGIN', 'ACTIONS'].map((label) => (
                                            <TableCell key={label} align={label === 'ACTIONS' ? 'right' : 'left'} sx={{ bgcolor: '#0f172a', fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>{label}</TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {staff.map((member) => (
                                        <TableRow key={member.id} hover sx={{ opacity: member.status === 'SUSPENDED' ? 0.55 : 1 }}>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff' }}>{member.displayName}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{member.email}</Typography>
                                            </TableCell>
                                            <TableCell><Chip label={member.role.replace(/_/g, ' ').toUpperCase()} size="small" sx={{ bgcolor: alpha(roleColor(member.role), 0.15), color: roleColor(member.role), fontWeight: 900, fontSize: '0.62rem' }} /></TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 320 }}>
                                                    {member.modules.slice(0, 4).map((module) => <Chip key={module} label={`${MODULE_ACCESS.find((item) => item.key === module)?.icon || '•'} ${module}`} size="small" sx={{ height: 18, fontSize: '0.56rem', bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)' }} />)}
                                                    {member.modules.length === 0 && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>Portal-specific access only</Typography>}
                                                    {member.modules.length > 4 && <Chip label={`+${member.modules.length - 4} more`} size="small" sx={{ height: 18, fontSize: '0.56rem' }} />}
                                                </Box>
                                            </TableCell>
                                            <TableCell><Chip label={member.status} size="small" sx={{ bgcolor: alpha(member.status === 'SUSPENDED' ? '#ef4444' : '#10b981', 0.12), color: member.status === 'SUSPENDED' ? '#ef4444' : '#10b981', fontWeight: 900, fontSize: '0.62rem' }} /></TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{member.lastLogin?.toDate ? member.lastLogin.toDate().toLocaleString() : 'Never'}</TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    <Tooltip title="Edit least-privilege access"><IconButton size="small" onClick={() => openEditDialog(member)} sx={{ color: binThemeTokens.gold }}><Edit size={14} /></IconButton></Tooltip>
                                                    {member.status === 'SUSPENDED' ? (
                                                        <Tooltip title="Restore and require fresh login"><IconButton size="small" onClick={() => setStaffStatus(member, 'ACTIVE')} sx={{ color: '#10b981' }}><CheckCircle2 size={14} /></IconButton></Tooltip>
                                                    ) : (
                                                        <Tooltip title="Disable Auth and revoke sessions"><IconButton size="small" onClick={() => setStaffStatus(member, 'SUSPENDED')} sx={{ color: '#ef4444' }}><XCircle size={14} /></IconButton></Tooltip>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {staff.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.25)', fontWeight: 800 }}>NO STAFF ACCOUNTS FOUND</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>

                <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 } }}>
                    <DialogTitle sx={{ color: '#fff', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {editMode ? `Edit Access: ${selectedStaff?.displayName}` : 'Create Staff / Technician Account'}
                    </DialogTitle>
                    <DialogContent sx={{ pt: 3 }}>
                        <Alert severity="info" sx={{ mb: 3 }}>
                            No temporary password is created in this browser. New users receive separate email-verification and private password-setup links.
                        </Alert>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Full Name" value={formData.displayName} onChange={(event) => setFormData((previous) => ({ ...previous, displayName: event.target.value }))} disabled={editMode} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }} /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Email Address" type="email" value={formData.email} onChange={(event) => setFormData((previous) => ({ ...previous, email: event.target.value }))} disabled={editMode} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }} /></Grid>
                            <Grid item xs={12}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Role</InputLabel>
                                    <Select value={formData.role} onChange={(event) => handleRoleChange(event.target.value)} label="Role" sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' }, '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' } }}>
                                        {STAFF_ROLES.map((role) => <MenuItem key={role.value} value={role.value}><Box><Typography variant="body2" fontWeight={700}>{role.label}</Typography><Typography variant="caption" sx={{ color: 'rgba(0,0,0,0.55)' }}>{role.description}</Typography></Box></MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12}>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>SERVER-ENFORCED MODULE SCOPE</Typography>
                                {formData.role === 'technician' ? (
                                    <Alert severity="info" sx={{ mt: 2 }}>Technicians use the Technician portal and receive no Admin-panel modules.</Alert>
                                ) : (
                                    <>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mb: 2 }}>Only modules allowed for this role are shown. The backend rejects any out-of-scope module.</Typography>
                                        <Grid container spacing={1}>
                                            {selectableModules.map((module) => <Grid item xs={12} sm={6} md={4} key={module.key}><FormControlLabel control={<Checkbox checked={formData.modules.includes(module.key)} onChange={() => toggleModule(module.key)} size="small" sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: binThemeTokens.gold } }} />} label={<Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>{module.icon} {module.label}</Typography>} /></Grid>)}
                                        </Grid>
                                        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Selected: {formData.modules.length} / {selectableModules.length}</Typography>
                                            <Button size="small" sx={{ ml: 2, color: binThemeTokens.gold, fontSize: '0.65rem' }} onClick={() => setFormData((previous) => ({ ...previous, modules: selectableModules.map((module) => module.key) }))}>SELECT ROLE MAXIMUM</Button>
                                            <Button size="small" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }} onClick={() => setFormData((previous) => ({ ...previous, modules: [] }))}>CLEAR</Button>
                                        </Box>
                                    </>
                                )}
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Button disabled={submitting} onClick={() => setDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button variant="contained" onClick={handleSubmit} disabled={submitting || !formData.displayName.trim() || !formData.email.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>
                            {submitting ? 'PROCESSING...' : editMode ? 'UPDATE ACCESS' : 'CREATE & SEND INVITATION'}
                        </Button>
                    </DialogActions>
                </Dialog>

                {snackbar.open && <Alert severity={snackbar.error ? 'error' : 'success'} onClose={() => setSnackbar((previous) => ({ ...previous, open: false }))} sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, fontWeight: 900, borderRadius: 3, minWidth: 320, maxWidth: 520 }}>{snackbar.message}</Alert>}
            </Box>
        </AdminPageFrame>
    );
}
