import React from 'react';
import { Alert, Box, Button, Chip, Divider, Grid, LinearProgress, MenuItem, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { CheckCircle2, ClipboardCheck, FileCheck2, Rocket, ShieldAlert, ShieldCheck } from 'lucide-react';
import { addDoc, collection, db, serverTimestamp } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';

type GateStatus = 'pending' | 'passed' | 'blocked' | 'waived';
type GateGroup = 'Provider' | 'Device' | 'Business' | 'Role Buttons';

type LaunchGate = {
  id: string;
  group: GateGroup;
  title: string;
  required: boolean;
  proofRequired: string;
};

const LAUNCH_GATES: LaunchGate[] = [
  { id: 'firebaseAuth', group: 'Provider', title: 'Firebase Auth - five-role login proof', required: true, proofRequired: 'Fresh production proof for admin, owner, tenant, technician, and broker login on live Firebase Auth.' },
  { id: 'storageRules', group: 'Provider', title: 'Storage upload/download/delete proof', required: true, proofRequired: 'Tenant issue photos, technician before/after photos, contracts, invoices, and admin evidence access.' },
  { id: 'firebaseFunctionsLiveSmoke', group: 'Provider', title: 'Functions live smoke test', required: true, proofRequired: 'Owner payment, ticket dispatch, SLA checks, HR sync, notifications, and Sovereign AI callable/trigger proof.' },
  { id: 'firebaseCloudMessaging', group: 'Provider', title: 'FCM / push notification proof', required: true, proofRequired: 'Token registration, foreground/background delivery, and disabled-permission fallback.' },
  { id: 'googleMaps', group: 'Provider', title: 'Google Maps / GPS proof', required: true, proofRequired: 'Real mobile GPS permission, map render, technician check-in, arrival tracking, and location-denied fallback.' },
  { id: 'aiVisionOrTriage', group: 'Provider', title: 'AI signed-in production proof', required: true, proofRequired: 'Signed-in runSovereignAI production call, server-side secrets/fallback behavior, and no client-exposed AI keys.' },
  { id: 'paymentGatewayOrManualBank', group: 'Provider', title: 'Payment/manual bank activation proof', required: true, proofRequired: 'Owner contract -> 15% mobilization/manual bank/admin verification -> dashboard unlock path and rejection path.' },
  { id: 'uaeDataResidencyPosition', group: 'Business', title: 'UAE data/privacy position', required: true, proofRequired: 'Data categories, subprocessors, hosting region, retention policy, and owner/tenant privacy wording.' },
  { id: 'adminSecurity', group: 'Business', title: 'Admin password / MFA discipline', required: true, proofRequired: 'Founder/admin password rotation, MFA plan, break-glass policy, audit-log verification.' },
  { id: 'supportPolicy', group: 'Business', title: 'Support and complaint handling policy', required: true, proofRequired: 'Public support, complaint, escalation, refund/cancellation, and SLA wording.' },
  { id: 'androidPwaSmoke', group: 'Device', title: 'Android PWA smoke test', required: true, proofRequired: 'Real Android phone PWA test across owner, tenant, technician, broker, and admin dashboards.' },
  { id: 'iosPwaSmoke', group: 'Device', title: 'iPhone/Safari PWA smoke test', required: true, proofRequired: 'Real iPhone/Safari PWA test across all five dashboards.' },
  { id: 'technicianGpsTracking', group: 'Device', title: 'Technician GPS tracking proof', required: true, proofRequired: 'Real technician GPS check-in and live tracking test.' },
  { id: 'pdfMobileDownload', group: 'Device', title: 'Mobile PDF proof', required: true, proofRequired: 'Arabic/English contract, invoice, lease, and report PDF mobile download/open test.' },
  { id: 'arabicRtlAllCoreScreens', group: 'Device', title: 'Arabic RTL sweep', required: true, proofRequired: 'Owner, tenant, technician, broker, admin, modals, toasts, empty states, and PDFs.' },
  { id: 'everyButtonWritesFirestoreOrStorage', group: 'Role Buttons', title: 'Every-button audit', required: true, proofRequired: 'Every action writes, reads, navigates, or fails safely with role, route, action, and proof reference.' },
  { id: 'logoutAllDashboards', group: 'Role Buttons', title: 'Logout all dashboards', required: true, proofRequired: 'Owner, tenant, technician, broker, and admin logout tests on desktop and mobile.' },
];

const roles = ['admin', 'owner', 'tenant', 'technician', 'broker'];
const devices = ['Android PWA', 'iPhone Safari', 'Desktop Chrome', 'Tablet', 'Other'];
const statuses: GateStatus[] = ['pending', 'passed', 'blocked', 'waived'];

const statusColor: Record<GateStatus, string> = {
  pending: '#f59e0b',
  passed: '#22c55e',
  blocked: '#ef4444',
  waived: '#94a3b8',
};

export default function PublicLaunchCommandCenterPage() {
  const { user } = useAuth();
  const [selectedGate, setSelectedGate] = React.useState(LAUNCH_GATES[0].id);
  const [status, setStatus] = React.useState<GateStatus>('pending');
  const [testerName, setTesterName] = React.useState(user?.displayName || '');
  const [role, setRole] = React.useState('admin');
  const [device, setDevice] = React.useState('Android PWA');
  const [productionUrl, setProductionUrl] = React.useState('https://bin-group-57c60.web.app');
  const [proofRef, setProofRef] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  const passedCount = 2;
  const pendingRequired = LAUNCH_GATES.filter((gate) => gate.required).length;
  const readiness = Math.round((passedCount / (passedCount + pendingRequired)) * 100);
  const selected = LAUNCH_GATES.find((gate) => gate.id === selectedGate) || LAUNCH_GATES[0];
  const decision = pendingRequired === 0 ? 'PUBLIC READY' : 'PILOT / BLOCKED FROM FULL PUBLIC LAUNCH';

  const saveProof = async () => {
    if (!testerName.trim() || !proofRef.trim()) {
      setNotice('Tester name and screenshot/log/proof reference are required.');
      return;
    }
    try {
      setBusy(true);
      setNotice('');
      await addDoc(collection(db, 'launch_evidence'), {
        gateId: selectedGate,
        gateTitle: selected.title,
        gateGroup: selected.group,
        status,
        testerName: testerName.trim(),
        role,
        device,
        productionUrl: productionUrl.trim(),
        proofRef: proofRef.trim(),
        notes: notes.trim(),
        recordedBy: user?.uid || null,
        recordedByEmail: user?.email || null,
        createdAt: serverTimestamp(),
      });
      setNotice('Launch proof record saved. This records evidence only; it does not automatically mark launch-proof-gates.json as passed.');
      setProofRef('');
      setNotes('');
    } catch (error: any) {
      setNotice(error?.message || 'Could not save launch proof record.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 4 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>PUBLIC LAUNCH COMMAND CENTER</Typography>
          <Typography variant="h3" sx={{ fontWeight: 950, letterSpacing: -1 }}>Final Release Evidence Control</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.64)', maxWidth: 940, mt: 1 }}>
            Use this page to record real production proof for every required launch gate. It keeps the launch honest: evidence first, then update launch-proof-gates.json.
          </Typography>
        </Box>
        <Chip icon={<Rocket size={16} />} label={decision} sx={{ bgcolor: pendingRequired === 0 ? alpha('#22c55e', .16) : alpha('#f59e0b', .16), color: pendingRequired === 0 ? '#22c55e' : '#f59e0b', fontWeight: 950, alignSelf: { xs: 'flex-start', md: 'center' } }} />
      </Stack>

      <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
        Full public launch is blocked until required gates are passed or formally waived. This page records proof; it does not fake green status.
      </Alert>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={1.2}>
              <ShieldCheck color={binThemeTokens.gold} />
              <Typography variant="h5" fontWeight={950}>Launch readiness</Typography>
              <Typography variant="h3" fontWeight={950} color={binThemeTokens.gold}>{readiness}%</Typography>
              <LinearProgress variant="determinate" value={readiness} sx={{ height: 10, borderRadius: 10 }} />
              <Typography sx={{ color: 'rgba(255,255,255,.62)' }}>Hosting and functions deploy are already passed. Remaining items require live evidence.</Typography>
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={1.2}>
              <ShieldAlert color="#f59e0b" />
              <Typography variant="h5" fontWeight={950}>Required gates pending</Typography>
              <Typography variant="h3" fontWeight={950} color="#f59e0b">{pendingRequired}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.62)' }}>Do not open unrestricted public signup before these are proven.</Typography>
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={1.2}>
              <FileCheck2 color="#22c55e" />
              <Typography variant="h5" fontWeight={950}>Evidence storage</Typography>
              <Typography variant="h3" fontWeight={950} color="#22c55e">Firestore</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.62)' }}>Records save to launch_evidence with role, device, URL, proof reference, notes, and tester name.</Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2 }}><ClipboardCheck color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950}>Required launch gates</Typography></Stack>
            <Grid container spacing={1.4}>
              {LAUNCH_GATES.map((gate) => (
                <Grid item xs={12} md={6} key={gate.id}>
                  <Box onClick={() => setSelectedGate(gate.id)} sx={{ p: 1.6, borderRadius: 3, cursor: 'pointer', bgcolor: selectedGate === gate.id ? alpha(binThemeTokens.gold, .14) : 'rgba(255,255,255,.035)', border: `1px solid ${selectedGate === gate.id ? alpha(binThemeTokens.gold, .34) : 'rgba(255,255,255,.07)'}` }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography fontWeight={950}>{gate.title}</Typography>
                      <Chip size="small" label={gate.group} sx={{ bgcolor: alpha(binThemeTokens.gold, .11), color: binThemeTokens.gold, fontWeight: 850 }} />
                    </Stack>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: .7 }}>{gate.proofRequired}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={2}>
              <Typography variant="h5" fontWeight={950}>Record proof</Typography>
              {notice && <Alert severity={notice.includes('saved') ? 'success' : 'warning'}>{notice}</Alert>}
              <TextField select label="Launch gate" value={selectedGate} onChange={(event) => setSelectedGate(event.target.value)}>{LAUNCH_GATES.map((gate) => <MenuItem key={gate.id} value={gate.id}>{gate.title}</MenuItem>)}</TextField>
              <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value as GateStatus)}>{statuses.map((value) => <MenuItem key={value} value={value}><Chip size="small" label={value} sx={{ bgcolor: alpha(statusColor[value], .15), color: statusColor[value], fontWeight: 850 }} /></MenuItem>)}</TextField>
              <TextField label="Tester name" value={testerName} onChange={(event) => setTesterName(event.target.value)} />
              <TextField select label="Role tested" value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
              <TextField select label="Device" value={device} onChange={(event) => setDevice(event.target.value)}>{devices.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
              <TextField label="Production URL" value={productionUrl} onChange={(event) => setProductionUrl(event.target.value)} />
              <TextField label="Screenshot / log / evidence reference" value={proofRef} onChange={(event) => setProofRef(event.target.value)} placeholder="Example: GitHub run ID, screenshot file name, Firebase log link" />
              <TextField label="Notes" multiline minRows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What passed, what failed, exact action tested, next fix if any." />
              <Button onClick={saveProof} disabled={busy} variant="contained" startIcon={<CheckCircle2 size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }}>{busy ? 'Saving...' : 'Save proof record'}</Button>
              <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)', fontWeight: 850 }}>After all required proof exists, update launch_package/launch-proof-gates.json with exact proof text. Do not update gates from this form automatically.</Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
