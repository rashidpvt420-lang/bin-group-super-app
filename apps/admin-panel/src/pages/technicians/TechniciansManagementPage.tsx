import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, ListItemText, MenuItem, Paper,
  Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add as AddIcon, Build as BuildIcon, Edit as EditIcon } from '@mui/icons-material';
import { RefreshCw, ShieldOff, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { auth, functions, httpsCallable } from '../../lib/firebase';

interface Technician {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  status: string;
  onboardingStage?: string;
  specialization: string;
  role: 'technician';
  emiratesCovered?: string[];
  primaryEmirate?: string;
  onDuty?: boolean;
  available?: boolean;
  currentJobCount?: number;
  maxConcurrentJobs?: number;
  emergencyEligible?: boolean;
}

const EMIRATES = ['Abu Dhabi', 'Al Ain', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
const errorText = (error: any) => String(error?.details || error?.message || error?.code || 'Technician operation failed.').replace(/^FirebaseError:\s*/i, '').slice(0, 320);

export default function TechniciansManagementPage() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openEdit, setOpenEdit] = useState(false);
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editTech, setEditTech] = useState({
    displayName: '', phoneNumber: '', specialization: '', emiratesCovered: [] as string[], primaryEmirate: '',
    maxConcurrentJobs: 3, emergencyEligible: false,
  });

  const loadTechnicians = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      if (!auth.currentUser) throw new Error('Admin authentication is required.');
      await auth.currentUser.getIdToken(true);
      const response: any = await httpsCallable(functions, 'adminGetHrCommandSnapshot')({});
      const staff = Array.isArray(response.data?.staff) ? response.data.staff : [];
      const technicians = staff
        .filter((member: any) => String(member.role || '').toLowerCase() === 'technician')
        .map((member: any) => ({
          ...member,
          uid: String(member.id || member.uid || ''),
          role: 'technician' as const,
          email: String(member.email || ''),
          displayName: String(member.displayName || member.fullName || ''),
          phoneNumber: String(member.phoneNumber || member.phone || ''),
          specialization: String(member.specialization || member.trade || 'General'),
          emiratesCovered: Array.isArray(member.emiratesCovered) ? member.emiratesCovered : [],
        }))
        .filter((member: Technician) => Boolean(member.uid));
      setTechs(technicians);
      setActionError(null);
    } catch (error) {
      setActionError(`Technician registry sync failed: ${errorText(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadTechnicians(); }, [loadTechnicians]);

  const handleEditOpen = (tech: Technician) => {
    setSelectedTech(tech);
    setEditTech({
      displayName: tech.displayName || '', phoneNumber: tech.phoneNumber || '', specialization: tech.specialization || '',
      emiratesCovered: tech.emiratesCovered || [], primaryEmirate: tech.primaryEmirate || '',
      maxConcurrentJobs: tech.maxConcurrentJobs || 3, emergencyEligible: Boolean(tech.emergencyEligible),
    });
    setOpenEdit(true);
  };

  const handleUpdateTech = async () => {
    if (!selectedTech) return;
    setSubmitting(true); setActionError(null); setActionSuccess(null);
    try {
      await httpsCallable(functions, 'adminUpdateStaffProfile')({ uid: selectedTech.uid, ...editTech });
      setActionSuccess('Technician profile updated through the protected staff lifecycle.');
      setOpenEdit(false);
      await loadTechnicians(true);
    } catch (error) { setActionError(errorText(error)); }
    finally { setSubmitting(false); }
  };

  const suspendTech = async (tech: Technician) => {
    const suspended = String(tech.status).toUpperCase() === 'SUSPENDED';
    try {
      await httpsCallable(functions, 'adminSetStaffStatus')({ uid: tech.uid, status: suspended ? 'ACTIVE' : 'SUSPENDED' });
      setActionSuccess(suspended ? `${tech.displayName} restored to the prior onboarding state.` : `${tech.displayName} suspended; Auth disabled and refresh tokens revoked.`);
      await loadTechnicians(true);
    } catch (error) { setActionError(errorText(error)); }
  };

  const offboardTech = async (tech: Technician) => {
    const reason = window.prompt(`Offboarding reason for ${tech.displayName}:`);
    if (!reason?.trim() || !window.confirm(`Offboard ${tech.displayName}? Records and job history will be archived, not browser-deleted.`)) return;
    try {
      await httpsCallable(functions, 'adminOffboardStaff')({ uid: tech.uid, reason: reason.trim() });
      setActionSuccess(`${tech.displayName} offboarded, tokens revoked, and staff/technician records archived.`);
      await loadTechnicians(true);
    } catch (error) { setActionError(errorText(error)); }
  };

  const filteredTechs = techs.filter((tech) => [tech.displayName, tech.email, tech.specialization, tech.primaryEmirate].filter(Boolean).join(' ').toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <Container sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Container>;

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 4 }}>
        <Box><Typography variant="h4" sx={{ fontWeight: 900 }}>{t('nav.technicians')} <Box component="span" sx={{ color: '#10b981' }}>{t('admin.tech.force')}</Box></Typography><Typography variant="body2" color="text.secondary">Technicians are employees in the canonical HR lifecycle. Registry data is loaded through the protected HR snapshot; duty state remains server-owned.</Typography></Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshCw size={16} />} onClick={() => void loadTechnicians(true)} disabled={refreshing}>REFRESH</Button>
          <Button data-testid="admin-add-technician" variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/hr?register=technician')} sx={{ borderRadius: 100, px: 3, bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }}>REGISTER TECHNICIAN IN HR</Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 3 }}>Create technicians only in HR Command. Registry reads and edit/suspend/offboard actions use protected server callables; this page does not depend on browser access to the users collection.</Alert>
      {actionError && <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 3 }}>{actionError}</Alert>}
      {actionSuccess && <Alert severity="success" onClose={() => setActionSuccess(null)} sx={{ mb: 3 }}>{actionSuccess}</Alert>}

      <Paper sx={{ p: 3, mb: 4, borderRadius: 3 }}><TextField fullWidth label={t('admin.tech.search_label')} placeholder={t('admin.tech.search_placeholder')} size="small" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></Paper>
      <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 4 }}><Table><TableHead><TableRow><TableCell>Name</TableCell><TableCell>Specialization</TableCell><TableCell>Coverage</TableCell><TableCell>Duty / Availability</TableCell><TableCell>Lifecycle</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>
        {filteredTechs.map((tech) => <TableRow key={tech.uid} hover sx={{ opacity: String(tech.status).toUpperCase() === 'OFFBOARDED' ? 0.45 : 1 }}>
          <TableCell><Stack direction="row" spacing={1} alignItems="center"><BuildIcon sx={{ fontSize: 16, color: '#10b981' }} /><Box><Typography variant="body2" fontWeight={800}>{tech.displayName || 'N/A'}</Typography><Typography variant="caption" color="text.secondary">{tech.email}</Typography></Box></Stack></TableCell>
          <TableCell><Chip label={tech.specialization || 'General'} size="small" variant="outlined" /></TableCell>
          <TableCell><Typography variant="body2">{tech.primaryEmirate || '—'}</Typography><Typography variant="caption" color="text.secondary">{tech.emiratesCovered?.join(', ') || 'No coverage set'}</Typography></TableCell>
          <TableCell><Stack direction="row" spacing={0.5}><Chip size="small" label={tech.onDuty ? 'ON DUTY' : 'OFF DUTY'} color={tech.onDuty ? 'success' : 'default'} /><Chip size="small" label={tech.available ? 'AVAILABLE' : 'UNAVAILABLE'} /></Stack></TableCell>
          <TableCell><Typography variant="caption" fontWeight={900}>{String(tech.status || 'INVITED').toUpperCase()}</Typography><br /><Typography variant="caption" color="text.secondary">{tech.onboardingStage || 'INVITED'}</Typography></TableCell>
          <TableCell align="right"><Stack direction="row" spacing={0.5} justifyContent="flex-end"><Tooltip title="Edit protected technician profile"><IconButton onClick={() => handleEditOpen(tech)} size="small" disabled={String(tech.status).toUpperCase() === 'OFFBOARDED'}><EditIcon fontSize="small" /></IconButton></Tooltip><Tooltip title={String(tech.status).toUpperCase() === 'SUSPENDED' ? 'Restore account' : 'Suspend Auth and revoke tokens'}><IconButton onClick={() => suspendTech(tech)} size="small" disabled={String(tech.status).toUpperCase() === 'OFFBOARDED'}><ShieldOff size={17} /></IconButton></Tooltip><Tooltip title="Offboard and archive"><IconButton onClick={() => offboardTech(tech)} size="small" color="error" disabled={String(tech.status).toUpperCase() === 'OFFBOARDED'}><UserX size={17} /></IconButton></Tooltip></Stack></TableCell>
        </TableRow>)}
        {filteredTechs.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}>No technicians matched.</TableCell></TableRow>}
      </TableBody></Table></TableContainer>

      <Dialog open={openEdit} onClose={() => !submitting && setOpenEdit(false)} fullWidth maxWidth="sm" dir={isRTL ? 'rtl' : 'ltr'}><DialogTitle sx={{ fontWeight: 900 }}>Update Technician Profile</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 2 }}><TextField label="Full name" fullWidth value={editTech.displayName} onChange={(e) => setEditTech({ ...editTech, displayName: e.target.value })} /><TextField label="Phone" fullWidth value={editTech.phoneNumber} onChange={(e) => setEditTech({ ...editTech, phoneNumber: e.target.value })} /><TextField label="Specialization / trade" fullWidth value={editTech.specialization} onChange={(e) => setEditTech({ ...editTech, specialization: e.target.value })} /><FormControl fullWidth><InputLabel>Primary Emirate</InputLabel><Select value={editTech.primaryEmirate} label="Primary Emirate" onChange={(e) => setEditTech({ ...editTech, primaryEmirate: String(e.target.value) })}>{EMIRATES.map((emirate) => <MenuItem key={emirate} value={emirate}>{emirate}</MenuItem>)}</Select></FormControl><FormControl fullWidth><InputLabel>Emirates Covered</InputLabel><Select multiple value={editTech.emiratesCovered} label="Emirates Covered" onChange={(e) => setEditTech({ ...editTech, emiratesCovered: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })} renderValue={(selected) => selected.join(', ')}>{EMIRATES.map((name) => <MenuItem key={name} value={name}><Checkbox checked={editTech.emiratesCovered.includes(name)} /><ListItemText primary={name} /></MenuItem>)}</Select></FormControl><TextField label="Max Concurrent Jobs" type="number" fullWidth value={editTech.maxConcurrentJobs} onChange={(e) => setEditTech({ ...editTech, maxConcurrentJobs: Math.max(1, Number.parseInt(e.target.value, 10) || 1) })} /><FormControlLabel control={<Checkbox checked={editTech.emergencyEligible} onChange={(e) => setEditTech({ ...editTech, emergencyEligible: e.target.checked })} />} label="Emergency SOS eligible" /></Stack></DialogContent><DialogActions sx={{ p: 3 }}><Button onClick={() => setOpenEdit(false)} disabled={submitting}>Cancel</Button><Button variant="contained" onClick={handleUpdateTech} disabled={submitting}>{submitting ? <CircularProgress size={18} /> : 'SAVE THROUGH HR LIFECYCLE'}</Button></DialogActions></Dialog>
    </Container>
  );
}
