import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack,
  Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { Add as AddIcon, Build as BuildIcon, Edit as EditIcon, PersonOff as PersonOffIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useLanguage } from '@bin/shared';
import { auth, functions, httpsCallable } from '../../lib/firebase';

type Technician = {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  status?: string;
  specialization?: string;
  department?: string;
  role: 'technician';
  emiratesCovered?: string[];
  primaryEmirate?: string;
  maxConcurrentJobs?: number;
  emergencyEligible?: boolean;
  onDuty?: boolean;
  lifecycleState?: string;
  onboardingComplete?: boolean;
};

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah', 'Al Ain'];

function safeError(error: any) {
  return String(error?.details || error?.message || error?.code || 'Technician operation failed.').replace(/^FirebaseError:\s*/i, '').slice(0, 300);
}

export default function TechniciansManagementPage() {
  const { t, isRTL } = useLanguage();
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [offboardTarget, setOffboardTarget] = useState<Technician | null>(null);
  const [offboardReason, setOffboardReason] = useState('');
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [newTech, setNewTech] = useState({ email: '', displayName: '', phoneNumber: '', specialization: '' });
  const [editTech, setEditTech] = useState({
    displayName: '', phoneNumber: '', specialization: '', department: 'Technical',
    emiratesCovered: [] as string[], primaryEmirate: '', maxConcurrentJobs: 3,
    emergencyEligible: false,
  });

  const loadTechnicians = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setActionError(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('UNAUTHENTICATED: No active administrative session.');
      await currentUser.getIdToken(true);
      const getLifecycle = httpsCallable(functions, 'adminGetStaffLifecycle');
      const response: any = await getLifecycle({});
      const rows = Array.isArray(response.data?.staff) ? response.data.staff : [];
      setTechs(rows.filter((member: any) => String(member?.role || '').toLowerCase() === 'technician'));
    } catch (error) {
      setTechs([]);
      setActionError(`Technician registry sync failed: ${safeError(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadTechnicians(); }, [loadTechnicians]);

  const handleAddTech = async () => {
    setSubmitting(true); setActionError(null); setActionSuccess(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('UNAUTHENTICATED: No active administrative session.');
      if (!newTech.displayName.trim() || !newTech.email.trim()) throw new Error('Full name and email are required.');
      await user.getIdToken(true);
      const provisionStaff = httpsCallable(functions, 'adminCreateUser');
      const response: any = await provisionStaff({
        displayName: newTech.displayName.trim(),
        email: newTech.email.trim().toLowerCase(),
        phoneNumber: newTech.phoneNumber.trim(),
        specialization: newTech.specialization.trim() || 'General Maintenance',
        department: 'Technical',
        role: 'technician',
      });
      if (!response.data?.success) throw new Error(response.data?.message || 'Technician provisioning failed.');
      setActionSuccess('Technician account created securely. Verification and private-password setup were queued.');
      setOpenAdd(false);
      setNewTech({ email: '', displayName: '', phoneNumber: '', specialization: '' });
      await loadTechnicians(true);
    } catch (error) {
      setActionError(safeError(error));
    } finally { setSubmitting(false); }
  };

  const openEditTech = (tech: Technician) => {
    setSelectedTech(tech);
    setEditTech({
      displayName: tech.displayName || '',
      phoneNumber: tech.phoneNumber || '',
      specialization: tech.specialization || '',
      department: tech.department || 'Technical',
      emiratesCovered: tech.emiratesCovered || [],
      primaryEmirate: tech.primaryEmirate || '',
      maxConcurrentJobs: tech.maxConcurrentJobs || 3,
      emergencyEligible: Boolean(tech.emergencyEligible),
    });
    setOpenEdit(true);
  };

  const handleUpdateTech = async () => {
    if (!selectedTech) return;
    setSubmitting(true); setActionError(null); setActionSuccess(null);
    try {
      const updateProfile = httpsCallable(functions, 'adminUpdateStaffProfile');
      await updateProfile({ uid: selectedTech.uid, ...editTech, role: 'technician' });
      setActionSuccess('Technician profile updated through the protected staff lifecycle.');
      setOpenEdit(false);
      await loadTechnicians(true);
    } catch (error) {
      setActionError(safeError(error));
    } finally { setSubmitting(false); }
  };

  const handleOffboard = async () => {
    if (!offboardTarget) return;
    setSubmitting(true); setActionError(null); setActionSuccess(null);
    try {
      const offboard = httpsCallable(functions, 'adminOffboardStaff');
      await offboard({ uid: offboardTarget.uid, reason: offboardReason || 'Technician offboarding from Admin Technician Corps' });
      setActionSuccess(`${offboardTarget.displayName} suspended. Auth disabled, refresh tokens revoked and history preserved.`);
      setOffboardTarget(null);
      setOffboardReason('');
      await loadTechnicians(true);
    } catch (error) {
      setActionError(safeError(error));
    } finally { setSubmitting(false); }
  };

  const filteredTechs = techs.filter((tech) => [tech.displayName, tech.email, tech.specialization, tech.primaryEmirate].filter(Boolean).join(' ').toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <Container sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Container>;

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900 }}>{t('nav.technicians')} <Box component="span" sx={{ color: '#10b981' }}>CORPS</Box></Typography>
            <Typography variant="body2" color="text.secondary">Technician registry is read through the App Check-protected staff lifecycle. No privileged users-collection browser query is required.</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />} onClick={() => void loadTechnicians(true)} disabled={refreshing}>REFRESH</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenAdd(true)} data-testid="admin-add-technician" sx={{ borderRadius: 100, bgcolor: '#10b981' }}>ADD TECHNICIAN</Button>
          </Stack>
        </Box>
        {actionError && <Alert severity="error">{actionError}</Alert>}
        {actionSuccess && <Alert severity="success">{actionSuccess}</Alert>}
        <Paper sx={{ p: 2 }}><TextField fullWidth size="small" label="Search technician" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></Paper>
        <TableContainer component={Paper}>
          <Table>
            <TableHead><TableRow><TableCell>NAME</TableCell><TableCell>SPECIALIZATION</TableCell><TableCell>EMAIL</TableCell><TableCell>LIFECYCLE</TableCell><TableCell>STATUS</TableCell><TableCell align="right">ACTIONS</TableCell></TableRow></TableHead>
            <TableBody>
              {filteredTechs.map((tech) => <TableRow key={tech.uid} hover>
                <TableCell><Stack direction="row" spacing={1} alignItems="center"><BuildIcon sx={{ fontSize: 16, color: '#10b981' }} /><b>{tech.displayName || 'N/A'}</b></Stack></TableCell>
                <TableCell><Chip label={tech.specialization || 'General Maintenance'} size="small" variant="outlined" /></TableCell>
                <TableCell>{tech.email}</TableCell>
                <TableCell><Chip label={String(tech.lifecycleState || (tech.onboardingComplete ? 'ACTIVE' : 'ONBOARDING')).replace(/_/g, ' ')} size="small" variant="outlined" /></TableCell>
                <TableCell><Chip label={String(tech.status || 'ACTIVE').toUpperCase()} size="small" color={String(tech.status).toUpperCase() === 'SUSPENDED' ? 'error' : 'success'} /></TableCell>
                <TableCell align="right"><Tooltip title="Edit protected technician profile"><IconButton onClick={() => openEditTech(tech)}><EditIcon /></IconButton></Tooltip>{String(tech.status).toUpperCase() !== 'SUSPENDED' && <Tooltip title="Suspend and offboard safely"><IconButton color="error" onClick={() => setOffboardTarget(tech)}><PersonOffIcon /></IconButton></Tooltip>}</TableCell>
              </TableRow>)}
              {filteredTechs.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}>No technicians found.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>

      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} fullWidth maxWidth="sm">
        <DialogTitle>Register technician</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}><TextField label="Full name" value={newTech.displayName} onChange={(e) => setNewTech({ ...newTech, displayName: e.target.value })} /><TextField label="Email" type="email" value={newTech.email} onChange={(e) => setNewTech({ ...newTech, email: e.target.value })} /><TextField label="Phone" value={newTech.phoneNumber} onChange={(e) => setNewTech({ ...newTech, phoneNumber: e.target.value })} /><TextField label="Specialization" value={newTech.specialization} onChange={(e) => setNewTech({ ...newTech, specialization: e.target.value })} /></Stack></DialogContent>
        <DialogActions><Button onClick={() => setOpenAdd(false)}>CANCEL</Button><Button variant="contained" onClick={() => void handleAddTech()} disabled={submitting}>{submitting ? <CircularProgress size={18} /> : 'CREATE SECURE ACCOUNT'}</Button></DialogActions>
      </Dialog>

      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit protected technician profile</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}><TextField label="Full name" value={editTech.displayName} onChange={(e) => setEditTech({ ...editTech, displayName: e.target.value })} /><TextField label="Phone" value={editTech.phoneNumber} onChange={(e) => setEditTech({ ...editTech, phoneNumber: e.target.value })} /><TextField label="Specialization" value={editTech.specialization} onChange={(e) => setEditTech({ ...editTech, specialization: e.target.value })} /><TextField label="Department" value={editTech.department} onChange={(e) => setEditTech({ ...editTech, department: e.target.value })} /><TextField select label="Primary Emirate" value={editTech.primaryEmirate} onChange={(e) => setEditTech({ ...editTech, primaryEmirate: e.target.value })}>{EMIRATES.map((emirate) => <MenuItem key={emirate} value={emirate}>{emirate}</MenuItem>)}</TextField><TextField label="Emirates covered (comma separated)" value={editTech.emiratesCovered.join(', ')} onChange={(e) => setEditTech({ ...editTech, emiratesCovered: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} /><TextField label="Max concurrent jobs" type="number" value={editTech.maxConcurrentJobs} onChange={(e) => setEditTech({ ...editTech, maxConcurrentJobs: Number(e.target.value) || 3 })} /><FormControlLabel control={<Switch checked={editTech.emergencyEligible} onChange={(e) => setEditTech({ ...editTech, emergencyEligible: e.target.checked })} />} label="Emergency eligible" /></Stack></DialogContent>
        <DialogActions><Button onClick={() => setOpenEdit(false)}>CANCEL</Button><Button variant="contained" onClick={() => void handleUpdateTech()} disabled={submitting}>SAVE PROTECTED PROFILE</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(offboardTarget)} onClose={() => setOffboardTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Offboard technician safely</DialogTitle>
        <DialogContent><Alert severity="warning" sx={{ mb: 2 }}>No Firestore records will be deleted. Firebase Auth will be disabled, tokens revoked and history preserved for audit/payroll/job evidence.</Alert><TextField fullWidth label="Offboarding reason" value={offboardReason} onChange={(e) => setOffboardReason(e.target.value)} /></DialogContent>
        <DialogActions><Button onClick={() => setOffboardTarget(null)}>CANCEL</Button><Button color="error" variant="contained" onClick={() => void handleOffboard()} disabled={submitting}>SUSPEND & OFFBOARD</Button></DialogActions>
      </Dialog>
    </Container>
  );
}
