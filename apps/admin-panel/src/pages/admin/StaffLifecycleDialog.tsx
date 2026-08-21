import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, Grid, InputLabel, MenuItem, Paper, Select,
  Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material';
import { ExternalLink, FileUp, Mail, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { functions, getDownloadURL, httpsCallable, ref, storage, uploadBytes } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

export interface StaffLifecycleTarget {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
}

type Operations = {
  uid: string;
  role: string;
  profile: any;
  onboarding: any;
  attendance: any[];
  leaveRequests: any[];
  documents: any[];
  payroll: any[];
  audit: any[];
  kpi: any;
  generatedAt: string;
};

const emptyAttendance = () => ({ date: new Date().toISOString().slice(0, 10), status: 'PRESENT', clockIn: '', clockOut: '', notes: '' });
const emptyLeave = () => ({ leaveType: 'ANNUAL', startDate: '', endDate: '', reason: '' });
const emptyDocument = () => ({ documentType: 'CONTRACT', title: '', expiresAt: '', file: null as File | null });
const safeError = (error: any) => String(error?.details || error?.message || error?.code || 'Staff lifecycle operation failed.').replace(/^FirebaseError:\s*/i, '').slice(0, 320);
const dateLabel = (value: any) => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-AE') : value || '—'; };
const money = (value: any) => `AED ${(Number(value || 0) || 0).toLocaleString('en-AE', { maximumFractionDigits: 2 })}`;
const stateColor = (state: string): 'success' | 'warning' | 'error' | 'default' => {
  const value = String(state || '').toUpperCase();
  if (['ACTIVE', 'APPROVED', 'PRESENT', 'DELIVERED', 'SENT'].includes(value)) return 'success';
  if (['INVITED', 'PENDING', 'QUEUED', 'EMAIL_VERIFIED', 'LEAVE', 'REMOTE'].includes(value)) return 'warning';
  if (['SUSPENDED', 'EXITED', 'REJECTED', 'ABSENT'].includes(value)) return 'error';
  return 'default';
};

export default function StaffLifecycleDialog({ target, open, onClose, onChanged, initialTab = 0 }: {
  target: StaffLifecycleTarget | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  initialTab?: number;
}) {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState<Operations | null>(null);
  const [profile, setProfile] = useState<any>({});
  const [attendance, setAttendance] = useState(emptyAttendance());
  const [leave, setLeave] = useState(emptyLeave());
  const [documentForm, setDocumentForm] = useState(emptyDocument());
  const [offboardingReason, setOffboardingReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const uid = target?.id || '';

  const load = async () => {
    if (!uid) return;
    setLoading(true); setNotice(null);
    try {
      const response: any = await httpsCallable(functions, 'adminGetStaffOperations')({ uid });
      const result = response.data as Operations;
      setData(result); setProfile(result.profile || {});
    } catch (error) { setNotice({ error: true, text: safeError(error) }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (open && uid) {
      setTab(initialTab); setAttendance(emptyAttendance()); setLeave(emptyLeave());
      setDocumentForm(emptyDocument()); setOffboardingReason(''); void load();
    }
  }, [open, uid, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutate = async (name: string, payload: any, success: string) => {
    if (!uid || busy) return;
    setBusy(name); setNotice(null);
    try {
      await httpsCallable(functions, name)({ uid, ...payload });
      setNotice({ error: false, text: success }); await load(); onChanged?.();
    } catch (error) { setNotice({ error: true, text: safeError(error) }); }
    finally { setBusy(''); }
  };

  const salary = profile.salaryPackage || {};
  const totalMonthlyPackage = useMemo(() => ['basicSalary', 'housingAllowance', 'transportAllowance', 'foodAllowance', 'otherAllowance'].reduce((sum, key) => sum + Number(salary[key] || 0), 0), [salary]);

  const uploadDocument = async () => {
    if (!uid || !documentForm.file || busy) return;
    const file = documentForm.file;
    if (!(file.type === 'application/pdf' || file.type.startsWith('image/'))) { setNotice({ error: true, text: 'Only PDF and image HR documents are allowed.' }); return; }
    if (file.size > 25 * 1024 * 1024) { setNotice({ error: true, text: 'HR document exceeds the 25 MB limit.' }); return; }
    setBusy('upload-document');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `hrDocuments/${uid}/${Date.now()}-${safeName}`;
      const objectRef = ref(storage, storagePath);
      await uploadBytes(objectRef, file, { contentType: file.type, customMetadata: { staffId: uid, documentType: documentForm.documentType } });
      const downloadURL = await getDownloadURL(objectRef);
      await httpsCallable(functions, 'adminRegisterStaffDocument')({ uid, documentType: documentForm.documentType, title: documentForm.title || file.name, expiresAt: documentForm.expiresAt || undefined, fileName: file.name, contentType: file.type, storagePath, downloadURL });
      setDocumentForm(emptyDocument()); setNotice({ error: false, text: 'HR document uploaded and registered.' }); await load(); onChanged?.();
    } catch (error) { setNotice({ error: true, text: safeError(error) }); }
    finally { setBusy(''); }
  };

  if (!target) return null;

  return <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="lg" data-testid="admin-staff-lifecycle-dialog">
    <DialogTitle><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6" fontWeight={950}>{target.displayName}</Typography><Typography variant="caption" color="text.secondary">{target.email} · {target.role.replace(/_/g, ' ').toUpperCase()}</Typography></Box><Button size="small" startIcon={loading ? <CircularProgress size={14} /> : <RefreshCw size={14} />} onClick={load}>REFRESH</Button></Stack></DialogTitle>
    <DialogContent dividers>
      {notice ? <Alert severity={notice.error ? 'error' : 'success'} sx={{ mb: 2 }}>{notice.text}</Alert> : null}
      <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 3 }}>
        <Tab label="PROFILE" data-testid="staff-lifecycle-profile-tab" /><Tab label="ONBOARDING" data-testid="staff-lifecycle-onboarding-tab" /><Tab label="ATTENDANCE" data-testid="staff-lifecycle-attendance-tab" /><Tab label="LEAVE" data-testid="staff-lifecycle-leave-tab" /><Tab label="HR DOCUMENTS" data-testid="staff-lifecycle-documents-tab" /><Tab label="PAYROLL & KPI" data-testid="staff-lifecycle-payroll-tab" /><Tab label="AUDIT / OFFBOARD" data-testid="staff-lifecycle-audit-tab" />
      </Tabs>
      {loading && !data ? <Box py={8} textAlign="center"><CircularProgress /></Box> : null}

      {data && tab === 0 ? <Stack spacing={3} data-testid="staff-profile-panel">
        <Grid container spacing={2}>{[
          ['displayName', 'Full Name'], ['phoneNumber', 'Phone'], ['employeeId', 'Employee ID'], ['department', 'Department'], ['specialization', 'Specialization'], ['emirate', 'Emirate / Zone'], ['shiftName', 'Shift'], ['workingHours', 'Working Hours'], ['offDay', 'Weekly Off'],
        ].map(([key, label]) => <Grid item xs={12} md={4} key={key}><TextField fullWidth label={label} value={profile[key] || ''} onChange={(e) => setProfile((p: any) => ({ ...p, [key]: e.target.value }))} /></Grid>)}
          <Grid item xs={12} md={4}><FormControl fullWidth><InputLabel>Employment Type</InputLabel><Select label="Employment Type" value={profile.employmentType || 'full_time'} onChange={(e) => setProfile((p: any) => ({ ...p, employmentType: e.target.value }))}><MenuItem value="full_time">Full time</MenuItem><MenuItem value="part_time">Part time</MenuItem><MenuItem value="contract">Contract</MenuItem></Select></FormControl></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth type="date" label="Joining Date" InputLabelProps={{ shrink: true }} value={profile.joiningDate || ''} onChange={(e) => setProfile((p: any) => ({ ...p, joiningDate: e.target.value }))} /></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth type="date" label="Contract End" InputLabelProps={{ shrink: true }} value={profile.contractEndDate || ''} onChange={(e) => setProfile((p: any) => ({ ...p, contractEndDate: e.target.value }))} /></Grid>
        </Grid>
        <Divider><Typography variant="caption">SALARY PACKAGE</Typography></Divider>
        <Grid container spacing={2}>{[['basicSalary','Basic Salary'],['housingAllowance','Housing Allowance'],['transportAllowance','Transport Allowance'],['foodAllowance','Food Allowance'],['otherAllowance','Other Allowance'],['salaryPaymentDay','Salary Payment Day'],['salaryGrade','Salary Grade']].map(([key,label]) => <Grid item xs={12} sm={6} md={4} key={key}><TextField fullWidth type={key === 'salaryGrade' ? 'text' : 'number'} label={label} value={salary[key] ?? (key === 'salaryGrade' ? '' : 0)} onChange={(e) => setProfile((p: any) => ({ ...p, salaryPackage: { ...(p.salaryPackage || {}), [key]: key === 'salaryGrade' ? e.target.value : Number(e.target.value) } }))} /></Grid>)}</Grid>
        <Box display="flex" justifyContent="space-between"><Typography fontWeight={900}>Monthly package: {money(totalMonthlyPackage)}</Typography><Button data-testid="save-staff-profile" variant="contained" onClick={() => mutate('adminUpdateStaffProfile', { profile }, 'Staff profile and employment package updated.')} disabled={Boolean(busy)}>SAVE STAFF PROFILE</Button></Box>
      </Stack> : null}

      {data && tab === 1 ? <Stack spacing={3} data-testid="staff-onboarding-panel">
        <Grid container spacing={2}>{[['LIFECYCLE', data.onboarding.state], ['EMAIL VERIFIED', data.onboarding.emailVerified ? 'YES' : 'NO'], ['INVITATION', data.onboarding.invitationStatus], ['LAST LOGIN', dateLabel(data.onboarding.lastLogin)]].map(([label,value]) => <Grid item xs={12} sm={6} md={3} key={label}><Paper sx={{ p: 2 }}><Typography variant="caption">{label}</Typography><Box mt={1}><Chip color={stateColor(String(value))} label={String(value)} /></Box></Paper></Grid>)}</Grid>
        <Alert severity="info">Lifecycle is evidence-based: ACCOUNT_CREATED → INVITED → EMAIL_VERIFIED → ACTIVE.</Alert>
        <Box><Button data-testid="resend-staff-invitation" startIcon={<Mail size={16} />} variant="outlined" onClick={() => mutate('adminResendStaffInvitation', {}, 'Secure invitation re-issued.')} disabled={Boolean(busy) || data.onboarding.state === 'EXITED'}>RESEND VERIFICATION / PASSWORD SETUP</Button></Box>
      </Stack> : null}

      {data && tab === 2 ? <Stack spacing={3} data-testid="staff-attendance-panel">
        <Grid container spacing={2}><Grid item xs={12} md={3}><TextField fullWidth label="Date" type="date" InputLabelProps={{ shrink: true }} value={attendance.date} onChange={(e) => setAttendance((p) => ({ ...p, date: e.target.value }))} /></Grid><Grid item xs={12} md={3}><FormControl fullWidth><InputLabel>Status</InputLabel><Select label="Status" value={attendance.status} onChange={(e) => setAttendance((p) => ({ ...p, status: String(e.target.value) }))}>{['PRESENT','ABSENT','LEAVE','SICK','REMOTE','OFF'].map((status) => <MenuItem value={status} key={status}>{status}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={6} md={2}><TextField fullWidth label="Clock In" type="time" InputLabelProps={{ shrink: true }} value={attendance.clockIn} onChange={(e) => setAttendance((p) => ({ ...p, clockIn: e.target.value }))} /></Grid><Grid item xs={6} md={2}><TextField fullWidth label="Clock Out" type="time" InputLabelProps={{ shrink: true }} value={attendance.clockOut} onChange={(e) => setAttendance((p) => ({ ...p, clockOut: e.target.value }))} /></Grid><Grid item xs={12} md={2}><Button data-testid="record-staff-attendance" fullWidth sx={{ height: '100%' }} variant="contained" onClick={() => mutate('adminRecordStaffAttendance', attendance, 'Attendance record saved.')} disabled={Boolean(busy)}>SAVE</Button></Grid><Grid item xs={12}><TextField fullWidth label="Attendance Notes" value={attendance.notes} onChange={(e) => setAttendance((p) => ({ ...p, notes: e.target.value }))} /></Grid></Grid>
        <Table size="small"><TableHead><TableRow><TableCell>DATE</TableCell><TableCell>STATUS</TableCell><TableCell>IN</TableCell><TableCell>OUT</TableCell><TableCell>NOTES</TableCell></TableRow></TableHead><TableBody>{data.attendance.length ? data.attendance.map((item) => <TableRow key={item.id}><TableCell>{item.date}</TableCell><TableCell><Chip size="small" color={stateColor(item.status)} label={item.status} /></TableCell><TableCell>{item.clockIn || '—'}</TableCell><TableCell>{item.clockOut || '—'}</TableCell><TableCell>{item.notes || '—'}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} align="center">No attendance records yet.</TableCell></TableRow>}</TableBody></Table>
      </Stack> : null}

      {data && tab === 3 ? <Stack spacing={3} data-testid="staff-leave-panel">
        <Grid container spacing={2}><Grid item xs={12} md={3}><FormControl fullWidth><InputLabel>Leave Type</InputLabel><Select label="Leave Type" value={leave.leaveType} onChange={(e) => setLeave((p) => ({ ...p, leaveType: String(e.target.value) }))}>{['ANNUAL','SICK','EMERGENCY','UNPAID','COMPASSIONATE','OTHER'].map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={12} md={3}><TextField fullWidth label="Start" type="date" InputLabelProps={{ shrink: true }} value={leave.startDate} onChange={(e) => setLeave((p) => ({ ...p, startDate: e.target.value }))} /></Grid><Grid item xs={12} md={3}><TextField fullWidth label="End" type="date" InputLabelProps={{ shrink: true }} value={leave.endDate} onChange={(e) => setLeave((p) => ({ ...p, endDate: e.target.value }))} /></Grid><Grid item xs={12} md={3}><Button data-testid="create-staff-leave" fullWidth sx={{ height: '100%' }} variant="contained" onClick={() => mutate('adminManageStaffLeave', { action: 'CREATE', ...leave }, 'Leave request created.')} disabled={Boolean(busy) || !leave.startDate || !leave.endDate}>CREATE REQUEST</Button></Grid><Grid item xs={12}><TextField fullWidth label="Reason / Notes" value={leave.reason} onChange={(e) => setLeave((p) => ({ ...p, reason: e.target.value }))} /></Grid></Grid>
        <Table size="small"><TableHead><TableRow><TableCell>TYPE</TableCell><TableCell>DATES</TableCell><TableCell>DAYS</TableCell><TableCell>STATUS</TableCell><TableCell align="right">ACTION</TableCell></TableRow></TableHead><TableBody>{data.leaveRequests.length ? data.leaveRequests.map((item) => <TableRow key={item.id}><TableCell>{item.leaveType}</TableCell><TableCell>{item.startDate} → {item.endDate}</TableCell><TableCell>{item.totalDays}</TableCell><TableCell><Chip size="small" color={stateColor(item.status)} label={item.status} /></TableCell><TableCell align="right">{item.status === 'PENDING' ? <Stack direction="row" justifyContent="flex-end"><Button size="small" onClick={() => mutate('adminManageStaffLeave', { action: 'APPROVE', leaveRequestId: item.id }, 'Leave approved.')}>APPROVE</Button><Button size="small" color="error" onClick={() => mutate('adminManageStaffLeave', { action: 'REJECT', leaveRequestId: item.id }, 'Leave rejected.')}>REJECT</Button></Stack> : '—'}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} align="center">No leave requests yet.</TableCell></TableRow>}</TableBody></Table>
      </Stack> : null}

      {data && tab === 4 ? <Stack spacing={3} data-testid="staff-documents-panel">
        <Grid container spacing={2}><Grid item xs={12} md={3}><FormControl fullWidth><InputLabel>Document Type</InputLabel><Select label="Document Type" value={documentForm.documentType} onChange={(e) => setDocumentForm((p) => ({ ...p, documentType: String(e.target.value) }))}>{['CONTRACT','EMIRATES_ID','PASSPORT','VISA','MEDICAL','CERTIFICATION','WARNING','LICENSE','PAYROLL','OTHER'].map((type) => <MenuItem value={type} key={type}>{type.replace(/_/g, ' ')}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={12} md={3}><TextField fullWidth label="Title" value={documentForm.title} onChange={(e) => setDocumentForm((p) => ({ ...p, title: e.target.value }))} /></Grid><Grid item xs={12} md={3}><TextField fullWidth label="Expiry Date" type="date" InputLabelProps={{ shrink: true }} value={documentForm.expiresAt} onChange={(e) => setDocumentForm((p) => ({ ...p, expiresAt: e.target.value }))} /></Grid><Grid item xs={12} md={3}><Button component="label" fullWidth variant="outlined" startIcon={<FileUp size={16} />} sx={{ height: '100%' }}>SELECT PDF / IMAGE<input data-testid="staff-document-file" hidden type="file" accept="application/pdf,image/*" onChange={(e) => setDocumentForm((p) => ({ ...p, file: e.target.files?.[0] || null }))} /></Button></Grid></Grid>
        {documentForm.file ? <Alert severity="info">Selected: {documentForm.file.name}</Alert> : null}<Box><Button data-testid="upload-staff-document" variant="contained" onClick={uploadDocument} disabled={!documentForm.file || Boolean(busy)}>UPLOAD & REGISTER DOCUMENT</Button></Box>
        <Table size="small"><TableHead><TableRow><TableCell>TYPE</TableCell><TableCell>TITLE</TableCell><TableCell>EXPIRES</TableCell><TableCell align="right">ACTION</TableCell></TableRow></TableHead><TableBody>{data.documents.length ? data.documents.map((item) => <TableRow key={item.id}><TableCell>{item.documentType}</TableCell><TableCell>{item.title}</TableCell><TableCell>{dateLabel(item.expiresAt)}</TableCell><TableCell align="right"><Button size="small" startIcon={<ExternalLink size={14} />} onClick={() => window.open(item.downloadURL, '_blank', 'noopener,noreferrer')}>OPEN</Button><Button size="small" color="error" startIcon={<Trash2 size={14} />} onClick={() => mutate('adminDeleteStaffDocument', { documentId: item.id }, 'HR document deleted.')}>DELETE</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={4} align="center">No HR documents registered.</TableCell></TableRow>}</TableBody></Table>
      </Stack> : null}

      {data && tab === 5 ? <Stack spacing={3} data-testid="staff-payroll-kpi-panel"><Grid container spacing={2}>{[['OVERALL KPI', data.kpi.overall === null ? 'N/A' : `${data.kpi.overall}%`],['ATTENDANCE', data.kpi.attendanceRate === null ? 'N/A' : `${data.kpi.attendanceRate}%`],['JOB COMPLETION', data.kpi.jobCompletionRate === null ? 'N/A' : `${data.kpi.jobCompletionRate}%`],['TENANT RATING', data.kpi.averageRating === null ? 'N/A' : `${data.kpi.averageRating}/5`]].map(([label,value]) => <Grid item xs={6} md={3} key={label}><Paper sx={{ p: 2 }}><Typography variant="caption">{label}</Typography><Typography variant="h5" fontWeight={950} color={binThemeTokens.gold}>{value}</Typography></Paper></Grid>)}</Grid><Alert severity="info">KPI is calculated only from real attendance and assigned-job evidence. Missing evidence remains N/A.</Alert><Table size="small"><TableHead><TableRow><TableCell>PERIOD</TableCell><TableCell>AMOUNT</TableCell><TableCell>STATUS</TableCell></TableRow></TableHead><TableBody>{data.payroll.length ? data.payroll.map((item) => <TableRow key={item.id}><TableCell>{item.month || item.period || item.payPeriod || '—'}</TableCell><TableCell>{money(item.netPay ?? item.amount ?? item.total ?? 0)}</TableCell><TableCell>{item.status || 'UNKNOWN'}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} align="center">No payroll records linked to this staff account.</TableCell></TableRow>}</TableBody></Table></Stack> : null}

      {data && tab === 6 ? <Stack spacing={3} data-testid="staff-audit-offboard-panel"><Alert severity="warning" icon={<ShieldAlert />}>Offboarding disables Firebase Auth, revokes refresh tokens, removes active access, and preserves jobs/payroll/audit evidence.</Alert><Table size="small"><TableHead><TableRow><TableCell>ACTION</TableCell><TableCell>ACTOR</TableCell><TableCell>DATE</TableCell></TableRow></TableHead><TableBody>{data.audit.length ? data.audit.map((item) => <TableRow key={item.id}><TableCell>{item.action}</TableCell><TableCell>{item.actorRole || item.actorId || 'system'}</TableCell><TableCell>{dateLabel(item.createdAt)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} align="center">No lifecycle audit records found.</TableCell></TableRow>}</TableBody></Table><Divider /><TextField data-testid="staff-offboarding-reason" fullWidth label="Required offboarding reason" value={offboardingReason} onChange={(e) => setOffboardingReason(e.target.value)} disabled={data.onboarding.state === 'EXITED'} /><Box><Button data-testid="offboard-staff" color="error" variant="contained" disabled={offboardingReason.trim().length < 5 || Boolean(busy) || data.onboarding.state === 'EXITED'} onClick={() => mutate('adminOffboardStaff', { reason: offboardingReason }, 'Staff member offboarded; sessions revoked and history preserved.')}>DISABLE ACCESS & OFFBOARD</Button></Box></Stack> : null}
    </DialogContent>
    <DialogActions><Button onClick={onClose} disabled={Boolean(busy)}>CLOSE</Button></DialogActions>
  </Dialog>;
}
