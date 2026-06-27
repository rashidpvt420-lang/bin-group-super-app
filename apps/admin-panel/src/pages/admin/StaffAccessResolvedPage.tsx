import React from 'react';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, alpha } from '@mui/material';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';

const MODULES = [
  'dashboard', 'owners', 'tenants', 'tickets', 'technicians', 'financials', 'transactions', 'broker',
  'documents', 'properties', 'reports', 'audit', 'compliance', 'map', 'sos', 'settings', 'hr', 'pricing',
];

const ROLES: Record<string, string[]> = {
  admin: MODULES,
  operations_admin: ['dashboard', 'tickets', 'technicians', 'map', 'sos', 'properties'],
  finance_admin: ['dashboard', 'financials', 'transactions', 'reports'],
  hr_admin: ['dashboard', 'technicians', 'hr'],
  support_admin: ['dashboard', 'tenants', 'tickets', 'sos'],
  account_manager: ['dashboard', 'owners', 'documents', 'properties'],
  dispatcher: ['dashboard', 'tickets', 'technicians', 'map'],
  manager: ['dashboard', 'reports', 'audit', 'owners', 'tenants'],
};

const ADMIN_ROLES = Object.keys(ROLES).concat(['super_admin', 'ceo', 'operations_manager', 'hr_manager', 'hr_staff', 'finance_staff']);

type StaffRow = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  modules: string[];
  status: string;
  lastLogin?: any;
};

const emptyForm = { displayName: '', email: '', role: 'support_admin', modules: ROLES.support_admin };

