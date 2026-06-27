// apps/admin-panel/src/pages/admin/StaffAccessPage.tsx
// Admin creates staff accounts with role-based module access control

import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Grid, Stack, Button, TextField,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    FormControl, InputLabel, Select, MenuItem, Checkbox,
    FormGroup, FormControlLabel, Alert, CircularProgress,
    alpha, Divider, Tooltip, IconButton
} from '@mui/material';
import { UserPlus, Shield, Edit, Trash2, Eye, CheckCircle2, XCircle, Key } from 'lucide-react';
import {
    db, collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
    query, where, onSnapshot, serverTimestamp
} from '../../lib/firebase';
import { auth, functions, httpsCallable } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';

const STAFF_ROLES = [
    { value: 'admin', label: 'Admin (Full Access)', description: 'Full system access' },
    { value: 'operations_admin', label: 'Operations Admin', description: 'Tickets, technicians, map' },
    { value: 'finance_admin', label: 'Finance Admin', description: 'Financials, payments, payroll' },
    { value: 'hr_admin', label: 'HR Admin', description: 'Staff management, technician approvals' },
    { value: 'support_admin', label: 'Support Admin', description: 'Tenants, complaints, messages' },
    { value: 'account_manager', label: 'Account Manager', description: 'Owners, contracts, documents' },
    { value: 'dispatcher', label: 'Dispatcher', description: 'Ticket assignment, duty command' },
    { value: 'manager', label: 'Manager', description: 'Reports and analytics' },
];

const MODULE_ACCESS = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'owners', label: 'Owner Management', icon: '🏠' },
    { key: 'tenants', label: 'Tenant Management', icon: '👤' },
    { key: 'tickets', label: 'Tickets / Maintenance', icon: '🔧' },
    { key: 'technicians', label: 'Technician Management', icon: '👷' },
    { key: 'financials', label: 'Financials & Payroll', icon: '💰' },
    { key: 'transactions', label: 'Transactions', icon: '💳' },
    { key: 'broker', label: 'Broker Management', icon: '🤝' },
    { key: 'documents', label: 'Document Vault', icon: '📁' },
    { key: 'properties', label: 'Properties & Passports', icon: '🏢' },
    { key: 'reports', label: 'Reports & Analytics', icon: '📈' },
    { key: 'audit', label: 'Audit Log', icon: '🔍' },
    { key: 'compliance', label: 'Compliance', icon: '✅' },
    { key: 'map', label: 'Live Map', icon: '🗺️' },
    { key: 'sos', label: 'SOS Feed', icon: '🚨' },
    { key: 'settings', label: 'System Settings', icon: '⚙️' },
    { key: 'hr', label: 'HR Management', icon: '👥' },
    { key: 'pricing', label: 'Pricing Matrix', icon: '💲' },
];

