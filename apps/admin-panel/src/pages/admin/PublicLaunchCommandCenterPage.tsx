import React from 'react';
import { Alert, Box, Button, Chip, Divider, Grid, LinearProgress, MenuItem, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { CheckCircle2, ClipboardCheck, FileCheck2, Rocket, ShieldAlert, ShieldCheck } from 'lucide-react';
import { addDoc, collection, db, limit, onSnapshot, orderBy, query, serverTimestamp } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';

type GateStatus = 'pending' | 'passed' | 'blocked' | 'waived';
type GateGroup = 'Owner' | 'Tenant' | 'Technician' | 'Broker' | 'Admin' | 'Provider' | 'Device' | 'Business' | 'Role Buttons';

type LaunchGate = {
  id: string;
  group: GateGroup;
  title: string;
  required: boolean;
  proofRequired: string;
};

type LaunchEvidence = {
  id: string;
  gateId: string;
  gateTitle?: string;
  gateGroup?: GateGroup;
  status: GateStatus;
  testerName?: string;
  role?: string;
  device?: string;
  productionUrl?: string;
  proofRef?: string;
  notes?: string;
  recordedByEmail?: string | null;
  createdAt?: any;
};

const LAUNCH_GATES: LaunchGate[] = [
  { id: 'ownerOnboardingFullPath', group: 'Owner', title: 'Owner onboarding to dashboard unlock', required: true, proofRequired: 'Landing -> quote -> contract -> payment review -> dashboard unlock with active contract visible.' },
  { id: 'ownerPaymentApproveReject', group: 'Owner', title: 'Owner payment approval and rejection paths', required: true, proofRequired: 'Real owner contract proof that approved payment unlocks dashboard and rejected/manual review does not unlock access.' },
  { id: 'ownerPostPaymentDashboard', group: 'Owner', title: 'Owner post-payment dashboard completeness', required: true, proofRequired: 'Active contract, property passport, invoices, SLA view, documents, service history, and Arabic/English journey proof.' },

  { id: 'tenantPhotoMaintenanceRequest', group: 'Tenant', title: 'Tenant request with real photo upload', required: true, proofRequired: 'Tenant creates maintenance request with real image upload; Admin and Technician can see the uploaded proof.' },
  { id: 'tenantSosAdminVisibility', group: 'Tenant', title: 'Tenant SOS visible in Admin feed', required: true, proofRequired: 'SOS created by tenant appears in Admin SOS feed with correct tenant, unit, property, priority, and timestamp.' },
  { id: 'tenantUnitBindingAndArabic', group: 'Tenant', title: 'Tenant unit binding and Arabic RTL proof', required: true, proofRequired: 'Ticket binds tenant UID, unitId, propertyId; documents, errors, empty states, modals, uploads, and Arabic RTL are verified.' },

  { id: 'technicianMissionLifecycle', group: 'Technician', title: 'Technician assignment to completion lifecycle', required: true, proofRequired: 'Real assigned job -> accept -> on-site -> before/after evidence -> completion history.' },
  { id: 'technicianGpsAndDeniedFallback', group: 'Technician', title: 'Technician GPS/photo permission proof', required: true, proofRequired: 'Real mobile GPS works; denied GPS/photo permission fails safely with visible guidance and no broken ticket state.' },
  { id: 'technicianCompletionAudit', group: 'Technician', title: 'Technician completion updates all views', required: true, proofRequired: 'Completion updates ticket, owner view, tenant view, Admin audit trail, technician history, time, photos, and status.' },

  { id: 'brokerReferralCommissionLifecycle', group: 'Broker', title: 'Broker referral and commission lifecycle', required: true, proofRequired: 'Broker creates lead/referral; Admin sees lead; lead converts; commission moves pending -> approved -> payable/paid/rejected.' },
  { id: 'brokerDocsPolicyFraud', group: 'Broker', title: 'Broker documents, payout policy, and duplicate handling', required: true, proofRequired: 'Broker documents upload/verification, payout or withdrawal policy visible, Arabic/English proof, duplicate/fraud handling.' },

  { id: 'adminFreshLoginAndCorePages', group: 'Admin', title: 'Admin fresh login and core pages proof', required: true, proofRequired: 'Hard refresh login; owners, tenants, technicians, SOS, tickets, payments, audit, documents all open and load live data.' },
  { id: 'adminStaffProvisioning', group: 'Admin', title: 'Admin staff/technician creation proof', required: true, proofRequired: 'Admin can add staff/technician; Auth/profile/docs are created or an explicit safe manual path is recorded.' },
  { id: 'adminPaymentUnlockAudit', group: 'Admin', title: 'Admin payment review unlock and audit proof', required: true, proofRequired: 'Payment review changes owner access correctly and writes audit evidence for approval/rejection.' },

  { id: 'firebaseAuth', group: 'Provider', title: 'Firebase Auth - five-role login proof', required: true, proofRequired: 'Fresh production proof for admin, owner, tenant, technician, and broker login on live Firebase Auth.' },
  { id: 'storageRules', group: 'Provider', title: 'Storage upload/download/delete proof', required: true, proofRequired: 'Tenant issue photos, technician before/after photos, contracts, invoices, and admin evidence access.' },
  { id: 'firebaseFunctionsLiveSmoke', group: 'Provider', title: 'Functions live smoke test', required: true, proofRequired: 'Owner payment, ticket dispatch, SLA checks, HR sync, notifications, and callable/trigger proof.' },
  { id: 'firebaseCloudMessaging', group: 'Provider', title: 'FCM / push notification proof', required: true, proofRequired: 'Token registration, foreground/background delivery, and disabled-permission fallback.' },
  { id: 'googleMaps', group: 'Provider', title: 'Google Maps / GPS proof', required: true, proofRequired: 'Real mobile GPS permission, map render, technician check-in, arrival tracking, and location-denied fallback.' },
  { id: 'aiVisionOrTriage', group: 'Provider', title: 'AI signed-in production proof', required: true, proofRequired: 'Signed-in AI production call, server-side secrets/fallback behavior, and no client-exposed AI keys.' },
  { id: 'paymentGatewayOrManualBank', group: 'Provider', title: 'Payment/manual bank activation proof', required: true, proofRequired: 'Owner contract -> 15% mobilization/manual bank/admin verification -> dashboard unlock path and rejection path.' },
  { id: 'uaeDataResidencyPosition', group: 'Business', title: 'UAE data/privacy position', required: true, proofRequired: 'Data categories, subprocessors, hosting region, retention policy, and owner/tenant privacy wording.' },
  { id: 'adminSecurity', group: 'Business', title: 'Admin access discipline', required: true, proofRequired: 'Privileged access rotation, MFA plan, break-glass policy, and audit-log verification.' },
  { id: 'supportPolicy', group: 'Business', title: 'Support and complaint handling policy', required: true, proofRequired: 'Public support, complaint, escalation, refund/cancellation, and SLA wording.' },
  { id: 'androidPwaSmoke', group: 'Device', title: 'Android PWA smoke test', required: true, proofRequired: 'Real Android phone PWA test across owner, tenant, technician, broker, and admin dashboards.' },
  { id: 'iosPwaSmoke', group: 'Device', title: 'iPhone/Safari PWA smoke test', required: true, proofRequired: 'Real iPhone/Safari PWA test across all five dashboards.' },
  { id: 'pdfMobileDownload', group: 'Device', title: 'Mobile PDF proof', required: true, proofRequired: 'Arabic/English contract, invoice, lease, and report PDF mobile download/open test.' },
  { id: 'arabicRtlAllCoreScreens', group: 'Device', title: 'Arabic RTL sweep', required: true, proofRequired: 'Owner, tenant, technician, broker, admin, modals, toasts, empty states, uploads, and PDFs.' },
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

const statusRank: Record<GateStatus, number> = {
  pending: 0,
  waived: 1,
  passed: 2,
  blocked: 3,
};

const getEvidenceTime = (item?: LaunchEvidence) => {
  const raw = item?.createdAt;
  if (!raw) return 'No evidence yet';
  try {
    const date = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    return Number.isNaN(date.getTime()) ? 'Evidence recorded' : date.toLocaleString();
  } catch {
    return 'Evidence recorded';
  }
};

export { LAUNCH_GATES };

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
  const [evidence, setEvidence] = React.useState<LaunchEvidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = React.useState(true);

  React.useEffect(() => {
    const q = query(collection(db, 'launch_evidence'), orderBy('createdAt', 'desc'), limit(300));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEvidence(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<LaunchEvidence, 'id'>) })));
      setEvidenceLoading(false);
    }, (error) => {
      console.error('[PUBLIC-LAUNCH] evidence listener failed', error);
      setNotice(error?.message || 'Could not load launch evidence. Check Firestore rules and admin permissions.');
      setEvidenceLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const latestByGate = React.useMemo(() => {
    const map = new Map<string, LaunchEvidence>();
    for (const item of evidence) {
      if (!map.has(item.gateId)) map.set(item.gateId, item);
    }
    return map;
  }, [evidence]);

  const gateStatus = (gate: LaunchGate): GateStatus => latestByGate.get(gate.id)?.status || 'pending';
  const requiredGates = LAUNCH_GATES.filter((gate) => gate.required);
  const passedCount = requiredGates.filter((gate) => ['passed', 'waived'].includes(gateStatus(gate))).length;
  const blockedCount = requiredGates.filter((gate) => gateStatus(gate) === 'blocked').length;
  const pendingRequired = requiredGates.length - passedCount - blockedCount;
  const readiness = Math.round((passedCount / Math.max(requiredGates.length, 1)) * 100);
  const selected = LAUNCH_GATES.find((gate) => gate.id === selectedGate) || LAUNCH_GATES[0];
  const selectedEvidence = latestByGate.get(selectedGate);
  const decision = blockedCount > 0
    ? 'PUBLIC LAUNCH BLOCKED'
    : pendingRequired === 0
      ? 'PUBLIC READY'
      : 'EVIDENCE REQUIRED';

  const groupSummary = React.useMemo(() => {
    const groups = Array.from(new Set(LAUNCH_GATES.map((gate) => gate.group)));
    return groups.map((group) => {
      const gates = LAUNCH_GATES.filter((gate) => gate.group === group && gate.required);
      const passed = gates.filter((gate) => ['passed', 'waived'].includes(gateStatus(gate))).length;
      const blocked = gates.filter((gate) => gateStatus(gate) === 'blocked').length;
      const pending = gates.length - passed - blocked;
      return { group, total: gates.length, passed, blocked, pending, score: Math.round((passed / Math.max(gates.length, 1)) * 100) };
    });
  }, [latestByGate]);

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
      setNotice('Launch proof saved. Readiness score updates automatically from latest evidence per gate.');
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
            This page now reads launch_evidence live from Firestore and calculates readiness from the latest evidence for every Owner, Tenant, Technician, Broker, Admin, provider, device, and business gate.
          </Typography>
        </Box>
        <Chip icon={<Rocket size={16} />} label={decision} sx={{ bgcolor: decision === 'PUBLIC READY' ? alpha('#22c55e', .16) : decision.includes('BLOCKED') ? alpha('#ef4444', .16) : alpha('#f59e0b', .16), color: decision === 'PUBLIC READY' ? '#22c55e' : decision.includes('BLOCKED') ? '#ef4444' : '#f59e0b', fontWeight: 950, alignSelf: { xs: 'flex-start', md: 'center' } }} />
      </Stack>

      <Alert severity={decision === 'PUBLIC READY' ? 'success' : blockedCount > 0 ? 'error' : 'warning'} sx={{ mb: 3, borderRadius: 3 }}>
        {decision === 'PUBLIC READY'
          ? 'All required launch gates have passed or were formally waived with evidence.'
          : 'Full public launch requires passed evidence for all required gates. Founder-attested smoke testing is useful, but each gate still needs proof recorded here.'}
      </Alert>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={1.2}>
              <ShieldCheck color={binThemeTokens.gold} />
              <Typography variant="h5" fontWeight={950}>Launch readiness</Typography>
              <Typography variant="h3" fontWeight={950} color={readiness >= 90 ? '#22c55e' : binThemeTokens.gold}>{readiness}%</Typography>
              <LinearProgress variant="determinate" value={readiness} sx={{ height: 10, borderRadius: 10 }} />
              <Typography sx={{ color: 'rgba(255,255,255,.62)' }}>{passedCount} of {requiredGates.length} required gates passed/waived from Firestore evidence.</Typography>
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={1.2}>
              <ShieldAlert color={blockedCount > 0 ? '#ef4444' : '#f59e0b'} />
              <Typography variant="h5" fontWeight={950}>Required gates pending</Typography>
              <Typography variant="h3" fontWeight={950} color={blockedCount > 0 ? '#ef4444' : '#f59e0b'}>{pendingRequired}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.62)' }}>{blockedCount} blocked gate(s). Do not open unrestricted public signup until this is zero.</Typography>
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={1.2}>
              <FileCheck2 color="#22c55e" />
              <Typography variant="h5" fontWeight={950}>Evidence records</Typography>
              <Typography variant="h3" fontWeight={950} color="#22c55e">{evidenceLoading ? '...' : evidence.length}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.62)' }}>Live Firestore records with role, device, URL, proof reference, notes, tester, status, and timestamp.</Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {groupSummary.map((item) => (
          <Grid item xs={12} sm={6} md={3} key={item.group}>
            <Paper sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)' }}>
              <Typography fontWeight={950}>{item.group}</Typography>
              <Typography variant="h5" sx={{ color: item.score >= 100 ? '#22c55e' : item.blocked ? '#ef4444' : binThemeTokens.gold, fontWeight: 950 }}>{item.score}%</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)' }}>{item.passed}/{item.total} passed · {item.pending} pending · {item.blocked} blocked</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2 }}><ClipboardCheck color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950}>Required launch gates</Typography></Stack>
            <Grid container spacing={1.4}>
              {LAUNCH_GATES.map((gate) => {
                const currentStatus = gateStatus(gate);
                const latest = latestByGate.get(gate.id);
                return (
                  <Grid item xs={12} md={6} key={gate.id}>
                    <Box onClick={() => { setSelectedGate(gate.id); setStatus(currentStatus); }} sx={{ p: 1.6, borderRadius: 3, cursor: 'pointer', bgcolor: selectedGate === gate.id ? alpha(binThemeTokens.gold, .14) : 'rgba(255,255,255,.035)', border: `1px solid ${selectedGate === gate.id ? alpha(binThemeTokens.gold, .34) : 'rgba(255,255,255,.07)'}` }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                        <Typography fontWeight={950}>{gate.title}</Typography>
                        <Stack direction="row" spacing={0.8}>
                          <Chip size="small" label={gate.group} sx={{ bgcolor: alpha(binThemeTokens.gold, .11), color: binThemeTokens.gold, fontWeight: 850 }} />
                          <Chip size="small" label={currentStatus} sx={{ bgcolor: alpha(statusColor[currentStatus], .15), color: statusColor[currentStatus], fontWeight: 850 }} />
                        </Stack>
                      </Stack>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: .7 }}>{gate.proofRequired}</Typography>
                      <Typography variant="caption" sx={{ color: latest?.proofRef ? '#22c55e' : 'rgba(255,255,255,.38)', mt: 1, display: 'block', fontWeight: 800 }}>
                        {latest?.proofRef ? `Latest proof: ${latest.proofRef}` : 'No proof recorded yet'} · {getEvidenceTime(latest)}
                      </Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={2}>
              <Typography variant="h5" fontWeight={950}>Record proof</Typography>
              {selectedEvidence && (
                <Alert severity={selectedEvidence.status === 'passed' ? 'success' : selectedEvidence.status === 'blocked' ? 'error' : 'info'}>
                  Latest evidence: {selectedEvidence.status} · {selectedEvidence.proofRef || 'no proof reference'} · {getEvidenceTime(selectedEvidence)}
                </Alert>
              )}
              {notice && <Alert severity={notice.includes('saved') ? 'success' : 'warning'}>{notice}</Alert>}
              <TextField select label="Launch gate" value={selectedGate} onChange={(event) => { setSelectedGate(event.target.value); const current = latestByGate.get(event.target.value)?.status || 'pending'; setStatus(current); }}>{LAUNCH_GATES.map((gate) => <MenuItem key={gate.id} value={gate.id}>{gate.title}</MenuItem>)}</TextField>
              <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value as GateStatus)}>{statuses.map((value) => <MenuItem key={value} value={value}><Chip size="small" label={value} sx={{ bgcolor: alpha(statusColor[value], .15), color: statusColor[value], fontWeight: 850 }} /></MenuItem>)}</TextField>
              <TextField label="Tester name" value={testerName} onChange={(event) => setTesterName(event.target.value)} />
              <TextField select label="Role tested" value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
              <TextField select label="Device" value={device} onChange={(event) => setDevice(event.target.value)}>{devices.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
              <TextField label="Production URL" value={productionUrl} onChange={(event) => setProductionUrl(event.target.value)} />
              <TextField label="Screenshot / log / evidence reference" value={proofRef} onChange={(event) => setProofRef(event.target.value)} placeholder="Example: GitHub run ID, screenshot file name, Firebase log link" />
              <TextField label="Notes" multiline minRows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What passed, what failed, exact action tested, next fix if any." />
              <Button onClick={saveProof} disabled={busy} variant="contained" startIcon={<CheckCircle2 size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }}>{busy ? 'Saving...' : 'Save proof record'}</Button>
              <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)', fontWeight: 850 }}>Readiness is now calculated from live Firestore evidence. Latest record per gate controls the launch decision. A blocked record blocks public launch until a newer passed/waived proof is saved.</Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
