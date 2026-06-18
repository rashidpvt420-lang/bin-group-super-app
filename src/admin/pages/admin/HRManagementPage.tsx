import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Grid,
  InputAdornment,
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
  alpha,
} from '@mui/material';
import { DollarSign, FileText, HeartPulse, Search as SearchIcon, ShieldCheck, UserPlus, Users as UsersIcon } from 'lucide-react';
import {
  auth,
  collection,
  db,
  doc,
  functions,
  httpsCallable,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@/lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { useAuth } from '../../context/AuthContext';
import RegisterStaffDialog from '../../components/RegisterStaffDialog';
import { HR_SELF_SERVICE_COLLECTIONS, PAPERLESS_HR_PUBLIC_COPY } from '../../../lib/hrSelfServiceBlueprint';

const STAFF_ROLES = [
  'technician',
  'hr_staff',
  'hr_manager',
  'finance_staff',
  'account_manager',
  'finance_admin',
  'operations_manager',
  'dispatcher',
];

const PAYROLL_PERIOD = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

type StaffRow = {
  id: string;
  displayName?: string;
  fullName?: string;
  email?: string;
  role?: string;
  trade?: string;
  specialization?: string;
  baseZone?: string;
  emirate?: string;
  status?: string;
  basicSalary?: number;
  allowances?: number;
  salary?: number;
  grossSalary?: number;
  salaryPackage?: Record<string, any>;
};

type StaffRequest = {
  id: string;
  uid?: string;
  email?: string;
  displayName?: string;
  requestType?: string;
  requestLabel?: string;
  category?: string;
  priority?: string;
  reason?: string;
  status?: string;
  createdAt?: any;
};

const formatMoney = (value: any) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Pending sync';
  return `AED ${amount.toLocaleString()}`;
};

const requestTitle = (value: string) => String(value || 'hr_support').replace(/_/g, ' ').toUpperCase();

const statusTone = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('approved') || normalized === 'active') return '#10b981';
  if (normalized.includes('reject') || normalized === 'inactive') return '#ef4444';
  return '#eab308';
};