export default function StaffAccessResolvedPage() {
  const [staff, setStaff] = React.useState<StaffRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<StaffRow | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const rows = snap.docs
        .map((item) => ({ id: item.id, ...(item.data() || {}) } as any))
        .filter((item) => ADMIN_ROLES.includes(String(item.role || item.userRole || item.primaryRole || '')))
        .map((item) => ({
          id: item.id,
          displayName: item.displayName || item.name || 'Staff',
          email: item.email || '',
          role: item.role || item.userRole || item.primaryRole || 'support_admin',
          modules: item.staffModules || item.modules || ROLES[item.role] || [],
          status: item.status || 'ACTIVE',
          lastLogin: item.lastLogin,
        }));
      setStaff(rows);
      setLoading(false);
    }, () => {
      setMessage('Could not load staff users. Check admin Firestore access.');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const writeAudit = async (action: string, targetId: string, details: Record<string, any>) => {
    const payload = {
      action,
      actorRole: 'admin',
      targetType: 'user',
      targetId,
      module: 'staff_access_resolved',
      status: 'RECORDED',
      metadata: details,
      createdAt: serverTimestamp(),
    };
    await Promise.all([
      addDoc(collection(db, 'audit_logs'), payload),
      addDoc(collection(db, 'auditLogs'), { ...payload, timestamp: serverTimestamp() }),
    ]);
  };

  const openCreate = () => {
    setSelected(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: StaffRow) => {
    setSelected(row);
    setForm({ displayName: row.displayName, email: row.email, role: row.role, modules: row.modules });
    setOpen(true);
  };

  const setRole = (role: string) => setForm((current) => ({ ...current, role, modules: ROLES[role] || [] }));
  const toggleModule = (module: string) => setForm((current) => ({
    ...current,
    modules: current.modules.includes(module) ? current.modules.filter((item) => item !== module) : [...current.modules, module],
  }));

  const save = async () => {
    if (!form.displayName.trim() || !form.email.trim() || !form.role) return;
    setSaving(true);
    try {
      if (selected) {
        await updateDoc(doc(db, 'users', selected.id), {
          role: form.role,
          userRole: form.role,
          primaryRole: form.role,
          staffModules: form.modules,
          updatedAt: serverTimestamp(),
          accessReviewedAt: serverTimestamp(),
        });
        await writeAudit('STAFF_ACCESS_UPDATED', selected.id, {
          email: selected.email,
          beforeRole: selected.role,
          afterRole: form.role,
          beforeModules: selected.modules,
          afterModules: form.modules,
        });
      } else {
        const ref = doc(collection(db, 'users'));
        await setDoc(ref, {
          displayName: form.displayName.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
          userRole: form.role,
          primaryRole: form.role,
          staffModules: form.modules,
          status: 'PENDING_LOGIN',
          createdBy: 'admin_staff_access',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAudit('STAFF_ACCESS_CREATED', ref.id, { email: form.email.trim().toLowerCase(), role: form.role, modules: form.modules });
      }
      setMessage('Staff access saved and audit logged.');
      setOpen(false);
    } catch (error) {
      console.error('[StaffAccessResolved] save failed:', error);
      setMessage('Could not save staff access. Check permissions.');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (row: StaffRow, status: 'ACTIVE' | 'SUSPENDED') => {
    await updateDoc(doc(db, 'users', row.id), {
      status,
      accessStatus: status,
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp(),
    });
    await writeAudit(status === 'ACTIVE' ? 'STAFF_ACCESS_RESTORED' : 'STAFF_ACCESS_SUSPENDED', row.id, { email: row.email, role: row.role, status });
    setMessage(`${row.displayName} ${status === 'ACTIVE' ? 'restored' : 'suspended'} and audit logged.`);
  };

  return (
    <AdminPageFrame title="Staff Access Control" subtitle="AUDITED ROLE-BASED MODULE PERMISSIONS" lastUpdated={new Date()} onRefresh={() => window.location.reload()}>
      <Box sx={{ pb: 8 }}>
        <Stack spacing={3}>
          <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.52)', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 5 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2}>
              <Box>
                <Typography sx={{ color: '#fff', fontWeight: 950 }}>Every role, module and status change is written to audit logs.</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 800 }}>{staff.filter((item) => item.status !== 'SUSPENDED').length} active · {staff.filter((item) => item.status === 'SUSPENDED').length} suspended</Typography>
              </Box>
              <Button variant="contained" onClick={openCreate} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Add Staff Member</Button>
            </Stack>
          </Paper>

          {message && <Alert severity={message.includes('Could not') ? 'error' : 'success'}>{message}</Alert>}

          <Paper sx={{ bgcolor: 'rgba(15,23,42,0.52)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Staff</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Modules</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {staff.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell><Typography sx={{ color: '#fff', fontWeight: 900 }}>{row.displayName}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{row.email}</Typography></TableCell>
                    <TableCell><Chip size="small" label={row.role.replace(/_/g, ' ').toUpperCase()} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950 }} /></TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.72)' }}>{row.modules.slice(0, 5).join(', ')}{row.modules.length > 5 ? ` +${row.modules.length - 5}` : ''}</TableCell>
                    <TableCell><Chip size="small" label={row.status} color={row.status === 'SUSPENDED' ? 'error' : 'success'} /></TableCell>
                    <TableCell align="right"><Stack direction="row" spacing={1} justifyContent="flex-end"><Button size="small" onClick={() => openEdit(row)}>Edit</Button>{row.status === 'SUSPENDED' ? <Button size="small" color="success" onClick={() => setStatus(row, 'ACTIVE')}>Restore</Button> : <Button size="small" color="error" onClick={() => setStatus(row, 'SUSPENDED')}>Suspend</Button>}</Stack></TableCell>
                  </TableRow>
                ))}
                {!loading && staff.length === 0 && <TableRow><TableCell colSpan={5} align="center">No staff access records found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Paper>
        </Stack>

        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>{selected ? `Edit ${selected.displayName}` : 'Add Staff Member'}</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ pt: 1 }}>
              <Grid item xs={12} md={6}><TextField fullWidth label="Full name" value={form.displayName} disabled={Boolean(selected)} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Email" value={form.email} disabled={Boolean(selected)} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Grid>
              <Grid item xs={12}><TextField fullWidth select label="Role" value={form.role} onChange={(event) => setRole(event.target.value)}>{Object.keys(ROLES).map((role) => <MenuItem key={role} value={role}>{role.replace(/_/g, ' ').toUpperCase()}</MenuItem>)}</TextField></Grid>
              <Grid item xs={12}>
                <Typography sx={{ fontWeight: 900, mb: 1 }}>Module Access</Typography>
                <Grid container spacing={1}>{MODULES.map((module) => <Grid item xs={12} sm={6} md={4} key={module}><FormControlLabel control={<Checkbox checked={form.modules.includes(module)} onChange={() => toggleModule(module)} />} label={module} /></Grid>)}</Grid>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" disabled={saving || !form.displayName || !form.email} onClick={save}>{saving ? 'Saving...' : 'Save Access'}</Button></DialogActions>
        </Dialog>
      </Box>
    </AdminPageFrame>
  );
}
