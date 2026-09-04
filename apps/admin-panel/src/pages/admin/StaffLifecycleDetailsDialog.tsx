import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Mail, Save, ShieldAlert, UserX } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah', 'Al Ain'];

const emptyProfile = {
  displayName: '',
  phoneNumber: '',
  department: '',
  jobTitle: '',
  specialization: '',
  joiningDate: '',
  probationEndDate: '',
  contractEndDate: '',
  employmentType: 'full_time',
  shiftName: '',
  workingHours: '',
  offDay: '',
  employeeId: '',
  emiratesId: '',
  passportNumber: '',
  visaExpiryDate: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactPhone: '',
  basicSalary: '',
  housingAllowance: '',
  transportAllowance: '',
  foodAllowance: '',
  otherAllowance: '',
  salaryPaymentDay: '1',
  salaryGrade: '',
  primaryEmirate: '',
  emiratesCovered: '',
  maxConcurrentJobs: '3',
  emergencyEligible: false,
};

const emptyChecklist = {
  profileComplete: false,
  documentsComplete: false,
  contractComplete: false,
  deviceReady: false,
  activationApproved: false,
};

function safeError(error: any) {
  return String(error?.details || error?.message || error?.code || 'Protected staff operation failed.')
    .replace(/^FirebaseError:\s*/i, '')
    .slice(0, 360);
}

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statusColor(value: string) {
  const status = String(value || '').toUpperCase();
  if (status === 'ACTIVE') return 'success';
  if (status === 'OFFBOARDED' || status === 'SUSPENDED') return 'error';
  if (status === 'INVITED') return 'warning';
  return 'info';
}

