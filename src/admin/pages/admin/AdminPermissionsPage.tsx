/**
 * Phase 10 — Role-Based Limited Access
 * Route: /admin/permissions
 * Manages granular permissions for staff members
 */
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Stack, Chip, Button, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, InputAdornment, Alert, IconButton, Tooltip, Dialog,
    DialogTitle, DialogContent, DialogActions, FormControl, InputLabel,
    Select, MenuItem, Divider, Switch, FormControlLabel, Checkbox, Grid
} from '@mui/material';
import { Shield, Search, Plus, Edit2, Trash2, CheckCircle2, XCircle, User, Info } from 'lucide-react';
import {
    db, collection, query, where, onSnapshot, addDoc, updateDoc, doc,
    serverTimestamp, getDocs
} from '../../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';

const ADMIN_ROLES = [
    { value: 'admin', label: 'Admin (Full Access)', color: '#ef4444' },
    { value: 'operations_admin', label: 'Operations Admin', color: '#f97316' },
    { value: 'finance_admin', label: 'Finance Admin', color: '#f59e0b' },
    { value: 'hr_admin', label: 'HR Admin', color: '#8b5cf6' },
    { value: 'support_admin', label: 'Support Admin', color: '#3b82f6' },
    { value: 'manager', label: 'Manager', color: '#10b981' },
    { value: 'ceo', label: 'CEO (Super Admin)', color: '#C6A75E' },
];

const PERMISSIONS_LIST = [
    { key: 'canViewPayments', label: 'View Payments', desc: 'View transaction logs and payout history.' },
    { key: 'canVerifyPayments', label: 'Verify Payments', desc: 'Mark payments as verified/captured.' },
    { key: 'canManageTenants', label: 'Manage Tenants', desc: 'Full access to tenant profiles and documents.' },
    { key: 'canManageTechnicians', label: 'Manage Technicians', desc: 'Manage technician status, zones, and skills.' },
    { key: 'canManageContracts', label: 'Manage Contracts', desc: 'Create and edit property management contracts.' },
    { key: 'canViewFinancials', label: 'View Financials', desc: 'High-level financial overview and revenue charts.' },
    { key: 'canEditPricing', label: 'Edit Pricing', desc: 'Modify the 2026 Sovereign Pricing Matrix.' },
    { key: 'canManageCompanyProfile', label: 'Manage Company Profile', desc: 'Update corporate identity and public content.' },
    { key: 'canDispatchJobs', label: 'Dispatch Jobs', desc: 'Assign and reassign maintenance missions.' },
    { key: 'canViewAuditLogs', label: 'View Audit Logs', desc: 'Access the Institutional Audit Shield.' },
    { key: 'canExportReports', label: 'Export Reports', desc: 'Download CSV/PDF reports for all modules.' },
];

// Default permissions for roles to speed up onboarding
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    ceo: PERMISSIONS_LIST.map(p => p.key),
    admin: PERMISSIONS_LIST.map(p => p.key),
    operations_admin: ['canManageTenants', 'canManageTechnicians', 'canDispatchJobs', 'canExportReports'],
    finance_admin: ['canViewPayments', 'canVerifyPayments', 'canViewFinancials', 'canExportReports'],
    hr_admin: ['canManageTechnicians', 'canExportReports'],
    support_admin: ['canManageTenants', 'canDispatchJobs'],
    manager: ['canManageTenants', 'canManageTechnicians', 'canManageContracts', 'canDispatchJobs'],
};

