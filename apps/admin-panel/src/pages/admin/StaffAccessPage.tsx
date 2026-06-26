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
import { addDoc, collection, db, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from '../../lib/firebase';
import { functions, httpsCallable } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';

const STAFF_ROLES = [
  { value: 'admin', label: 'Admin Full Access', description: 'Full system access' },
  { value: 'operations_admin', label: 'Operations Admin', description: 'Tickets, technicians, live map' },
  { value: 'finance_admin', label: 'Finance Admin', description: 'Financials, payments, payroll' },
  { value: 'hr_admin', label: 'HR Admin', description: 'Staff and technician approvals' },
  { value: 'support_admin', label: 'Support Admin', description: 'Tenants, complaints, messages' },
  { value: 'account_manager', label: 'Account Manager', description: 'Owners, contracts, documents' },
  { value: 'dispatcher', label: 'Dispatcher', description: 'Ticket assignment and duty command' },
  { value: 'manager', label: 'Manager', description: 'Reports and analytics' },
];

const MODULE_ACCESS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'owners', label: 'Owner Management' },
  { key: 'tenants', label: 'Tenant Management' },
  { key: 'tickets', label: 'Tickets / Maintenance' },
  { key: 'technicians', label: 'Technician Management' },
  { key: 'financials', label: 'Financials & Payroll' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'broker', label: 'Broker Management' },
  { key: 'documents', label: 'Document Vault' },
  { key: 'properties', label: 'Properties & Passports' },
  { key: 'reports', label: 'Reports & Analytics' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'map', label: 'Live Map' },
  { key: 'sos', label: 'SOS Feed' },
  { key: 'settings', label: 'System Settings' },
  { key: 'hr', label: 'HR Management' },
  { key: 'pricing', label: 'Pricing Matrix' },
];

const ROLE_DEFAULT_MODULES: Record<string, string[]> = {
  admin: MODULE_ACCESS.map((module) => module.key),
  operations_admin: ['dashboard', 'tickets', 'technicians', 'map', 'sos', 'properties'],
  finance_admin: ['dashboard', 'financials', 'transactions', 'reports'],
  hr_admin: ['dashboard', 'technicians', 'hr'],
  support_admin: ['dashboard', 'tenants', 'tickets', 'sos'],
  account_manager: ['dashboard', 'owners', 'documents', 'properties'],
  dispatcher: ['dashboard', 'tickets', 'technicians', 'map'],
  manager: ['dashboard', 'reports', 'audit', 'owners', 'tenants'],
};

const ADMIN_ROLES = [
  'admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin',
  'support_admin', 'hr_manager', 'hr_staff', 'finance_staff', 'account_manager', 'dispatcher', 'operations_manager',
];

type StaffMember = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  modules: string[];
  status: string;
  createdAt?: any;
  lastLogin?: any;
};

const emptyForm = () => ({ displayName: '', email: '', role: 'support_admin', modules: ROLE_DEFAULT_MODULES.support_admin, tempPassword: '' });
const dateLabel = (value: any) => value?.toDate ? value.toDate().toLocaleDateString('en-AE') : 'Never';
const roleColor = (role: string) => role.includes('finance') ? '#10b981' : role.includes('hr') ? '#3b82f6' : role.includes('operations') || role === 'dispatcher' ? '#f59e0b' : role === 'admin' || role === 'super_admin' || role === 'ceo' ? binThemeTokens.gold : 'rgba(255,255,255,0.45)';