const ROLE_DEFAULT_MODULES: Record<string, string[]> = {
    admin: MODULE_ACCESS.map(m => m.key),
    operations_admin: ['dashboard', 'tickets', 'technicians', 'map', 'sos', 'properties'],
    finance_admin: ['dashboard', 'financials', 'transactions', 'reports'],
    hr_admin: ['dashboard', 'technicians', 'hr'],
    support_admin: ['dashboard', 'tenants', 'tickets', 'sos'],
    account_manager: ['dashboard', 'owners', 'contracts', 'documents', 'properties'],
    dispatcher: ['dashboard', 'tickets', 'technicians', 'map'],
    manager: ['dashboard', 'reports', 'audit', 'owners', 'tenants'],
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

export default function StaffAccessPage() {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', error: false });
    const [deleteConfirm, setDeleteConfirm] = useState<StaffMember | null>(null);

    const [formData, setFormData] = useState({
        displayName: '',
        email: '',
        role: 'support_admin',
        modules: ROLE_DEFAULT_MODULES['support_admin'],
        tempPassword: '',
    });

    useEffect(() => {
        const ADMIN_ROLES = [
            'admin', 'super_admin', 'ceo', 'manager', 'operations_admin',
            'finance_admin', 'hr_admin', 'support_admin', 'hr_manager', 'hr_staff',
            'finance_staff', 'account_manager', 'dispatcher', 'operations_manager'
        ];

        const unsub = onSnapshot(
            query(collection(db, 'users'), where('role', 'in', ADMIN_ROLES)),
            (snap) => {
                const list: StaffMember[] = snap.docs.map(d => ({
                    id: d.id,
                    displayName: d.data().displayName || d.data().name || 'Staff',
                    email: d.data().email || '',
                    role: d.data().role || 'support_admin',
                    modules: d.data().staffModules || ROLE_DEFAULT_MODULES[d.data().role] || [],
                    status: d.data().status || 'ACTIVE',
                    createdAt: d.data().createdAt,
                    lastLogin: d.data().lastLogin,
                }));
                setStaff(list);
                setLoading(false);
            },
            () => setLoading(false)
        );
        return () => unsub();
    }, []);

    const handleRoleChange = (role: string) => {
        setFormData(prev => ({
            ...prev,
            role,
            modules: ROLE_DEFAULT_MODULES[role] || [],
        }));
    };

    const toggleModule = (key: string) => {
        setFormData(prev => ({
            ...prev,
            modules: prev.modules.includes(key)
                ? prev.modules.filter(m => m !== key)
                : [...prev.modules, key],
        }));
    };

    const openAddDialog = () => {
        setEditMode(false);
        setSelectedStaff(null);
        setFormData({ displayName: '', email: '', role: 'support_admin', modules: ROLE_DEFAULT_MODULES['support_admin'], tempPassword: '' });
        setDialogOpen(true);
    };

    const openEditDialog = (member: StaffMember) => {
        setEditMode(true);
        setSelectedStaff(member);
        setFormData({
            displayName: member.displayName,
            email: member.email,
            role: member.role,
            modules: member.modules,
            tempPassword: '',
        });
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.displayName || !formData.email || !formData.role) return;
        setSubmitting(true);
        try {
            if (editMode && selectedStaff) {
                // Update existing staff member's role + modules
                await updateDoc(doc(db, 'users', selectedStaff.id), {
                    role: formData.role,
                    staffModules: formData.modules,
                    updatedAt: serverTimestamp(),
                });
                setSnackbar({ open: true, message: `${formData.displayName} updated successfully.`, error: false });
            } else {
                // Attempt to create via Cloud Function if available, fallback to Firestore only
                try {
                    const createStaff = httpsCallable(functions, 'adminCreateUser');
                    await createStaff({
                        displayName: formData.displayName,
                        email: formData.email,
                        role: formData.role,
                        modules: formData.modules,
                        tempPassword: formData.tempPassword || `BIN@${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
                    });
                    setSnackbar({ open: true, message: `${formData.displayName} created. They will receive an email to set their password.`, error: false });
                } catch (fnErr: any) {
                    // Fallback: create Firestore record only (admin must create Firebase Auth manually)
                    const docRef = doc(collection(db, 'users'));
                    await setDoc(docRef, {
                        displayName: formData.displayName,
                        email: formData.email,
                        role: formData.role,
                        staffModules: formData.modules,
                        status: 'PENDING_LOGIN',
                        createdAt: serverTimestamp(),
                        createdBy: 'admin',
                    });
                    setSnackbar({ open: true, message: `Staff record created for ${formData.email}. Please create their Firebase Auth account manually.`, error: false });
                }
            }
            setDialogOpen(false);
        } catch (err) {
            setSnackbar({ open: true, message: 'Failed to save staff member. Check permissions.', error: true });
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevokeAccess = async (member: StaffMember) => {
        try {
            await updateDoc(doc(db, 'users', member.id), {
                status: 'SUSPENDED',
                suspendedAt: serverTimestamp(),
                suspendedBy: 'admin',
            });
            setSnackbar({ open: true, message: `${member.displayName} access suspended.`, error: false });
        } catch {
            setSnackbar({ open: true, message: 'Failed to suspend access.', error: true });
        }
    };

    const handleRestoreAccess = async (member: StaffMember) => {
        try {
            await updateDoc(doc(db, 'users', member.id), {
                status: 'ACTIVE',
                restoredAt: serverTimestamp(),
            });
            setSnackbar({ open: true, message: `${member.displayName} access restored.`, error: false });
        } catch {
            setSnackbar({ open: true, message: 'Failed to restore access.', error: true });
        }
    };

    const getRoleColor = (role: string) => {
        if (role === 'admin' || role === 'super_admin' || role === 'ceo') return binThemeTokens.gold;
        if (role.includes('finance')) return '#10b981';
        if (role.includes('hr')) return '#3b82f6';
        if (role.includes('operations') || role === 'dispatcher') return '#f59e0b';
        return 'rgba(255,255,255,0.4)';
    };

    return (
        <AdminPageFrame
            title="Staff Access Control"
            subtitle="ROLE-BASED MODULE PERMISSIONS"
            lastUpdated={new Date()}
            onRefresh={() => window.location.reload()}
        >
            <Box sx={{ pb: 8 }}>
                {/* Header Actions */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                    <Box>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                            Manage staff accounts and control which modules each staff member can access.
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                            {staff.filter(s => s.status !== 'SUSPENDED').length} active staff · {staff.filter(s => s.status === 'SUSPENDED').length} suspended
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

                {/* Staff Table */}
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
                                                    {member.modules.slice(0, 4).map(m => (
                                                        <Chip key={m} label={MODULE_ACCESS.find(ma => ma.key === m)?.icon + ' ' + m} size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }} />
                                                    ))}
                                                    {member.modules.length > 4 && (
                                                        <Chip label={`+${member.modules.length - 4} more`} size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)' }} />
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
                                                        fontWeight: 900, fontSize: '0.6rem'
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

                {/* Add/Edit Staff Dialog */}
                <Dialog
                    open={dialogOpen}
                    onClose={() => setDialogOpen(false)}
                    maxWidth="md"
                    fullWidth
                    PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 } }}
                >
                    <DialogTitle sx={{ color: '#fff', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {editMode ? `Edit Access: ${selectedStaff?.displayName}` : 'Add New Staff Member'}
                    </DialogTitle>
                    <DialogContent sx={{ pt: 3 }}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="Full Name" value={formData.displayName}
                                    onChange={e => setFormData(p => ({ ...p, displayName: e.target.value }))}
                                    disabled={editMode}
                                    sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="Email Address" type="email" value={formData.email}
                                    onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                                    disabled={editMode}
                                    sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                                />
                            </Grid>
                            {!editMode && (
                                <Grid item xs={12} md={6}>
                                    <TextField
                                        fullWidth label="Temporary Password (optional)" type="password" value={formData.tempPassword}
                                        onChange={e => setFormData(p => ({ ...p, tempPassword: e.target.value }))}
                                        placeholder="Leave blank for auto-generated"
                                        sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                                    />
                                </Grid>
                            )}
                            <Grid item xs={12} md={editMode ? 12 : 6}>
                                <FormControl fullWidth>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Role</InputLabel>
                                    <Select
                                        value={formData.role}
                                        onChange={e => handleRoleChange(e.target.value)}
                                        label="Role"
                                        sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' }, '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' } }}
                                    >
                                        {STAFF_ROLES.map(r => (
                                            <MenuItem key={r.value} value={r.value}>
                                                <Box>
                                                    <Typography variant="body2" fontWeight="700">{r.label}</Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(0,0,0,0.5)' }}>{r.description}</Typography>
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12}>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>MODULE ACCESS CONTROL</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mb: 2 }}>
                                    Select which modules this staff member can access. Role defaults are pre-selected.
                                </Typography>
                                <Grid container spacing={1}>
                                    {MODULE_ACCESS.map(module => (
                                        <Grid item xs={12} sm={6} md={4} key={module.key}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked={formData.modules.includes(module.key)}
                                                        onChange={() => toggleModule(module.key)}
                                                        size="small"
                                                        sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: binThemeTokens.gold } }}
                                                    />
                                                }
                                                label={
                                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>
                                                        {module.icon} {module.label}
                                                    </Typography>
                                                }
                                            />
                                        </Grid>
                                    ))}
                                </Grid>
                                <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                                        Selected: {formData.modules.length} / {MODULE_ACCESS.length} modules
                                    </Typography>
                                    <Button
                                        size="small"
                                        sx={{ ml: 2, color: binThemeTokens.gold, fontSize: '0.65rem' }}
                                        onClick={() => setFormData(p => ({ ...p, modules: MODULE_ACCESS.map(m => m.key) }))}
                                    >SELECT ALL</Button>
                                    <Button
                                        size="small"
                                        sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}
                                        onClick={() => setFormData(p => ({ ...p, modules: [] }))}
                                    >CLEAR</Button>
                                </Box>
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Button onClick={() => setDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button
                            variant="contained"
                            onClick={handleSubmit}
                            disabled={submitting || !formData.displayName || !formData.email}
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}
                        >
                            {submitting ? 'SAVING...' : editMode ? 'UPDATE ACCESS' : 'CREATE STAFF MEMBER'}
                        </Button>
                    </DialogActions>
                </Dialog>

                {/* Snackbar */}
                {snackbar.open && (
                    <Alert
                        severity={snackbar.error ? 'error' : 'success'}
                        onClose={() => setSnackbar(p => ({ ...p, open: false }))}
                        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, fontWeight: 900, borderRadius: 3, minWidth: 300 }}
                    >
                        {snackbar.message}
                    </Alert>
                )}
            </Box>
        </AdminPageFrame>
    );
}
