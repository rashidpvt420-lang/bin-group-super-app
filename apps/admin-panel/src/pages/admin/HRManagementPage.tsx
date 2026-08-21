import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Container, Grid, InputAdornment,
  Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography, alpha,
} from '@mui/material';
import { BadgeDollarSign, FileText, Search, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';
import { collection, db, onSnapshot, query, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { useAuth } from '../../context/AuthContext';
import StaffAccessPage from './StaffAccessPage';
import StaffLifecycleDialog, { type StaffLifecycleTarget } from './StaffLifecycleDialog';
import { STAFF_ROLE_VALUES } from '../../constants/staffRoles';

interface StaffRow extends StaffLifecycleTarget {
  department?: string;
  specialization?: string;
  emirate?: string;
  performanceScore?: number;
  staffModules?: string[];
  lastLogin?: any;
}

const statusColor = (status: string) => {
  const value = String(status || '').toUpperCase();
  if (value === 'ACTIVE') return 'success' as const;
  if (value === 'SUSPENDED') return 'warning' as const;
  if (value === 'EXITED') return 'error' as const;
  return 'default' as const;
};

export default function HRManagementPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<StaffRow | null>(null);
  const [selectedInitialTab, setSelectedInitialTab] = useState(0);

  const privileged = new Set(['super_admin', 'admin', 'ceo', 'hr_admin', 'hr_manager']);
  const userRole = String(user?.role || user?.claims?.role || '').toLowerCase();
  const isHRManager = Boolean(user?.claims?.admin === true || user?.isAdmin === true || user?.claims?.ceo === true || privileged.has(userRole));
  const isHRStaff = Boolean(isHRManager || userRole === 'hr_staff');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'users'), where('role', 'in', STAFF_ROLE_VALUES)),
      (snapshot) => {
        setStaff(snapshot.docs.map((entry) => {
          const data = entry.data();
          return {
            id: entry.id,
            displayName: data.displayName || data.fullName || 'Unnamed staff',
            email: data.email || '',
            role: data.role || 'support_admin',
            status: String(data.status || 'ACTIVE').toUpperCase(),
            department: data.department || '', specialization: data.specialization || '', emirate: data.emirate || '',
            performanceScore: Number.isFinite(Number(data.performanceScore)) ? Number(data.performanceScore) : undefined,
            staffModules: Array.isArray(data.staffModules) ? data.staffModules : [], lastLogin: data.lastLogin || data.lastLoginAt,
          };
        }));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'payroll'), (snapshot) => setPayrollRecords(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
    return unsubscribe;
  }, []);

  const filteredStaff = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return staff;
    return staff.filter((member) => [member.displayName, member.email, member.role, member.department, member.specialization, member.emirate].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [staff, searchTerm]);

  const staffSummary = useMemo(() => ({
    active: staff.filter((item) => item.status === 'ACTIVE').length,
    suspended: staff.filter((item) => item.status === 'SUSPENDED').length,
    exited: staff.filter((item) => item.status === 'EXITED').length,
    technicians: staff.filter((item) => item.role === 'technician').length,
  }), [staff]);

  const payrollSummary = useMemo(() => {
    const grouped = new Map<string, { month: string; total: number; paid: number; count: number }>();
    payrollRecords.forEach((record) => {
      const month = String(record.month || record.period || record.payPeriod || 'UNSPECIFIED');
      const existing = grouped.get(month) || { month, total: 0, paid: 0, count: 0 };
      existing.total += Number(record.netPay ?? record.amount ?? record.total ?? 0) || 0;
      existing.count += 1;
      if (String(record.status || '').toUpperCase() === 'PAID') existing.paid += 1;
      grouped.set(month, existing);
    });
    return [...grouped.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 8);
  }, [payrollRecords]);

  const openLifecycle = (member: StaffRow, preferredTab?: number) => {
    setSelectedInitialTab(preferredTab ?? 0);
    setSelectedStaff(member);
  };

  if (loading) return <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  return <Box sx={{ minHeight: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4 }} data-testid="admin-staff-access-route">
    <Container maxWidth="xl"><Stack spacing={4}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap">
        <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>BIN GROUP HUMAN CAPITAL</Typography><Typography variant="h3" fontWeight={950} color="#fff">HR <Box component="span" sx={{ color: binThemeTokens.gold }}>Command Center</Box></Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: 1, maxWidth: 820 }}>One staff directory for every supported BIN GROUP staff role, with secure onboarding, employment profile, attendance, leave, HR documents, payroll/KPI evidence, access control and offboarding.</Typography></Box>
        {isHRManager ? <Button data-testid="admin-open-secure-staff-access" variant="contained" startIcon={<UserPlus size={18} />} onClick={() => setTab(4)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>REGISTER STAFF</Button> : null}
      </Box>

      <Grid container spacing={2}>{[['ACTIVE', staffSummary.active, <ShieldCheck size={20} />], ['TECHNICIANS', staffSummary.technicians, <UsersRound size={20} />], ['SUSPENDED', staffSummary.suspended, <UsersRound size={20} />], ['EXITED', staffSummary.exited, <UsersRound size={20} />]].map(([label, value, icon]) => <Grid item xs={6} md={3} key={String(label)}><Paper sx={{ p: 2.5, bgcolor: 'rgba(15,23,42,.65)' }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h4" fontWeight={950}>{String(value)}</Typography></Box><Box color={binThemeTokens.gold}>{icon}</Box></Stack></Paper></Grid>)}</Grid>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" data-testid="admin-hr-tabs"><Tab label="STAFF REGISTRY" /><Tab label="ATTENDANCE & LEAVE" disabled={!isHRStaff} /><Tab label="PAYROLL & KPI" disabled={!isHRManager} /><Tab label="HR DOCUMENTS" disabled={!isHRStaff} /><Tab label="STAFF ACCESS" disabled={!isHRManager} /></Tabs>

      {tab === 0 ? <Paper sx={{ overflow: 'hidden', bgcolor: 'rgba(15,23,42,.55)' }} data-testid="admin-staff-registry"><Box p={2.5} display="flex" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap"><TextField size="small" placeholder="Search name, role, department, zone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} sx={{ minWidth: 320 }} /><Chip label={`${filteredStaff.length} PERSONNEL`} /></Box><StaffRegistryTable staff={filteredStaff} canManage={isHRManager} onOpen={openLifecycle} /></Paper> : null}

      {tab === 1 && isHRStaff ? <Stack spacing={2} data-testid="admin-attendance-leave-hub"><Alert severity="info">Attendance and leave are recorded against the same canonical staff identities. Open a lifecycle profile to record attendance, create leave, and approve/reject pending requests.</Alert><Paper sx={{ overflow: 'hidden', bgcolor: 'rgba(15,23,42,.55)' }}><StaffRegistryTable staff={filteredStaff} canManage={isHRManager} onOpen={(member) => openLifecycle(member, 2)} actionLabel="MANAGE ATTENDANCE / LEAVE" /></Paper></Stack> : null}

      {tab === 2 && isHRManager ? <Stack spacing={2} data-testid="admin-payroll-kpi-hub"><Alert severity="info">Payroll remains ledger-backed. Staff KPI is calculated from real attendance and, for technicians, assigned maintenance jobs. Missing evidence displays N/A.</Alert><Grid container spacing={2}><Grid item xs={12} md={5}><Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, .06), border: `1px solid ${alpha(binThemeTokens.gold, .35)}` }}><BadgeDollarSign size={36} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight={950} mt={1}>STAFF PAYROLL CONTROL</Typography><Typography variant="body2" color="text.secondary" mt={1}>Open any staff profile to see salary package, linked payroll history and explainable KPI evidence.</Typography></Paper></Grid><Grid item xs={12} md={7}><Paper sx={{ p: 2, bgcolor: 'rgba(15,23,42,.55)' }}><Table size="small"><TableHead><TableRow><TableCell>PERIOD</TableCell><TableCell>GROSS / NET</TableCell><TableCell>RECORDS</TableCell><TableCell>SETTLED</TableCell></TableRow></TableHead><TableBody>{payrollSummary.length ? payrollSummary.map((item) => <TableRow key={item.month}><TableCell>{item.month}</TableCell><TableCell>AED {item.total.toLocaleString('en-AE')}</TableCell><TableCell>{item.count}</TableCell><TableCell>{item.paid}/{item.count}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} align="center">No payroll ledger records yet.</TableCell></TableRow>}</TableBody></Table></Paper></Grid></Grid><Paper sx={{ overflow: 'hidden', bgcolor: 'rgba(15,23,42,.55)' }}><StaffRegistryTable staff={filteredStaff} canManage onOpen={(member) => openLifecycle(member, 5)} actionLabel="OPEN PAYROLL / KPI" /></Paper></Stack> : null}

      {tab === 3 && isHRStaff ? <Stack spacing={2} data-testid="admin-hr-documents-hub"><Alert severity="success" icon={<FileText />}>HR document storage is active for PDF/images under the protected <strong>hrDocuments/&lt;staffId&gt;</strong> path. Files are registered with type, title, expiry and audit evidence.</Alert><Paper sx={{ overflow: 'hidden', bgcolor: 'rgba(15,23,42,.55)' }}><StaffRegistryTable staff={filteredStaff} canManage={isHRManager} onOpen={(member) => openLifecycle(member, 4)} actionLabel="OPEN HR DOCUMENTS" /></Paper></Stack> : null}

      {tab === 4 && isHRManager ? <StaffAccessPage /> : null}
    </Stack></Container>
    <StaffLifecycleDialog target={selectedStaff} open={Boolean(selectedStaff)} initialTab={selectedInitialTab} onClose={() => setSelectedStaff(null)} />
  </Box>;
}