export default function HRManagementPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [payrollBusyId, setPayrollBusyId] = useState<string | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);

  const isHRManager = user?.role === 'hr_manager' || user?.role === 'admin' || user?.role === 'ceo' || user?.role === 'super_admin';
  const isFinanceRole = ['finance_staff', 'account_manager', 'finance_admin', 'admin', 'ceo', 'super_admin'].includes(user?.role || '');

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    setLoading(true);

    try {
      const staffQuery = query(collection(db, 'users'), where('role', 'in', STAFF_ROLES));
      unsubscribers.push(onSnapshot(staffQuery, (snap) => {
        setStaff(snap.docs.map((item) => ({ id: item.id, ...(item.data() as StaffRow) })));
        setLoading(false);
      }, (error) => {
        console.error('HR staff registry sync failed:', error);
        setNotice('Staff registry sync failed. Check Firestore indexes/rules for HR roles.');
        setLoading(false);
      }));
    } catch (error) {
      console.error('HR staff query creation failed:', error);
      setNotice('Staff registry query could not start.');
      setLoading(false);
    }

    try {
      const requestQuery = query(collection(db, 'staffRequests'), orderBy('createdAt', 'desc'), limit(150));
      unsubscribers.push(onSnapshot(requestQuery, (snap) => {
        setRequests(snap.docs.map((item) => ({ id: item.id, ...(item.data() as StaffRequest) })));
      }, (error) => {
        console.error('HR request queue sync failed:', error);
        setNotice('Request queue sync failed. Check staffRequests permissions.');
      }));
    } catch (error) {
      console.error('HR request query creation failed:', error);
    }

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const filteredStaff = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return staff;
    return staff.filter((s) => [s.displayName, s.fullName, s.email, s.role, s.trade, s.specialization, s.baseZone, s.emirate]
      .some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [staff, searchTerm]);

  const stats = useMemo(() => {
    const active = staff.filter((s) => String(s.status || 'ACTIVE').toUpperCase() === 'ACTIVE').length;
    const pending = requests.filter((r) => String(r.status || '').includes('pending')).length;
    const urgent = requests.filter((r) => r.priority === 'urgent').length;
    return { active, pending, urgent, total: staff.length };
  }, [staff, requests]);

  const reviewRequest = async (requestId: string, approve: boolean) => {
    try {
      setReviewBusyId(requestId);
      await updateDoc(doc(db, 'staffRequests', requestId), {
        status: approve ? 'approved' : 'rejected',
        reviewedById: user?.uid || null,
        reviewedBy: user?.displayName || user?.email || 'HR Command',
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNotice(approve ? 'HR request approved.' : 'HR request rejected.');
    } catch (error: any) {
      setNotice(error?.message || 'Failed to review HR request.');
    } finally {
      setReviewBusyId(null);
    }
  };

  const generatePayslip = async (s: StaffRow) => {
    try {
      setPayrollBusyId(s.id);
      if (!auth.currentUser) throw new Error('Admin session is not active. Sign in again.');
      await auth.currentUser.getIdToken(true);
      const generate = httpsCallable(functions, 'generateAndEmailPayslip');
      const basicSalary = Number(s.basicSalary || s.salaryPackage?.basicSalary || s.salary || 0);
      const allowances = Number(s.allowances || s.salaryPackage?.allowances || 0);
      if (!basicSalary && !allowances) throw new Error('Salary data is not configured for this staff member.');
      await generate({
        staffId: s.id,
        staffName: s.displayName || s.fullName || 'Staff Member',
        staffEmail: s.email,
        payPeriod: PAYROLL_PERIOD,
        basicSalary,
        allowances,
        overtime: 0,
        deductions: 0,
      });
      setNotice(`Payslip generation requested for ${s.displayName || s.fullName || s.email || s.id}.`);
    } catch (error: any) {
      setNotice(error?.message || 'Payslip generation failed.');
    } finally {
      setPayrollBusyId(null);
    }
  };

  const MetricCard = ({ title, value, caption, icon }: { title: string; value: string | number; caption: string; icon: React.ReactNode }) => (
    <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: 5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <Box sx={{ color: binThemeTokens.gold }}>{icon}</Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, letterSpacing: 1.2 }}>{title}</Typography>
      </Stack>
      <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950 }}>{value}</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)' }}>{caption}</Typography>
    </Paper>
  );

  if (loading) {
    return (
      <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617' }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4 }}>
      <Container maxWidth="xl">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 4 }}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>BIN PEOPLE AI · SOVEREIGN HUMAN CAPITAL</Typography>
            <Typography variant="h3" fontWeight="950" color="#FFF">HR <Box component="span" sx={{ color: binThemeTokens.gold }}>Command</Box></Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', maxWidth: 900, mt: 1 }}>{PAPERLESS_HR_PUBLIC_COPY.shortDescription}</Typography>
          </Box>
          {isHRManager && (
            <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={() => setIsRegisterDialogOpen(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
              REGISTER STAFF
            </Button>
          )}
        </Stack>

        <RegisterStaffDialog open={isRegisterDialogOpen} onClose={() => setIsRegisterDialogOpen(false)} />

        {notice && <Alert severity={notice.toLowerCase().includes('fail') || notice.toLowerCase().includes('error') ? 'warning' : 'info'} onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice}</Alert>}

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}><MetricCard title="ACTIVE STAFF" value={stats.active} caption={`${stats.total} total staff records`} icon={<UsersIcon size={22} />} /></Grid>
          <Grid item xs={12} sm={6} md={3}><MetricCard title="PENDING HR CASES" value={stats.pending} caption="Awaiting manager decision" icon={<FileText size={22} />} /></Grid>
          <Grid item xs={12} sm={6} md={3}><MetricCard title="URGENT CASES" value={stats.urgent} caption="Safety, complaint, or welfare priority" icon={<HeartPulse size={22} />} /></Grid>
          <Grid item xs={12} sm={6} md={3}><MetricCard title="HR COLLECTIONS" value={HR_SELF_SERVICE_COLLECTIONS.length} caption="Paperless staff dossier coverage" icon={<ShieldCheck size={22} />} /></Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: 0, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <TextField
                  fullWidth
                  placeholder="Search staff by name, email, role, trade, or zone"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon size={18} color="rgba(255,255,255,0.38)" /></InputAdornment> }}
                  sx={{ '& .MuiInputBase-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 2 } }}
                />
              </Box>
              <TableContainer>
                <Table>
                  <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.025)' }}>
                    <TableRow>
                      <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PERSONNEL</TableCell>
                      <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ROLE / TRADE</TableCell>
                      <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ZONE</TableCell>
                      <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PAYROLL</TableCell>
                      <TableCell align="right" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ACTIONS</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredStaff.map((s) => (
                      <TableRow key={s.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.18), color: binThemeTokens.gold, fontWeight: 900 }}>{(s.displayName || s.fullName || 'S').charAt(0)}</Avatar>
                            <Box>
                              <Typography color="#FFF" fontWeight="900">{s.displayName || s.fullName || 'Staff Member'}</Typography>
                              <Typography variant="caption" color="textSecondary">{s.email || s.id}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell><Typography color="#FFF" fontWeight="800">{String(s.role || 'staff').toUpperCase()}</Typography><Typography variant="caption" color="textSecondary">{s.trade || s.specialization || 'N/A'}</Typography></TableCell>
                        <TableCell><Typography color="#FFF">{s.baseZone || s.emirate || 'UAE'}</Typography></TableCell>
                        <TableCell><Typography color="#10b981" fontWeight="900">{formatMoney(s.grossSalary || s.salary || s.salaryPackage?.grossSalary)}</Typography></TableCell>
                        <TableCell align="right">
                          {isFinanceRole && (
                            <Button size="small" variant="outlined" startIcon={payrollBusyId === s.id ? <CircularProgress size={14} /> : <DollarSign size={14} />} disabled={Boolean(payrollBusyId)} onClick={() => generatePayslip(s)} sx={{ borderColor: alpha(binThemeTokens.gold, 0.35), color: binThemeTokens.gold, fontWeight: 900 }}>
                              PAYSLIP
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950, mb: 2 }}>HR Request Queue</Typography>
              <Stack spacing={1.5}>
                {requests.length === 0 && <Typography color="rgba(255,255,255,0.55)">No HR requests found.</Typography>}
                {requests.slice(0, 20).map((request) => (
                  <Paper key={request.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}>
                      <Box>
                        <Typography color="#FFF" fontWeight="900">{requestTitle(request.requestLabel || request.requestType || request.category || 'HR Request')}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>{request.reason || request.email || request.displayName || 'No request detail provided'}</Typography>
                        <Chip size="small" label={String(request.status || 'pending_hr_review').replace(/_/g, ' ').toUpperCase()} sx={{ mt: 1, bgcolor: alpha(statusTone(request.status || ''), 0.12), color: statusTone(request.status || ''), fontWeight: 900 }} />
                      </Box>
                      {isHRManager && (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Button size="small" disabled={reviewBusyId === request.id} onClick={() => reviewRequest(request.id, true)} sx={{ color: '#10b981', fontWeight: 900 }}>APPROVE</Button>
                          <Button size="small" disabled={reviewBusyId === request.id} onClick={() => reviewRequest(request.id, false)} sx={{ color: '#ef4444', fontWeight: 900 }}>REJECT</Button>
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
