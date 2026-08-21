import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, FormControlLabel, Grid, IconButton,
  InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Edit, UserPlus, UserRoundCheck, UserRoundX } from 'lucide-react';
import { collection, db, functions, httpsCallable, onSnapshot, query, where } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';
import {
  STAFF_MODULE_ACCESS,
  STAFF_ROLE_ALLOWED_MODULES,
  STAFF_ROLE_DEFAULT_MODULES,
  STAFF_ROLE_OPTIONS,
  STAFF_ROLE_VALUES,
  type StaffRole,
} from '../../constants/staffRoles';

interface StaffMember {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  department?: string;
  role: StaffRole;
  modules: string[];
  status: string;
}

const emptyForm = () => ({
  displayName: '', email: '', phoneNumber: '', department: 'Operations', role: 'support_admin' as StaffRole,
  employmentType: 'full_time', joiningDate: '', modules: [...STAFF_ROLE_DEFAULT_MODULES.support_admin],
});
const errorMessage = (error: any) => String(error?.details || error?.message || error?.code || 'Secure staff operation failed.').replace(/^FirebaseError:\s*/i, '').slice(0, 280);

export default function StaffAccessPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [form, setForm] = useState(emptyForm());
  const allowedModules = useMemo(() => new Set(STAFF_ROLE_ALLOWED_MODULES[form.role] || []), [form.role]);
  const selectableModules = useMemo(() => STAFF_MODULE_ACCESS.filter((item) => allowedModules.has(item.key)), [allowedModules]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'users'), where('role', 'in', STAFF_ROLE_VALUES)),
      (snapshot) => {
        setStaff(snapshot.docs.map((entry) => {
          const data = entry.data();
          return {
            id: entry.id,
            displayName: data.displayName || data.fullName || 'Staff',
            email: data.email || '',
            phoneNumber: data.phoneNumber || data.phone || '',
            department: data.department || '',
            role: data.role as StaffRole,
            modules: Array.isArray(data.staffModules) ? data.staffModules : [],
            status: String(data.status || 'ACTIVE').toUpperCase(),
          };
        }));
        setLoading(false);
      },
      (error) => { setLoading(false); setMessage({ text: `Unable to load staff directory: ${errorMessage(error)}`, error: true }); },
    );
    return unsubscribe;
  }, []);

  const setRole = (role: StaffRole) => setForm((previous) => ({ ...previous, role, department: role === 'technician' ? 'Technical' : previous.department || 'Operations', modules: [...STAFF_ROLE_DEFAULT_MODULES[role]] }));
  const toggleModule = (key: string) => {
    if (!allowedModules.has(key)) return;
    setForm((previous) => ({ ...previous, modules: previous.modules.includes(key) ? previous.modules.filter((item) => item !== key) : [...previous.modules, key] }));
  };
  const openCreate = () => { setEditMode(false); setSelected(null); setForm(emptyForm()); setDialogOpen(true); setMessage(null); };
  const openEdit = (member: StaffMember) => {
    const allowed = new Set(STAFF_ROLE_ALLOWED_MODULES[member.role] || []);
    setEditMode(true); setSelected(member);
    setForm({ displayName: member.displayName, email: member.email, phoneNumber: member.phoneNumber || '', department: member.department || 'Operations', role: member.role, employmentType: 'full_time', joiningDate: '', modules: member.modules.filter((module) => allowed.has(module)) });
    setDialogOpen(true); setMessage(null);
  };

  const submit = async () => {
    if (!form.displayName.trim() || !form.email.trim()) { setMessage({ text: 'Full name and email are required.', error: true }); return; }
    setSubmitting(true); setMessage(null);
    try {
      if (editMode && selected) {
        await httpsCallable(functions, 'adminUpdateStaffAccess')({ uid: selected.id, role: form.role, modules: form.modules });
        setMessage({ text: `${form.displayName} access updated. A fresh sign-in is required.`, error: false });
      } else {
        await httpsCallable(functions, 'adminCreateUser')({
          displayName: form.displayName.trim(), email: form.email.trim().toLowerCase(), phoneNumber: form.phoneNumber.trim(), department: form.department.trim(),
          employmentType: form.employmentType, joiningDate: form.joiningDate || undefined, role: form.role, modules: form.modules,
        });
        setMessage({ text: `${form.displayName} created. Email verification and private password setup were queued.`, error: false });
      }
      setDialogOpen(false);
    } catch (error) { setMessage({ text: `Operation blocked: ${errorMessage(error)}`, error: true }); }
    finally { setSubmitting(false); }
  };

  const changeStatus = async (member: StaffMember, status: 'ACTIVE' | 'SUSPENDED') => {
    try {
      await httpsCallable(functions, 'adminSetStaffStatus')({ uid: member.id, status });
      setMessage({ text: status === 'SUSPENDED' ? `${member.displayName} suspended and refresh tokens revoked.` : `${member.displayName} restored; they must sign in again.`, error: false });
    } catch (error) { setMessage({ text: `Status change blocked: ${errorMessage(error)}`, error: true }); }
  };

  return <AdminPageFrame title="Staff Access Control" subtitle="SECURE PROVISIONING · LEAST PRIVILEGE" lastUpdated={new Date()} onRefresh={() => window.location.reload()}>
    <Stack spacing={3} data-testid="admin-staff-access-page">
      <Alert severity="info">Create staff accounts here. Founder/CEO/full-Admin identities cannot be created or edited through this workflow. Every change is callable-only; a failed request creates no fallback record.</Alert>
      {message ? <Alert severity={message.error ? 'error' : 'success'}>{message.text}</Alert> : null}
      <Box display="flex" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
        <Box><Typography fontWeight={900}>Staff & Technician Access</Typography><Typography variant="body2" color="text.secondary">{staff.filter((item) => item.status !== 'SUSPENDED' && item.status !== 'EXITED').length} active · {staff.filter((item) => item.status === 'SUSPENDED').length} suspended · {staff.filter((item) => item.status === 'EXITED').length} exited</Typography></Box>
        <Button data-testid="admin-add-staff" variant="contained" startIcon={<UserPlus size={18} />} onClick={openCreate} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>ADD STAFF / TECHNICIAN</Button>
      </Box>
      <Paper sx={{ overflow: 'hidden', bgcolor: 'rgba(15,23,42,.5)' }}>{loading ? <Box p={6} textAlign="center"><CircularProgress /></Box> : <TableContainer><Table size="small"><TableHead><TableRow>{['STAFF MEMBER','ROLE','DEPARTMENT','MODULES','STATUS','ACTIONS'].map((title) => <TableCell key={title}>{title}</TableCell>)}</TableRow></TableHead><TableBody>{staff.length === 0 ? <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}>No staff accounts yet.</TableCell></TableRow> : staff.map((member) => <TableRow key={member.id} hover data-testid={`staff-row-${member.id}`}><TableCell><Typography fontWeight={800}>{member.displayName}</Typography><Typography variant="caption" color="text.secondary">{member.email}</Typography></TableCell><TableCell><Chip size="small" label={member.role.replace(/_/g, ' ').toUpperCase()} /></TableCell><TableCell>{member.department || '—'}</TableCell><TableCell>{member.modules.length ? `${member.modules.slice(0, 3).join(', ')}${member.modules.length > 3 ? ` +${member.modules.length - 3}` : ''}` : 'Portal-specific'}</TableCell><TableCell><Chip size="small" color={member.status === 'ACTIVE' ? 'success' : member.status === 'SUSPENDED' ? 'warning' : 'default'} label={member.status} /></TableCell><TableCell align="right"><Tooltip title="Edit role/module access"><IconButton onClick={() => openEdit(member)}><Edit size={16} /></IconButton></Tooltip>{member.status === 'SUSPENDED' ? <Tooltip title="Reactivate"><IconButton onClick={() => changeStatus(member, 'ACTIVE')}><UserRoundCheck size={16} /></IconButton></Tooltip> : member.status !== 'EXITED' ? <Tooltip title="Suspend"><IconButton onClick={() => changeStatus(member, 'SUSPENDED')}><UserRoundX size={16} /></IconButton></Tooltip> : null}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}</Paper>
    </Stack>

    <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>{editMode ? 'Edit Staff Access' : 'Register Staff / Technician'}</DialogTitle>
      <DialogContent><Grid container spacing={2} sx={{ mt: .5 }}>
        <Grid item xs={12} md={6}><TextField fullWidth label="Full Name" value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} disabled={editMode} /></Grid>
        <Grid item xs={12} md={6}><TextField fullWidth label="Email Address" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} disabled={editMode} /></Grid>
        {!editMode ? <><Grid item xs={12} md={6}><TextField fullWidth label="Phone Number" value={form.phoneNumber} onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))} /></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Department" value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} /></Grid><Grid item xs={12} md={6}><FormControl fullWidth><InputLabel>Employment Type</InputLabel><Select label="Employment Type" value={form.employmentType} onChange={(e) => setForm((p) => ({ ...p, employmentType: String(e.target.value) }))}><MenuItem value="full_time">Full time</MenuItem><MenuItem value="part_time">Part time</MenuItem><MenuItem value="contract">Contract</MenuItem></Select></FormControl></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Joining Date" type="date" InputLabelProps={{ shrink: true }} value={form.joiningDate} onChange={(e) => setForm((p) => ({ ...p, joiningDate: e.target.value }))} /></Grid></> : null}
        <Grid item xs={12}><FormControl fullWidth><InputLabel id="staff-role-label">Role</InputLabel><Select id="staff-role-select" labelId="staff-role-label" data-testid="staff-role-select" label="Role" value={form.role} onChange={(e) => setRole(String(e.target.value) as StaffRole)}>{STAFF_ROLE_OPTIONS.map((role) => <MenuItem key={role.value} value={role.value}>{role.label} — {role.description}</MenuItem>)}</Select></FormControl></Grid>
        <Grid item xs={12}><Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>MODULE ACCESS</Typography><Box display="flex" flexWrap="wrap" gap={1}>{selectableModules.length ? selectableModules.map((module) => <FormControlLabel key={module.key} control={<Checkbox checked={form.modules.includes(module.key)} onChange={() => toggleModule(module.key)} />} label={module.label} />) : <Typography variant="body2" color="text.secondary">Technicians use the Technician portal and receive no Admin-panel modules.</Typography>}</Box></Grid>
      </Grid></DialogContent>
      <DialogActions><Button onClick={() => setDialogOpen(false)} disabled={submitting}>CANCEL</Button><Button variant="contained" disabled={submitting} onClick={submit}>{submitting ? <CircularProgress size={20} /> : editMode ? 'SAVE ACCESS' : 'CREATE & SEND INVITATION'}</Button></DialogActions>
    </Dialog>
  </AdminPageFrame>;
}