export default function StaffAccessPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('role', 'in', ADMIN_ROLES)),
      (snap) => {
        setStaff(snap.docs.map((row) => ({
          id: row.id,
          displayName: row.data().displayName || row.data().name || 'Staff',
          email: row.data().email || '',
          role: row.data().role || 'support_admin',
          modules: row.data().staffModules || ROLE_DEFAULT_MODULES[row.data().role] || [],
          status: row.data().status || 'ACTIVE',
          createdAt: row.data().createdAt,
          lastLogin: row.data().lastLogin,
        })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const auditStaffAction = async (action: string, target: Partial<StaffMember>, metadata: Record<string, any> = {}) => {
    await addDoc(collection(db, 'audit_logs'), {
      actorId: 'admin-panel',
      actorRole: 'admin',
      action,
      targetType: 'USER_ACCESS',
      targetId: target.id || target.email || 'pending-staff',
      module: 'staff_access',
      status: 'RECORDED',
      metadata: {
        staffEmail: target.email || null,
        staffName: target.displayName || null,
        staffRole: target.role || null,
        ...metadata,
      },
      createdAt: serverTimestamp(),
    });
  };

  const openAddDialog = () => {
    setEditMode(false);
    setSelectedStaff(null);
    setFormData(emptyForm());
    setDialogOpen(true);
  };

  const openEditDialog = (member: StaffMember) => {
    setEditMode(true);
    setSelectedStaff(member);
    setFormData({ displayName: member.displayName, email: member.email, role: member.role, modules: member.modules, tempPassword: '' });
    setDialogOpen(true);
  };

  const handleRoleChange = (role: string) => setFormData((old) => ({ ...old, role, modules: ROLE_DEFAULT_MODULES[role] || [] }));
  const toggleModule = (key: string) => setFormData((old) => ({ ...old, modules: old.modules.includes(key) ? old.modules.filter((module) => module !== key) : [...old.modules, key] }));

  const handleSubmit = async () => {
    if (!formData.displayName || !formData.email || !formData.role) return;
    setSubmitting(true);
    try {
      if (editMode && selectedStaff) {
        await updateDoc(doc(db, 'users', selectedStaff.id), {
          role: formData.role,
          staffModules: formData.modules,
          updatedAt: serverTimestamp(),
        });
        await auditStaffAction('STAFF_ACCESS_UPDATED', selectedStaff, {
          before: { role: selectedStaff.role, modules: selectedStaff.modules },
          after: { role: formData.role, modules: formData.modules },
        });
        setNotice({ message: `${formData.displayName} access updated.`, error: false });
      } else {
        let createdViaFunction = false;
        let createdId = '';
        try {
          const createStaff = httpsCallable(functions, 'createStaffUser');
          const result: any = await createStaff({
            displayName: formData.displayName,
            email: formData.email,
            role: formData.role,
            modules: formData.modules,
            tempPassword: formData.tempPassword || `BIN@${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          });
          createdViaFunction = true;
          createdId = result?.data?.uid || '';
        } catch {
          const newRef = doc(collection(db, 'users'));
          createdId = newRef.id;
          await setDoc(newRef, {
            displayName: formData.displayName,
            email: formData.email,
            role: formData.role,
            staffModules: formData.modules,
            status: 'PENDING_LOGIN',
            createdAt: serverTimestamp(),
            createdBy: 'admin-panel',
          });
        }
        await auditStaffAction('STAFF_ACCESS_CREATED', { ...formData, id: createdId, status: createdViaFunction ? 'ACTIVE' : 'PENDING_LOGIN' }, { createdViaFunction, modules: formData.modules });
        setNotice({ message: createdViaFunction ? `${formData.displayName} created.` : `Staff record created for ${formData.email}. Create Firebase Auth account if needed.`, error: false });
      }
      setDialogOpen(false);
    } catch (error) {
      console.error('[StaffAccess] save failed', error);
      setNotice({ message: 'Failed to save staff access. Check permissions.', error: true });
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (member: StaffMember, status: 'ACTIVE' | 'SUSPENDED') => {
    try {
      await updateDoc(doc(db, 'users', member.id), {
        status,
        updatedAt: serverTimestamp(),
        suspendedAt: status === 'SUSPENDED' ? serverTimestamp() : null,
        restoredAt: status === 'ACTIVE' ? serverTimestamp() : null,
        accessChangedBy: 'admin-panel',
      });
      await auditStaffAction(status === 'SUSPENDED' ? 'STAFF_ACCESS_SUSPENDED' : 'STAFF_ACCESS_RESTORED', member, { beforeStatus: member.status, afterStatus: status });
      setNotice({ message: `${member.displayName} access ${status === 'SUSPENDED' ? 'suspended' : 'restored'}.`, error: false });
    } catch (error) {
      console.error('[StaffAccess] status update failed', error);
      setNotice({ message: 'Failed to update staff access.', error: true });
    }
  };

  return (
    <AdminPageFrame title="Staff Access Control" subtitle="Role-based module permissions with audit proof." lastUpdated={new Date()} onRefresh={() => window.location.reload()}>
      <Stack spacing={3} sx={{ pb: 8 }}>
        {notice && <Alert severity={notice.error ? 'error' : 'success'} onClose={() => setNotice(null)} sx={{ borderRadius: 3 }}>{notice.message}</Alert>}
        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2}>
            <Box>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>Staff Accounts</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)' }}>{staff.filter((member) => member.status !== 'SUSPENDED').length} active staff · {staff.filter((member) => member.status === 'SUSPENDED').length} suspended · every access change writes to audit_logs.</Typography>
            </Box>
            <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={openAddDialog} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Add Staff Member</Button>
          </Stack>
        </Paper>

        <Paper sx={{ bgcolor: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
          {loading ? <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box> : (
            <TableContainer>
              <Table>
                <TableHead><TableRow><TableCell>Staff Member</TableCell><TableCell>Role</TableCell><TableCell>Module Access</TableCell><TableCell>Status</TableCell><TableCell>Last Login</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                <TableBody>
                  {staff.map((member) => <TableRow key={member.id} hover sx={{ opacity: member.status === 'SUSPENDED' ? 0.55 : 1 }}><TableCell><Typography sx={{ color: '#fff', fontWeight: 900 }}>{member.displayName}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{member.email}</Typography></TableCell><TableCell><Chip size="small" label={member.role.replace(/_/g, ' ').toUpperCase()} sx={{ bgcolor: alpha(roleColor(member.role), 0.15), color: roleColor(member.role), fontWeight: 900 }} /></TableCell><TableCell><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 360 }}>{member.modules.slice(0, 5).map((module) => <Chip key={module} size="small" label={module} sx={{ height: 20, fontSize: '0.62rem', bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.62)' }} />)}{member.modules.length > 5 && <Chip size="small" label={`+${member.modules.length - 5}`} sx={{ height: 20, fontSize: '0.62rem' }} />}</Box></TableCell><TableCell><Chip size="small" label={member.status} sx={{ bgcolor: member.status === 'ACTIVE' ? alpha('#10b981', 0.12) : alpha('#ef4444', 0.12), color: member.status === 'ACTIVE' ? '#10b981' : '#ef4444', fontWeight: 900 }} /></TableCell><TableCell sx={{ color: 'rgba(255,255,255,0.5)' }}>{dateLabel(member.lastLogin)}</TableCell><TableCell align="right"><Tooltip title="Edit access"><IconButton size="small" onClick={() => openEditDialog(member)} sx={{ color: binThemeTokens.gold }}><Edit size={16} /></IconButton></Tooltip>{member.status === 'ACTIVE' ? <Tooltip title="Suspend access"><IconButton size="small" onClick={() => setStatus(member, 'SUSPENDED')} sx={{ color: '#ef4444' }}><XCircle size={16} /></IconButton></Tooltip> : <Tooltip title="Restore access"><IconButton size="small" onClick={() => setStatus(member, 'ACTIVE')} sx={{ color: '#10b981' }}><CheckCircle2 size={16} /></IconButton></Tooltip>}</TableCell></TableRow>)}
                  {staff.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.35)' }}>No staff members found.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 } }}>
        <DialogTitle sx={{ color: '#fff', fontWeight: 950 }}>{editMode ? `Edit Access: ${selectedStaff?.displayName}` : 'Add Staff Member'}</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}><TextField fullWidth label="Full Name" value={formData.displayName} onChange={(event) => setFormData((old) => ({ ...old, displayName: event.target.value }))} disabled={editMode} /></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth label="Email Address" type="email" value={formData.email} onChange={(event) => setFormData((old) => ({ ...old, email: event.target.value }))} disabled={editMode} /></Grid>
            {!editMode && <Grid item xs={12} md={6}><TextField fullWidth label="Temporary Password" type="password" value={formData.tempPassword} onChange={(event) => setFormData((old) => ({ ...old, tempPassword: event.target.value }))} placeholder="Leave blank for auto-generated" /></Grid>}
            <Grid item xs={12} md={editMode ? 12 : 6}><FormControl fullWidth><InputLabel>Role</InputLabel><Select value={formData.role} label="Role" onChange={(event) => handleRoleChange(String(event.target.value))}>{STAFF_ROLES.map((role) => <MenuItem key={role.value} value={role.value}><Box><Typography fontWeight={800}>{role.label}</Typography><Typography variant="caption" sx={{ color: 'rgba(0,0,0,0.55)' }}>{role.description}</Typography></Box></MenuItem>)}</Select></FormControl></Grid>
            <Grid item xs={12}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>MODULE ACCESS CONTROL</Typography><Grid container spacing={1} sx={{ mt: 1 }}>{MODULE_ACCESS.map((module) => <Grid item xs={12} sm={6} md={4} key={module.key}><FormControlLabel control={<Checkbox checked={formData.modules.includes(module.key)} onChange={() => toggleModule(module.key)} sx={{ '&.Mui-checked': { color: binThemeTokens.gold } }} />} label={<Typography sx={{ color: '#fff', fontWeight: 700 }}>{module.label}</Typography>} /></Grid>)}</Grid><Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button size="small" onClick={() => setFormData((old) => ({ ...old, modules: MODULE_ACCESS.map((module) => module.key) }))}>Select all</Button><Button size="small" onClick={() => setFormData((old) => ({ ...old, modules: [] }))}>Clear</Button></Stack></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}><Button onClick={() => setDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={handleSubmit} disabled={submitting || !formData.displayName || !formData.email} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{submitting ? 'Saving...' : editMode ? 'Update Access' : 'Create Staff'}</Button></DialogActions>
      </Dialog>
    </AdminPageFrame>
  );
}