export default function AdminPermissionsPage() {
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Form state
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formRole, setFormRole] = useState('support_admin');
    const [formActive, setFormActive] = useState(true);
    const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({});

    const ADMIN_ROLE_VALUES = ADMIN_ROLES.map(r => r.value);

    useEffect(() => {
        const q = query(collection(db, 'users'), where('role', 'in', ADMIN_ROLE_VALUES));
        const unsub = onSnapshot(q, (snap) => {
            setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            setError(err.message);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const filtered = staff.filter(s =>
        !search || [s.displayName, s.email, s.role].some(v => v?.toLowerCase().includes(search.toLowerCase()))
    );

    const openAdd = () => {
        setEditingUser(null);
        setFormName(''); setFormEmail(''); setFormRole('support_admin'); setFormActive(true);
        // Default permissions for support_admin
        const defaults: Record<string, boolean> = {};
        DEFAULT_ROLE_PERMISSIONS.support_admin.forEach(p => defaults[p] = true);
        setFormPermissions(defaults);
        setSaveError('');
        setDialogOpen(true);
    };

    const openEdit = (member: any) => {
        setEditingUser(member);
        setFormName(member.displayName || member.name || '');
        setFormEmail(member.email || '');
        setFormRole(member.role || 'support_admin');
        setFormActive(member.status !== 'INACTIVE');
        setFormPermissions(member.permissions || {});
        setSaveError('');
        setDialogOpen(true);
    };

    const handleRoleChange = (role: string) => {
        setFormRole(role);
        // Auto-fill defaults
        const defaults: Record<string, boolean> = {};
        (DEFAULT_ROLE_PERMISSIONS[role] || []).forEach(p => defaults[p] = true);
        setFormPermissions(defaults);
    };

    const togglePermission = (key: string) => {
        setFormPermissions(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const handleSave = async () => {
        if (!formName || !formEmail) { setSaveError('Name and email are required.'); return; }
        setSaving(true); setSaveError('');
        try {
            if (editingUser) {
                await updateDoc(doc(db, 'users', editingUser.id), {
                    displayName: formName,
                    role: formRole,
                    permissions: formPermissions,
                    status: formActive ? 'ACTIVE' : 'INACTIVE',
                    updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(db, 'users'), {
                    displayName: formName,
                    email: formEmail.toLowerCase().trim(),
                    role: formRole,
                    permissions: formPermissions,
                    status: formActive ? 'ACTIVE' : 'INACTIVE',
                    onboardingComplete: true,
                    isStaff: true,
                    createdAt: serverTimestamp(),
                });
            }
            setDialogOpen(false);
        } catch (err: any) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async (member: any) => {
        await updateDoc(doc(db, 'users', member.id), {
            status: member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            updatedAt: serverTimestamp(),
        });
    };

    const cellSx = { color: 'rgba(255,255,255,0.75)', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.82rem' };
    const headerSx = { color: '#C6A75E', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.75rem', textTransform: 'uppercase' as const };

    return (
        <AdminPageFrame
            title="Sovereign Access Control"
            breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Permissions' }]}
        >
            {/* Info Banner */}
            <Alert severity="info" icon={<Shield size={18} />}
                sx={{ mb: 4, bgcolor: 'rgba(198, 167, 94, 0.05)', color: '#C6A75E', border: '1px solid rgba(198, 167, 94, 0.2)' }}>
                Institutional Permission Model: Staff roles provide baseline access, while granular permissions grant specific operational capabilities.
            </Alert>

            {/* Toolbar */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }} alignItems="center">
                <TextField
                    size="small" placeholder="Search staff by name, email, role..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} color="rgba(255,255,255,0.4)" /></InputAdornment> }}
                    sx={{ flex: 1, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }, '& .MuiInputBase-input': { color: '#FFF' } }}
                />
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={openAdd}
                    sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 950, borderRadius: 2 }}>
                    Add Staff Member
                </Button>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress sx={{ color: '#C6A75E' }} />
                </Box>
            ) : filtered.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
                    <Shield size={48} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 12px' }} />
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.4)' }}>No admin staff found</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.25)', mt: 1 }}>
                        Add your first staff member using the button above.
                    </Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                {['Staff Member', 'Role', 'Capabilities', 'Status', 'Actions'].map(h => (
                                    <TableCell key={h} sx={headerSx}>{h}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map(member => {
                                const roleCfg = ADMIN_ROLES.find(r => r.value === member.role) || ADMIN_ROLES[3];
                                const perms = Object.entries(member.permissions || {})
                                    .filter(([_, val]) => val)
                                    .map(([key, _]) => PERMISSIONS_LIST.find(p => p.key === key)?.label || key);
                                    
                                return (
                                    <TableRow key={member.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                        <TableCell sx={cellSx}>
                                            <Stack direction="row" spacing={1.5} alignItems="center">
                                                <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: `${roleCfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: roleCfg.color }}>
                                                    <User size={16} />
                                                </Box>
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: '#FFF', fontWeight: 800, display: 'block' }}>{member.displayName || member.name || '—'}</Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{member.email}</Typography>
                                                </Box>
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            <Chip label={roleCfg.label} size="small"
                                                sx={{ bgcolor: `${roleCfg.color}18`, color: roleCfg.color, fontWeight: 900, fontSize: '0.65rem' }} />
                                        </TableCell>
                                        <TableCell sx={{ ...cellSx, maxWidth: 350 }}>
                                            <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                                                {perms.length === 0 ? (
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)' }}>No specific permissions</Typography>
                                                ) : perms.slice(0, 4).map((p, i) => (
                                                    <Chip key={i} label={p} size="small"
                                                        sx={{ bgcolor: 'rgba(198,167,94,0.06)', border: '1px solid rgba(198,167,94,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.6rem', height: 20 }} />
                                                ))}
                                                {perms.length > 4 && (
                                                    <Chip label={`+${perms.length - 4} more`} size="small"
                                                        sx={{ bgcolor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', height: 20 }} />
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            <Chip
                                                label={member.status || 'ACTIVE'}
                                                size="small"
                                                onClick={() => handleToggleStatus(member)}
                                                sx={{
                                                    bgcolor: member.status !== 'INACTIVE' ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
                                                    color: member.status !== 'INACTIVE' ? '#4ade80' : '#ef4444',
                                                    fontWeight: 900, cursor: 'pointer', fontSize: '0.65rem'
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell sx={cellSx}>
                                            <Tooltip title="Configure Access">
                                                <IconButton size="small" onClick={() => openEdit(member)}
                                                    sx={{ color: '#C6A75E', '&:hover': { bgcolor: 'rgba(198,167,94,0.1)' } }}>
                                                    <Edit2 size={15} />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Access Configuration Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth
                PaperProps={{ sx: { bgcolor: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, backgroundImage: 'none' } }}>
                <DialogTitle sx={{ color: '#FFF', fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)', py: 3 }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Shield size={24} color="#C6A75E" />
                        <Typography variant="h5" sx={{ fontWeight: 950, letterSpacing: -1 }}>
                            {editingUser ? 'Secure Identity Configuration' : 'Institutional Staff Onboarding'}
                        </Typography>
                    </Stack>
                </DialogTitle>
                <DialogContent sx={{ mt: 3 }}>
                    <Grid container spacing={4}>
                        <Grid item xs={12} md={5}>
                            <Typography variant="overline" sx={{ color: '#C6A75E', fontWeight: 950, mb: 2, display: 'block' }}>CORE IDENTITY</Typography>
                            <Stack spacing={2.5}>
                                {saveError && <Alert severity="error">{saveError}</Alert>}
                                <TextField fullWidth label="Full Institutional Name" value={formName} onChange={e => setFormName(e.target.value)}
                                    variant="filled"
                                    sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, '& .MuiFilledInput-root': { bgcolor: 'transparent' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiInputBase-input': { color: '#FFF', fontWeight: 700 } }} />
                                {!editingUser && (
                                    <TextField fullWidth label="Corporate Email Address" type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                                        variant="filled"
                                        sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, '& .MuiFilledInput-root': { bgcolor: 'transparent' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiInputBase-input': { color: '#FFF', fontWeight: 700 } }} />
                                )}
                                <FormControl fullWidth variant="filled" sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Sovereign Role</InputLabel>
                                    <Select value={formRole} onChange={e => handleRoleChange(e.target.value as string)}
                                        sx={{ color: '#FFF', fontWeight: 700, '& .MuiFilledInput-root': { bgcolor: 'transparent' }, '& .MuiSvgIcon-root': { color: '#FFF' } }}>
                                        {ADMIN_ROLES.map(r => (
                                            <MenuItem key={r.value} value={r.value} sx={{ color: '#FFF', bgcolor: '#1a1a1a', fontWeight: 700 }}>
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.color }} />
                                                    <span>{r.label}</span>
                                                </Stack>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Paper sx={{ p: 2, bgcolor: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 2 }}>
                                    <FormControlLabel
                                        control={<Switch checked={formActive} onChange={e => setFormActive(e.target.checked)} sx={{ '& .MuiSwitch-thumb': { bgcolor: formActive ? '#4ade80' : '#ef4444' } }} />}
                                        label={<Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>INSTITUTIONAL ACCESS ACTIVE</Typography>}
                                    />
                                </Paper>
                            </Stack>
                        </Grid>
                        <Grid item xs={12} md={7}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="overline" sx={{ color: '#C6A75E', fontWeight: 950 }}>GRANULAR CAPABILITIES</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{Object.values(formPermissions).filter(v => v).length} ACTIVE</Typography>
                            </Box>
                            <Paper sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, maxHeight: 400, overflowY: 'auto' }}>
                                <Stack spacing={1}>
                                    {PERMISSIONS_LIST.map((p) => (
                                        <Box 
                                            key={p.key} 
                                            onClick={() => togglePermission(p.key)}
                                            sx={{ 
                                                p: 1.5, borderRadius: 2, cursor: 'pointer',
                                                bgcolor: formPermissions[p.key] ? 'rgba(198,167,94,0.08)' : 'transparent',
                                                border: `1px solid ${formPermissions[p.key] ? 'rgba(198,167,94,0.2)' : 'rgba(255,255,255,0.03)'}`,
                                                transition: 'all 0.2s ease',
                                                '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' }
                                            }}
                                        >
                                            <Stack direction="row" spacing={2} alignItems="center">
                                                <Checkbox 
                                                    checked={!!formPermissions[p.key]} 
                                                    size="small"
                                                    sx={{ color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: '#C6A75E' } }}
                                                />
                                                <Box sx={{ flex: 1 }}>
                                                    <Typography variant="body2" sx={{ color: formPermissions[p.key] ? '#FFF' : 'rgba(255,255,255,0.7)', fontWeight: 800 }}>
                                                        {p.label}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'block', fontSize: '0.65rem' }}>
                                                        {p.desc}
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                        </Box>
                                    ))}
                                </Stack>
                            </Paper>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 4, pb: 4, pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button onClick={() => setDialogOpen(false)}
                        sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, px: 3 }}>CANCEL</Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving}
                        sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 950, borderRadius: 2, px: 5, py: 1.5, fontSize: '0.8rem', '&:hover': { bgcolor: '#b59410' } }}>
                        {saving ? <CircularProgress size={20} sx={{ color: '#000' }} /> : editingUser ? 'AUTHORIZE CHANGES' : 'COMMISSION STAFF'}
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}