function StaffRegistryTable({ staff, canManage, onOpen, actionLabel = 'OPEN STAFF PROFILE' }: { staff: StaffRow[]; canManage: boolean; onOpen: (member: StaffRow) => void; actionLabel?: string; }) {
  return <TableContainer><Table size="small"><TableHead><TableRow><TableCell>PERSONNEL</TableCell><TableCell>ROLE</TableCell><TableCell>DEPARTMENT / SPECIALIZATION</TableCell><TableCell>ZONE</TableCell><TableCell>STATUS</TableCell><TableCell align="right">ACTION</TableCell></TableRow></TableHead><TableBody>{staff.length ? staff.map((member) => <TableRow key={member.id} hover data-testid={`hr-staff-row-${member.id}`}><TableCell><Stack direction="row" spacing={1.5} alignItems="center"><Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, .18), color: binThemeTokens.gold }}>{member.displayName.charAt(0).toUpperCase()}</Avatar><Box><Typography variant="body2" fontWeight={900}>{member.displayName}</Typography><Typography variant="caption" color="text.secondary">{member.email}</Typography></Box></Stack></TableCell><TableCell>{member.role.replace(/_/g, ' ').toUpperCase()}</TableCell><TableCell><Typography variant="body2">{member.department || '—'}</Typography><Typography variant="caption" color="text.secondary">{member.specialization || '—'}</Typography></TableCell><TableCell>{member.emirate || 'Global'}</TableCell><TableCell><Chip size="small" color={statusColor(member.status)} label={member.status} /></TableCell><TableCell align="right"><Button data-testid={`open-staff-lifecycle-${member.id}`} size="small" variant="outlined" disabled={!canManage} onClick={() => onOpen(member)}>{actionLabel}</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}>No staff matched this filter.</TableCell></TableRow>}</TableBody></Table></TableContainer>;
}