export default function StaffLifecycleDetailsDialog({
  uid,
  open,
  onClose,
  onChanged,
}: {
  uid: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [profile, setProfile] = useState(emptyProfile);
  const [checklist, setChecklist] = useState(emptyChecklist);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [offboardReason, setOffboardReason] = useState('');
  const [confirmOffboard, setConfirmOffboard] = useState(false);

  const load = useCallback(async () => {
    if (!open || !uid) return;
    setLoading(true);
    setNotice(null);
    try {
      const getDetails = httpsCallable(functions, 'adminGetStaffDetails');
      const response: any = await getDetails({ uid });
      const data = response.data || {};
      const staff = data.staff || {};
      const salary = staff.salaryPackage || {};
      setDetails(data);
      setProfile({
        displayName: staff.displayName || '',
        phoneNumber: staff.phoneNumber || '',
        department: staff.department || '',
        jobTitle: staff.jobTitle || '',
        specialization: staff.specialization || '',
        joiningDate: staff.joiningDate || '',
        probationEndDate: staff.probationEndDate || '',
        contractEndDate: staff.contractEndDate || '',
        employmentType: staff.employmentType || 'full_time',
        shiftName: staff.shiftName || '',
        workingHours: staff.workingHours || '',
        offDay: staff.offDay || '',
        employeeId: staff.employeeId || '',
        emiratesId: staff.emiratesId || '',
        passportNumber: staff.passportNumber || '',
        visaExpiryDate: staff.visaExpiryDate || '',
        emergencyContactName: staff.emergencyContact?.name || '',
        emergencyContactRelationship: staff.emergencyContact?.relationship || '',
        emergencyContactPhone: staff.emergencyContact?.phone || '',
        basicSalary: salary.basicSalary != null ? String(salary.basicSalary) : '',
        housingAllowance: salary.housingAllowance != null ? String(salary.housingAllowance) : '',
        transportAllowance: salary.transportAllowance != null ? String(salary.transportAllowance) : '',
        foodAllowance: salary.foodAllowance != null ? String(salary.foodAllowance) : '',
        otherAllowance: salary.otherAllowance != null ? String(salary.otherAllowance) : '',
        salaryPaymentDay: salary.salaryPaymentDay != null ? String(salary.salaryPaymentDay) : '1',
        salaryGrade: salary.salaryGrade || '',
        primaryEmirate: staff.primaryEmirate || '',
        emiratesCovered: Array.isArray(staff.emiratesCovered) ? staff.emiratesCovered.join(', ') : '',
        maxConcurrentJobs: staff.maxConcurrentJobs != null ? String(staff.maxConcurrentJobs) : '3',
        emergencyEligible: Boolean(staff.emergencyEligible),
      });
      const current = staff.onboardingChecklist || {};
      setChecklist({
        profileComplete: current.profileComplete === true,
        documentsComplete: current.documentsComplete === true,
        contractComplete: current.contractComplete === true,
        deviceReady: staff.role === 'technician' ? current.deviceReady === true : true,
        activationApproved: current.activationApproved === true,
      });
    } catch (error) {
      setDetails(null);
      setNotice({ severity: 'error', message: `Staff lifecycle could not load: ${safeError(error)}` });
    } finally {
      setLoading(false);
    }
  }, [open, uid]);

  useEffect(() => { void load(); }, [load]);

  const staff = details?.staff || null;
  const canManage = details?.canManageLifecycle === true;
  const privateFieldsIncluded = details?.privateFieldsIncluded === true;
  const terminal = ['OFFBOARDED', 'SUSPENDED'].includes(String(staff?.status || '').toUpperCase());

  const attendance = useMemo(() => Array.isArray(details?.attendance) ? details.attendance : [], [details?.attendance]);
  const leaveRequests = useMemo(() => Array.isArray(details?.leaveRequests) ? details.leaveRequests : [], [details?.leaveRequests]);
  const documents = useMemo(() => Array.isArray(details?.documents) ? details.documents : [], [details?.documents]);
  const payroll = useMemo(() => Array.isArray(details?.payroll) ? details.payroll : [], [details?.payroll]);

  const invoke = async (name: string, payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await httpsCallable(functions, name)(payload);
      setNotice({ severity: 'success', message: success });
      await load();
      await onChanged?.();
    } catch (error) {
      setNotice({ severity: 'error', message: safeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!staff) return;
    const payload: Record<string, unknown> = {
      uid,
      displayName: profile.displayName,
      phoneNumber: profile.phoneNumber,
      department: profile.department,
      jobTitle: profile.jobTitle,
      specialization: profile.specialization,
      joiningDate: profile.joiningDate,
      probationEndDate: profile.probationEndDate,
      contractEndDate: profile.contractEndDate,
      employmentType: profile.employmentType,
      shiftName: profile.shiftName,
      workingHours: profile.workingHours,
      offDay: profile.offDay,
    };
    if (privateFieldsIncluded) {
      Object.assign(payload, {
        employeeId: profile.employeeId,
        emiratesId: profile.emiratesId,
        passportNumber: profile.passportNumber,
        visaExpiryDate: profile.visaExpiryDate,
        emergencyContactName: profile.emergencyContactName,
        emergencyContactRelationship: profile.emergencyContactRelationship,
        emergencyContactPhone: profile.emergencyContactPhone,
        basicSalary: numberOrUndefined(profile.basicSalary),
        housingAllowance: numberOrUndefined(profile.housingAllowance),
        transportAllowance: numberOrUndefined(profile.transportAllowance),
        foodAllowance: numberOrUndefined(profile.foodAllowance),
        otherAllowance: numberOrUndefined(profile.otherAllowance),
        salaryPaymentDay: numberOrUndefined(profile.salaryPaymentDay),
        salaryGrade: profile.salaryGrade,
      });
    }
    if (staff.role === 'technician') {
      Object.assign(payload, {
        primaryEmirate: profile.primaryEmirate,
        emiratesCovered: profile.emiratesCovered.split(',').map((value) => value.trim()).filter(Boolean),
        maxConcurrentJobs: numberOrUndefined(profile.maxConcurrentJobs),
        emergencyEligible: profile.emergencyEligible,
      });
    }
    await invoke('adminUpdateStaffProfile', payload, `${staff.displayName} profile updated through the canonical HR lifecycle.`);
  };

  const saveOnboarding = async () => {
    if (!staff) return;
    await invoke('adminUpdateStaffOnboarding', { uid, ...checklist }, `${staff.displayName} onboarding state updated.`);
  };

  const resendInvitation = async () => {
    if (!staff) return;
    await invoke('adminResendStaffInvitation', { uid }, `Secure invitation re-queued for ${staff.displayName}.`);
  };

  const offboard = async () => {
    if (!staff || offboardReason.trim().length < 4) {
      setNotice({ severity: 'warning', message: 'Enter a clear offboarding reason before continuing.' });
      return;
    }
    await invoke('adminOffboardStaff', { uid, reason: offboardReason.trim() }, `${staff.displayName} offboarded. Auth disabled, tokens revoked and historical records preserved.`);
    setConfirmOffboard(false);
    setOffboardReason('');
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xl" data-testid="admin-staff-details-page">
      <DialogTitle sx={{ bgcolor: '#020617', color: '#fff', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>CANONICAL STAFF LIFECYCLE</Typography>
            <Typography variant="h5" fontWeight={950}>{staff?.displayName || 'Staff profile'}</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.55)' }}>{staff?.email || uid}</Typography>
          </Box>
          {staff && <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Chip color={statusColor(staff.status) as any} label={String(staff.status || 'UNKNOWN').replace(/_/g, ' ')} /><Chip variant="outlined" label={String(staff.role || '').replace(/_/g, ' ').toUpperCase()} /><Chip variant="outlined" label={String(staff.onboardingStage || staff.lifecycleState || 'UNKNOWN').replace(/_/g, ' ')} /></Stack>}
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ bgcolor: '#020617', color: '#fff', py: 3 }}>
        {loading && <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>}
        {notice && <Alert severity={notice.severity} sx={{ mb: 2 }}>{notice.message}</Alert>}
        {!loading && staff && (
          <Stack spacing={3}>
            {!canManage && <Alert severity="info">HR Staff access is read-only. Private identity and salary fields remain server-redacted.</Alert>}

            <Grid container spacing={3}>
              <Grid item xs={12} lg={8}>
                <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.82)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 }}>
                  <Typography variant="h6" fontWeight={950}>Identity & employment profile</Typography>
                  <Divider sx={{ my: 2 }} />
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Full name" value={profile.displayName} disabled={!canManage} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Phone" value={profile.phoneNumber} disabled={!canManage} onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Department" value={profile.department} disabled={!canManage} onChange={(e) => setProfile({ ...profile, department: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Job title" value={profile.jobTitle} disabled={!canManage} onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Specialization" value={profile.specialization} disabled={!canManage} onChange={(e) => setProfile({ ...profile, specialization: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label="Joining date" value={profile.joiningDate} disabled={!canManage} onChange={(e) => setProfile({ ...profile, joiningDate: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label="Probation end" value={profile.probationEndDate} disabled={!canManage} onChange={(e) => setProfile({ ...profile, probationEndDate: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label="Contract end" value={profile.contractEndDate} disabled={!canManage} onChange={(e) => setProfile({ ...profile, contractEndDate: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Employment type" value={profile.employmentType} disabled={!canManage} onChange={(e) => setProfile({ ...profile, employmentType: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Shift" value={profile.shiftName} disabled={!canManage} onChange={(e) => setProfile({ ...profile, shiftName: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Working hours" value={profile.workingHours} disabled={!canManage} onChange={(e) => setProfile({ ...profile, workingHours: e.target.value })} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Off day" value={profile.offDay} disabled={!canManage} onChange={(e) => setProfile({ ...profile, offDay: e.target.value })} /></Grid>
                  </Grid>

                  {staff.role === 'technician' && <><Divider sx={{ my: 3 }} /><Typography variant="subtitle1" fontWeight={950} sx={{ color: binThemeTokens.gold }}>Technician operational profile</Typography><Grid container spacing={2} sx={{ mt: .5 }}><Grid item xs={12} md={4}><TextField select fullWidth label="Primary emirate" value={profile.primaryEmirate} disabled={!canManage} onChange={(e) => setProfile({ ...profile, primaryEmirate: e.target.value })}><MenuItem value="">Unassigned</MenuItem>{EMIRATES.map((emirate) => <MenuItem key={emirate} value={emirate}>{emirate}</MenuItem>)}</TextField></Grid><Grid item xs={12} md={5}><TextField fullWidth label="Emirates covered" value={profile.emiratesCovered} disabled={!canManage} onChange={(e) => setProfile({ ...profile, emiratesCovered: e.target.value })} helperText="Comma separated" /></Grid><Grid item xs={12} md={3}><TextField fullWidth type="number" label="Max concurrent jobs" value={profile.maxConcurrentJobs} disabled={!canManage} onChange={(e) => setProfile({ ...profile, maxConcurrentJobs: e.target.value })} /></Grid><Grid item xs={12}><FormControlLabel control={<Checkbox checked={profile.emergencyEligible} disabled={!canManage} onChange={(e) => setProfile({ ...profile, emergencyEligible: e.target.checked })} />} label="Emergency eligible" /></Grid></Grid></>}

                  {privateFieldsIncluded && <><Divider sx={{ my: 3 }} /><Typography variant="subtitle1" fontWeight={950} sx={{ color: binThemeTokens.gold }}>Private HR & payroll</Typography><Grid container spacing={2} sx={{ mt: .5 }}><Grid item xs={12} md={4}><TextField fullWidth label="Employee ID" value={profile.employeeId} disabled={!canManage} onChange={(e) => setProfile({ ...profile, employeeId: e.target.value })} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Emirates ID" value={profile.emiratesId} disabled={!canManage} onChange={(e) => setProfile({ ...profile, emiratesId: e.target.value })} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Passport number" value={profile.passportNumber} disabled={!canManage} onChange={(e) => setProfile({ ...profile, passportNumber: e.target.value })} /></Grid><Grid item xs={12} md={4}><TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label="Visa expiry" value={profile.visaExpiryDate} disabled={!canManage} onChange={(e) => setProfile({ ...profile, visaExpiryDate: e.target.value })} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Basic salary (AED)" value={profile.basicSalary} disabled={!canManage} onChange={(e) => setProfile({ ...profile, basicSalary: e.target.value })} /></Grid><Grid item xs={12} md={4}><TextField fullWidth label="Salary grade" value={profile.salaryGrade} disabled={!canManage} onChange={(e) => setProfile({ ...profile, salaryGrade: e.target.value })} /></Grid><Grid item xs={12} md={3}><TextField fullWidth label="Housing allowance" value={profile.housingAllowance} disabled={!canManage} onChange={(e) => setProfile({ ...profile, housingAllowance: e.target.value })} /></Grid><Grid item xs={12} md={3}><TextField fullWidth label="Transport allowance" value={profile.transportAllowance} disabled={!canManage} onChange={(e) => setProfile({ ...profile, transportAllowance: e.target.value })} /></Grid><Grid item xs={12} md={3}><TextField fullWidth label="Food allowance" value={profile.foodAllowance} disabled={!canManage} onChange={(e) => setProfile({ ...profile, foodAllowance: e.target.value })} /></Grid><Grid item xs={12} md={3}><TextField fullWidth label="Other allowance" value={profile.otherAllowance} disabled={!canManage} onChange={(e) => setProfile({ ...profile, otherAllowance: e.target.value })} /></Grid></Grid></>}

                  {canManage && <Button startIcon={<Save size={17} />} variant="contained" onClick={() => void saveProfile()} disabled={busy || terminal} sx={{ mt: 3, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>SAVE CANONICAL PROFILE</Button>}
                </Paper>
              </Grid>

              <Grid item xs={12} lg={4}>
                <Stack spacing={3}>
                  <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.82)', borderRadius: 4 }}>
                    <Typography variant="h6" fontWeight={950}>Activation checklist</Typography>
                    <Typography variant="body2" sx={{ mt: 1, mb: 2, color: 'rgba(255,255,255,.55)' }}>Email verification is read from Firebase Auth. HR controls the remaining prerequisites; no client can self-activate.</Typography>
                    <FormControlLabel control={<Checkbox checked={checklist.profileComplete} disabled={!canManage || terminal} onChange={(e) => setChecklist({ ...checklist, profileComplete: e.target.checked })} />} label="Profile complete" />
                    <FormControlLabel control={<Checkbox checked={checklist.documentsComplete} disabled={!canManage || terminal} onChange={(e) => setChecklist({ ...checklist, documentsComplete: e.target.checked })} />} label="Documents complete" />
                    <FormControlLabel control={<Checkbox checked={checklist.contractComplete} disabled={!canManage || terminal} onChange={(e) => setChecklist({ ...checklist, contractComplete: e.target.checked })} />} label="Contract complete" />
                    {staff.role === 'technician' && <FormControlLabel control={<Checkbox checked={checklist.deviceReady} disabled={!canManage || terminal} onChange={(e) => setChecklist({ ...checklist, deviceReady: e.target.checked })} />} label="Technician device ready" />}
                    <FormControlLabel control={<Checkbox checked={checklist.activationApproved} disabled={!canManage || terminal} onChange={(e) => setChecklist({ ...checklist, activationApproved: e.target.checked })} />} label="Activation approved" />
                    {canManage && <Button fullWidth variant="contained" onClick={() => void saveOnboarding()} disabled={busy || terminal} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>SAVE ONBOARDING</Button>}
                  </Paper>

                  <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.82)', borderRadius: 4 }}>
                    <Typography variant="h6" fontWeight={950}>Lifecycle actions</Typography>
                    <Stack spacing={1.5} sx={{ mt: 2 }}>
                      {canManage && <Button startIcon={<Mail size={17} />} variant="outlined" onClick={() => void resendInvitation()} disabled={busy || terminal}>RESEND INVITATION</Button>}
                      {canManage && !terminal && <Button startIcon={<UserX size={17} />} color="error" variant="outlined" onClick={() => setConfirmOffboard(true)} disabled={busy}>OFFBOARD STAFF</Button>}
                      {terminal && <Alert severity="warning" icon={<ShieldAlert size={20} />}>This identity is terminally disabled. Historical HR, payroll and work evidence remains preserved.</Alert>}
                    </Stack>
                  </Paper>
                </Stack>
              </Grid>
            </Grid>

            <Grid container spacing={3}>
              <Grid item xs={12} lg={4}><Paper sx={{ p: 2.5, bgcolor: 'rgba(15,23,42,.82)', borderRadius: 4, height: '100%' }}><Typography variant="h6" fontWeight={950}>Attendance</Typography><Stack spacing={1} sx={{ mt: 2 }}>{attendance.slice(0, 10).map((entry: any) => <Box key={entry.id}><Typography variant="body2" fontWeight={850}>{entry.workDate || '—'} · {entry.status || '—'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.5)' }}>{entry.checkIn || '—'} → {entry.checkOut || '—'} {entry.note ? `· ${entry.note}` : ''}</Typography></Box>)}{attendance.length === 0 && <Typography variant="body2" color="text.secondary">No attendance records.</Typography>}</Stack></Paper></Grid>
              <Grid item xs={12} lg={4}><Paper sx={{ p: 2.5, bgcolor: 'rgba(15,23,42,.82)', borderRadius: 4, height: '100%' }}><Typography variant="h6" fontWeight={950}>Leave & documents</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{leaveRequests.length} leave requests · {documents.length} HR documents</Typography><Stack spacing={1} sx={{ mt: 2 }}>{leaveRequests.slice(0, 6).map((entry: any) => <Box key={entry.id}><Chip size="small" label={entry.status || 'PENDING'} /><Typography variant="caption" sx={{ ml: 1, color: 'rgba(255,255,255,.55)' }}>{entry.leaveType || 'LEAVE'} · {entry.startDate || '—'} → {entry.endDate || '—'}</Typography></Box>)}</Stack></Paper></Grid>
              <Grid item xs={12} lg={4}><Paper sx={{ p: 2.5, bgcolor: 'rgba(15,23,42,.82)', borderRadius: 4, height: '100%' }}><Typography variant="h6" fontWeight={950}>Payroll evidence</Typography>{privateFieldsIncluded ? <Table size="small" sx={{ mt: 1 }}><TableHead><TableRow><TableCell>PERIOD</TableCell><TableCell>AMOUNT</TableCell><TableCell>STATUS</TableCell></TableRow></TableHead><TableBody>{payroll.slice(0, 8).map((entry: any) => <TableRow key={entry.id}><TableCell>{entry.month || '—'}</TableCell><TableCell>{entry.amount ? `AED ${Number(entry.amount).toLocaleString('en-AE')}` : '—'}</TableCell><TableCell>{entry.status || '—'}</TableCell></TableRow>)}{payroll.length === 0 && <TableRow><TableCell colSpan={3}>No linked payroll records.</TableCell></TableRow>}</TableBody></Table> : <Alert severity="info" sx={{ mt: 2 }}>Private payroll fields are manager-only.</Alert>}</Paper></Grid>
            </Grid>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ bgcolor: '#020617', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <Button onClick={onClose} disabled={busy}>CLOSE</Button>
      </DialogActions>

      <Dialog open={confirmOffboard} onClose={() => setConfirmOffboard(false)} fullWidth maxWidth="sm">
        <DialogTitle>Offboard staff safely</DialogTitle>
        <DialogContent><Alert severity="warning" sx={{ mb: 2 }}>Firebase Auth will be disabled, refresh tokens revoked, active access archived, and historical work/payroll/audit records preserved.</Alert><TextField fullWidth label="Offboarding reason" value={offboardReason} onChange={(e) => setOffboardReason(e.target.value)} /></DialogContent>
        <DialogActions><Button onClick={() => setConfirmOffboard(false)}>CANCEL</Button><Button color="error" variant="contained" onClick={() => void offboard()} disabled={busy}>DISABLE & OFFBOARD</Button></DialogActions>
      </Dialog>
    </Dialog>
  );
}
