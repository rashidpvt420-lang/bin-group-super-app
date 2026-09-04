import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Build as BuildIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { auth, functions, httpsCallable } from '../../lib/firebase';

type Technician = {
  uid: string;
  email?: string | null;
  displayName: string;
  phoneNumber?: string | null;
  status?: string;
  specialization?: string;
  department?: string;
  role: 'technician';
  emiratesCovered?: string[];
  primaryEmirate?: string | null;
  maxConcurrentJobs?: number;
  currentJobCount?: number;
  emergencyEligible?: boolean;
  onDuty?: boolean;
  available?: boolean;
  lifecycleState?: string;
  onboardingComplete?: boolean;
};

function safeError(error: any) {
  return String(error?.details || error?.message || error?.code || 'Technician directory failed.')
    .replace(/^FirebaseError:\s*/i, '')
    .slice(0, 300);
}

function stateColor(value: string) {
  const state = String(value || '').toUpperCase();
  if (state === 'ACTIVE') return 'success';
  if (state === 'OFFBOARDED' || state === 'SUSPENDED') return 'error';
  if (state === 'INVITED' || state === 'ONBOARDING') return 'warning';
  return 'info';
}

export default function TechniciansManagementPage() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [canManageLifecycle, setCanManageLifecycle] = useState(false);

  const loadTechnicians = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setActionError(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('UNAUTHENTICATED: No active administrative session.');
      await currentUser.getIdToken(true);
      const getDirectory = httpsCallable(functions, 'adminGetTechnicianOperationsDirectory');
      const response: any = await getDirectory({});
      setTechs(Array.isArray(response.data?.technicians) ? response.data.technicians : []);
      setCanManageLifecycle(response.data?.canManageLifecycle === true);
    } catch (error) {
      setTechs([]);
      setCanManageLifecycle(false);
      setActionError(`Technician operational directory sync failed: ${safeError(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadTechnicians(); }, [loadTechnicians]);

  const filteredTechs = useMemo(() => techs.filter((tech) => [
    tech.displayName,
    tech.email,
    tech.phoneNumber,
    tech.specialization,
    tech.primaryEmirate,
    tech.lifecycleState,
    tech.status,
  ].filter(Boolean).join(' ').toLowerCase().includes(searchTerm.trim().toLowerCase())), [techs, searchTerm]);

  const activeCount = techs.filter((tech) => String(tech.lifecycleState || '').toUpperCase() === 'ACTIVE').length;
  const onDutyCount = techs.filter((tech) => tech.onDuty === true).length;
  const availableCount = techs.filter((tech) => tech.available === true).length;
  const currentJobs = techs.reduce((sum, tech) => sum + Number(tech.currentJobCount || 0), 0);

  const openCanonicalHr = (uid?: string) => {
    navigate(uid ? `/hr?staff=${encodeURIComponent(uid)}` : '/hr');
  };

  if (loading) return <Container sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Container>;

  return (
    <Container maxWidth="xl" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }} data-testid="admin-technician-operations-directory">
      <Stack spacing={3}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900 }}>{t('nav.technicians')} <Box component="span" sx={{ color: '#10b981' }}>CORPS</Box></Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 900 }}>
              Operational roster only: duty, availability, workload, geography and field specialization. Employee identity, profile, onboarding, access and offboarding are owned by HR Command.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />} onClick={() => void loadTechnicians(true)} disabled={refreshing}>REFRESH</Button>
            {canManageLifecycle && <Button data-testid="admin-manage-technicians-in-hr" variant="contained" startIcon={<ShieldCheck size={17} />} onClick={() => openCanonicalHr()} sx={{ bgcolor: '#10b981', color: '#04130c', fontWeight: 900 }}>MANAGE STAFF IN HR</Button>}
          </Stack>
        </Box>

        <Alert severity="info">
          This page does not create Firebase Auth users and does not update HR records. Provisioning and lifecycle authority is centralized in HR Command → Staff Access / Staff Registry.
        </Alert>
        {actionError && <Alert severity="error">{actionError}</Alert>}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          {[
            ['ACTIVE', activeCount],
            ['ON DUTY', onDutyCount],
            ['AVAILABLE', availableCount],
            ['CURRENT JOBS', currentJobs],
          ].map(([label, value]) => <Paper key={String(label)} sx={{ p: 2.5, flex: 1, minWidth: 160 }}><Typography variant="caption" color="text.secondary" fontWeight={900}>{String(label)}</Typography><Typography variant="h4" fontWeight={950}>{Number(value)}</Typography></Paper>)}
        </Stack>

        <Paper sx={{ p: 2 }}><TextField fullWidth size="small" label="Search technician, specialization, emirate or lifecycle" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></Paper>

        <TableContainer component={Paper}>
          <Table>
            <TableHead><TableRow>
              <TableCell>TECHNICIAN</TableCell>
              <TableCell>FIELD PROFILE</TableCell>
              <TableCell>AREA</TableCell>
              <TableCell>DUTY</TableCell>
              <TableCell>WORKLOAD</TableCell>
              <TableCell>LIFECYCLE</TableCell>
              <TableCell align="right">ACTION</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {filteredTechs.map((tech) => {
                const current = Number(tech.currentJobCount || 0);
                const max = Math.max(1, Number(tech.maxConcurrentJobs || 3));
                const workloadPercent = Math.min(100, Math.round((current / max) * 100));
                return <TableRow key={tech.uid} hover>
                  <TableCell><Stack direction="row" spacing={1} alignItems="center"><BuildIcon sx={{ fontSize: 16, color: '#10b981' }} /><Box><Typography variant="body2" fontWeight={850}>{tech.displayName || 'Technician'}</Typography>{tech.email && <Typography variant="caption" color="text.secondary">{tech.email}</Typography>}</Box></Stack></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={750}>{tech.specialization || 'General Maintenance'}</Typography><Typography variant="caption" color="text.secondary">{tech.department || 'Technical'}{tech.emergencyEligible ? ' · Emergency eligible' : ''}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{tech.primaryEmirate || 'Unassigned'}</Typography><Typography variant="caption" color="text.secondary">{Array.isArray(tech.emiratesCovered) && tech.emiratesCovered.length > 0 ? tech.emiratesCovered.join(', ') : 'No coverage list'}</Typography></TableCell>
                  <TableCell><Stack direction="row" spacing={.5} flexWrap="wrap"><Chip size="small" color={tech.onDuty ? 'success' : 'default'} label={tech.onDuty ? 'ON DUTY' : 'OFF DUTY'} /><Chip size="small" variant="outlined" color={tech.available ? 'success' : 'default'} label={tech.available ? 'AVAILABLE' : 'BUSY / UNAVAILABLE'} /></Stack></TableCell>
                  <TableCell sx={{ minWidth: 170 }}><Typography variant="caption">{current} / {max} jobs</Typography><LinearProgress variant="determinate" value={workloadPercent} sx={{ mt: .7, height: 7, borderRadius: 10 }} /></TableCell>
                  <TableCell><Stack spacing={.5}><Chip size="small" color={stateColor(tech.lifecycleState || tech.status || '') as any} label={String(tech.lifecycleState || tech.status || 'UNKNOWN').replace(/_/g, ' ')} sx={{ width: 'fit-content' }} /><Typography variant="caption" color="text.secondary">{tech.onboardingComplete ? 'Onboarding complete' : 'Onboarding incomplete'}</Typography></Stack></TableCell>
                  <TableCell align="right">{canManageLifecycle ? <Button size="small" onClick={() => openCanonicalHr(tech.uid)}>MANAGE IN HR</Button> : <Typography variant="caption" color="text.secondary">HR-managed</Typography>}</TableCell>
                </TableRow>;
              })}
              {filteredTechs.length === 0 && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}>No technicians found.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Container>
  );
}
