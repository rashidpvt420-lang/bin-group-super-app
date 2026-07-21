// apps/admin-panel/src/pages/admin/StaffAccessPage.tsx
// Founder/Admin provisions staff accounts through the fail-closed callable only.

import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    alpha,
} from '@mui/material';
import { CheckCircle2, Edit, UserPlus, XCircle } from 'lucide-react';
import {
    collection,
    db,
    doc,
    functions,
    httpsCallable,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';
import {
    MODULE_OPTIONS,
    PROVISIONABLE_STAFF_ROLE_OPTIONS,
    PROVISIONABLE_STAFF_ROLES,
    ROLE_DEFAULT_MODULES,
    type StaffModule,
} from '../../security/staffAccessPolicy';

interface StaffMember {
    id: string;
    displayName: string;
    email: string;
    role: string;
    modules: StaffModule[];
    status: string;
    createdAt?: any;
    lastLogin?: any;
}

interface StaffForm {
    displayName: string;
    email: string;
    role: string;
    modules: StaffModule[];
}

const initialForm = (): StaffForm => ({
    displayName: '',
    email: '',
    role: 'support_admin',
    modules: [...(ROLE_DEFAULT_MODULES.support_admin || [])],
});

const callableErrorMessage = (error: any) => {
    const raw = String(error?.details || error?.message || 'Secure staff provisioning failed.');
    return raw.replace(/^FirebaseError:\s*/i, '').replace(/^functions\//i, '');
};

export default function StaffAccessPage() {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', error: false });
    const [formData, setFormData] = useState<StaffForm>(initialForm);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            query(collection(db, 'users'), where('role', 'in', PROVISIONABLE_STAFF_ROLES)),
            (snapshot) => {
                const list: StaffMember[] = snapshot.docs.map((document) => {
                    const data = document.data();
                    return {
                        id: document.id,
                        displayName: data.displayName || data.name || 'Staff',
                        email: data.email || '',
                        role: data.role || 'support_admin',
                        modules: Array.isArray(data.staffModules) ? data.staffModules : ROLE_DEFAULT_MODULES[data.role] || [],
                        status: String(data.status || 'active').toUpperCase(),
                        createdAt: data.createdAt,
                        lastLogin: data.lastLogin,
                    };
                });
                setStaff(list);
                setLoading(false);
            },
            (error) => {
                setLoading(false);
                setSnackbar({ open: true, message: callableErrorMessage(error), error: true });
            },
        );
        return () => unsubscribe();
    }, []);

    const handleRoleChange = (role: string) => {
        setFormData((previous) => ({
            ...previous,
            role,
            modules: [...(ROLE_DEFAULT_MODULES[role] || [])],
        }));
    };

    const toggleModule = (key: StaffModule) => {
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
        setFormData(initialForm());
        setDialogOpen(true);
    };

    const openEditDialog = (member: StaffMember) => {
        setEditMode(true);
        setSelectedStaff(member);
        setFormData({
            displayName: member.displayName,
            email: member.email,
            role: member.role,
            modules: [...member.modules],
        });
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.displayName.trim() || !formData.email.trim() || !formData.role) return;
        setSubmitting(true);
        try {
            const provisionStaff = httpsCallable(functions, 'adminCreateUser');
            const response: any = await provisionStaff({
                displayName: formData.displayName.trim(),
                email: formData.email.trim().toLowerCase(),
                role: formData.role,
                modules: formData.role === 'technician' ? [] : formData.modules,
                sendInvitation: !editMode,
                resendInvitation: false,
            });
            setSnackbar({
                open: true,
                message: String(response?.data?.message || (editMode
                    ? `${formData.displayName} access updated. The user must sign in again.`
                    : `${formData.displayName} created. A secure invitation was queued.`)),
                error: false,
            });
            setDialogOpen(false);
        } catch (error: any) {
            setSnackbar({ open: true, message: callableErrorMessage(error), error: true });
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevokeAccess = async (member: StaffMember) => {
        try {
            await updateDoc(doc(db, 'users', member.id), {
                status: 'suspended',
                suspendedAt: serverTimestamp(),
                suspendedBy: 'admin',
            });
            setSnackbar({ open: true, message: `${member.displayName} access suspended. Active sessions will be revoked.`, error: false });
        } catch (error) {
            setSnackbar({ open: true, message: callableErrorMessage(error), error: true });
        }
    };

    const handleRestoreAccess = async (member: StaffMember) => {
        try {
            await updateDoc(doc(db, 'users', member.id), {
                status: 'active',
                restoredAt: serverTimestamp(),
            });
            setSnackbar({ open: true, message: `${member.displayName} access restored. They must sign in again.`, error: false });
        } catch (error) {
            setSnackbar({ open: true, message: callableErrorMessage(error), error: true });
        }
    };

    const getRoleColor = (role: string) => {
        if (role === 'technician') return '#06b6d4';
        if (role.includes('finance')) return '#10b981';
        if (role.includes('hr')) return '#3b82f6';
        if (role.includes('operations') || role === 'dispatcher') return '#f59e0b';
        return 'rgba(255,255,255,0.4)';
    };

    return (
        <AdminPageFrame
            title="Staff Access Control"
            subtitle="FAIL-CLOSED ROLE AND MODULE PROVISIONING"
            lastUpdated={new Date()}
            onRefresh={() => window.location.reload()}
        >
            <Box sx={{ pb: 8 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                    <Box>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                            Create Staff/HR and Technician identities through the protected callable. Customer and Founder accounts cannot be converted here.
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                            {staff.filter((member) => member.status !== 'SUSPENDED').length} active staff · {staff.filter((member) => member.status === 'SUSPENDED').length} suspended
                        </Typography>
                    </Box>
                    <Button
                        variant="contained"
                        startIcon={<UserPlus size={18} />}
                        onClick={openAddDialog}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3 }}
                    >
                        ADD STAFF MEMBER
                    </Button>
                </Box>

                <Paper sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                    {loading ? (
                        <Box sx={{ p: 6, textAlign: 'center' }}>
                            <CircularProgress sx={{ color: binThemeTokens.gold }} />
                        </Box>
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>STAFF MEMBER</TableCell>
                                        <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>ROLE</TableCell>
                                        <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>MODULE ACCESS</TableCell>
                                        <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>STATUS</TableCell>
                                        <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>LAST LOGIN</TableCell>
                                        <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 900, color: 'rgba(255,255,255,0.5)' }} align="right">ACTIONS</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {staff.map((member) => (
                                        <TableRow key={member.id} hover sx={{ opacity: member.status === 'SUSPENDED' ? 0.5 : 1 }}>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff' }}>{member.displayName}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{member.email}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={member.role.replace(/_/g, ' ').toUpperCase()}
                                                    size="small"
                                                    sx={{ bgcolor: alpha(getRoleColor(member.role), 0.15), color: getRoleColor(member.role), fontWeight: 900, fontSize: '0.6rem' }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 300 }}>
                                                    {member.role === 'technician' && (
                                                        <Chip label="TECHNICIAN PORTAL" size="small" sx={{ height: 18, fontSize: '0.55rem', bgcolor: alpha('#06b6d4', 0.12), color: '#06b6d4' }} />
                                                    )}
                                                    {member.modules.slice(0, 4).map((module) => {
                                                        const option = MODULE_OPTIONS.find((item) => item.key === module);
                                                        return (
                                                            <Chip key={module} label={`${option?.icon || ''} ${option?.label || module}`} size="small" sx={{ height: 18, fontSize: '0.55rem', bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }} />
                                                        );
                                                    })}
                                                    {member.modules.length > 4 && (
                                                        <Chip label={`+${member.modules.length - 4} more`} size="small" sx={{ height: 18, fontSize: '0.55rem', bgcolor: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)' }} />
                                                    )}
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={member.status}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: member.status === 'ACTIVE' ? alpha('#10b981', 0.1) : alpha('#ef4444', 0.1),
                                                        color: member.status === 'ACTIVE' ? '#10b981' : '#ef4444',
                                                        fontWeight: 900,
                                                        fontSize: '0.6rem',
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                                                {member.lastLogin?.toDate ? member.lastLogin.toDate().toLocaleDateString() : 'Never'}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    <Tooltip title="Edit Access">
                                                        <IconButton size="small" onClick={() => openEditDialog(member)} sx={{ color: binThemeTokens.gold }}>
                                                            <Edit size={14} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {member.status === 'ACTIVE' ? (
                                                        <Tooltip title="Suspend Access">
                                                            <IconButton size="small" onClick={() => handleRevokeAccess(member)} sx={{ color: '#ef4444' }}>
                                                                <XCircle size={14} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    ) : (
                                                        <Tooltip title="Restore Access">
                                                            <IconButton size="small" onClick={() => handleRestoreAccess(member)} sx={{ color: '#10b981' }}>
                                                                <CheckCircle2 size={14} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {staff.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                                                NO STAFF MEMBERS FOUND
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>

                <Dialog
                    open={dialogOpen}
                    onClose={() => !submitting && setDialogOpen(false)}
                    maxWidth="md"
                    fullWidth
                    PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 } }}
                >
                    <DialogTitle sx={{ color: '#fff', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {editMode ? `Edit Access: ${selectedStaff?.displayName}` : 'Add New Staff Member'}
                    </DialogTitle>
                    <DialogContent sx={{ pt: 3 }}>
                        <Alert severity="info" sx={{ mb: 3 }}>
                            New users receive separate email-verification and private-password setup links. No temporary password is created in this browser, and provisioning failures create no fallback record.
                        </Alert>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Full Name"
                                    value={formData.displayName}
                                    onChange={(event) => setFormData((previous) => ({ ...previous, displayName: event.target.value }))}
                                    disabled={editMode}
                                    sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Work Email Address"
                                    type="email"
                                    value={formData.email}
                                    onChange={(event) => setFormData((previous) => ({ ...previous, email: event.target.value }))}
                                    disabled={editMode}
                                    helperText="Use a dedicated work email that is not already an Owner, Tenant, Broker or Founder identity."
                                    sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Role</InputLabel>
                                    <Select
                                        value={formData.role}
                                        onChange={(event) => handleRoleChange(String(event.target.value))}
                                        label="Role"
                                        sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' }, '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' } }}
                                    >
                                        {PROVISIONABLE_STAFF_ROLE_OPTIONS.map((role) => (
                                            <MenuItem key={role.value} value={role.value}>
                                                <Box>
                                                    <Typography variant="body2" fontWeight="700">{role.label}</Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(0,0,0,0.5)' }}>{role.description}</Typography>
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12}>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                                {formData.role === 'technician' ? (
                                    <Alert severity="info">
                                        Technician accounts use the Technician Portal. Dispatch readiness, device registration, GPS and evidence permissions are controlled by Technician workflows rather than Admin modules.
                                    </Alert>
                                ) : (
                                    <>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>MODULE ACCESS CONTROL</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mb: 2 }}>
                                            These exact modules are persisted to the profile, access registry and Firebase Auth claims. Unselected routes are hidden and denied.
                                        </Typography>
                                        <Grid container spacing={1}>
                                            {MODULE_OPTIONS.map((module) => (
                                                <Grid item xs={12} sm={6} md={4} key={module.key}>
                                                    <FormControlLabel
                                                        control={(
                                                            <Checkbox
                                                                checked={formData.modules.includes(module.key)}
                                                                onChange={() => toggleModule(module.key)}
                                                                size="small"
                                                                sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: binThemeTokens.gold } }}
                                                            />
                                                        )}
                                                        label={(
                                                            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>
                                                                {module.icon} {module.label}
                                                            </Typography>
                                                        )}
                                                    />
                                                </Grid>
                                            ))}
                                        </Grid>
                                        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                                                Selected: {formData.modules.length} / {MODULE_OPTIONS.length} modules
                                            </Typography>
                                            <Button
                                                size="small"
                                                sx={{ ml: 2, color: binThemeTokens.gold, fontSize: '0.65rem' }}
                                                onClick={() => setFormData((previous) => ({ ...previous, modules: MODULE_OPTIONS.map((module) => module.key) }))}
                                            >SELECT ALL</Button>
                                            <Button
                                                size="small"
                                                sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}
                                                onClick={() => setFormData((previous) => ({ ...previous, modules: [] }))}
                                            >CLEAR</Button>
                                        </Box>
                                    </>
                                )}
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Button disabled={submitting} onClick={() => setDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button
                            variant="contained"
                            onClick={handleSubmit}
                            disabled={submitting || !formData.displayName.trim() || !formData.email.trim()}
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}
                        >
                            {submitting ? 'SAVING...' : editMode ? 'UPDATE ACCESS' : 'CREATE & SEND SECURE INVITATION'}
                        </Button>
                    </DialogActions>
                </Dialog>

                {snackbar.open && (
                    <Alert
                        severity={snackbar.error ? 'error' : 'success'}
                        onClose={() => setSnackbar((previous) => ({ ...previous, open: false }))}
                        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, fontWeight: 900, borderRadius: 3, minWidth: 300, maxWidth: 560 }}
                    >
                        {snackbar.message}
                    </Alert>
                )}
            </Box>
        </AdminPageFrame>
    );
}
