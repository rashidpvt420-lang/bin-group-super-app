import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { CheckCircle2, ClipboardCheck, FileCheck2, RefreshCw, Rocket, ShieldAlert, ShieldCheck } from 'lucide-react';
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

type SmokeRole = 'owner' | 'tenant' | 'technician' | 'broker' | 'admin';

type SignedInSmokeCheck = {
  role: SmokeRole;
  route: string;
  checkpoints: string;
};

type SignedInSmokeRecord = {
  id: string;
  role: SmokeRole;
  status: GateStatus;
  accountEmail?: string;
  route?: string;
  proofRef?: string;
  notes?: string;
  recordedByEmail?: string | null;
  createdAt?: any;
};

type LaunchAuthorization = {
  authorized: boolean;
  role: string;
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

const SIGNED_IN_SMOKE_CHECKS: SignedInSmokeCheck[] = [
  { role: 'owner', route: '/owner', checkpoints: 'Fresh login, dashboard loads, properties/units visible only for the owner, payment/contract state visible.' },
  { role: 'tenant', route: '/tenant', checkpoints: 'Fresh login, assigned unit or link fallback visible, service request route opens, tenant cannot see other units.' },
  { role: 'technician', route: '/technician', checkpoints: 'Fresh login, assigned/open jobs load, duty/action controls do not throw permission errors.' },
  { role: 'broker', route: '/broker', checkpoints: 'Fresh login, profile KYC state visible, commissions page opens, payout request state shown.' },
  { role: 'admin', route: '/dashboard', checkpoints: 'Fresh login, owners, tenants, technicians, brokers, payments, tickets, and audit pages load live data.' },
];

const statusColor: Record<GateStatus, string> = {
  pending: '#f59e0b',
  passed: '#22c55e',
  blocked: '#ef4444',
  waived: '#94a3b8',
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

const getClaimRole = (user: any) => String(
  user?.role || user?.claims?.role || user?.claims?.userRole || user?.claims?.primaryRole || '',
).trim().toLowerCase();

const getLaunchAuthorization = (user: any): LaunchAuthorization => {
  const claims = (user?.claims || {}) as Record<string, unknown>;
  const role = getClaimRole(user);
  const authorized = Boolean(
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'ceo' ||
    claims.superAdmin === true ||
    claims.super_admin === true ||
    claims.ceo === true ||
    (role === '' && (claims.admin === true || claims.isAdmin === true))
  );
  return { authorized, role };
};

export { LAUNCH_GATES };

export default function PublicLaunchCommandCenterPageV2() {
  const { user, retryAuthorization } = useAuth();
  const authorization = React.useMemo(() => getLaunchAuthorization(user), [user]);
  const [selectedGate, setSelectedGate] = React.useState(LAUNCH_GATES[0].id);
  const [status, setStatus] = React.useState<GateStatus>('pending');
  const [testerName, setTesterName] = React.useState(user?.displayName || '');
  const [role, setRole] = React.useState('admin');
  const [device, setDevice] = React.useState('Android PWA');
  const [productionUrl, setProductionUrl] = React.useState('https://bin-group-57c60.web.app');
  const [proofRef, setProofRef] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [retryBusy, setRetryBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [evidence, setEvidence] = React.useState<LaunchEvidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = React.useState(true);
  const [evidenceError, setEvidenceError] = React.useState<string | null>(null);
  const [smokeRecords, setSmokeRecords] = React.useState<SignedInSmokeRecord[]>([]);
  const [smokeLoading, setSmokeLoading] = React.useState(true);
  const [smokeError, setSmokeError] = React.useState<string | null>(null);
  const [listenerRetryKey, setListenerRetryKey] = React.useState(0);
  const [selectedSmokeRole, setSelectedSmokeRole] = React.useState<SmokeRole>('owner');
  const [smokeStatus, setSmokeStatus] = React.useState<GateStatus>('pending');
  const [smokeAccountEmail, setSmokeAccountEmail] = React.useState('');
  const [smokeRoute, setSmokeRoute] = React.useState('/owner');
  const [smokeProofRef, setSmokeProofRef] = React.useState('');
  const [smokeNotes, setSmokeNotes] = React.useState('');
  const [smokeBusy, setSmokeBusy] = React.useState(false);

  React.useEffect(() => {
    if (!user?.uid) {
      setEvidence([]);
      setEvidenceLoading(false);
      setEvidenceError('No authenticated Admin session is available.');
      return undefined;
    }
    if (!authorization.authorized) {
      setEvidence([]);
      setEvidenceLoading(false);
      setEvidenceError(`Claim role "${authorization.role || 'none'}" is not authorized by the Firestore launch-evidence policy.`);
      return undefined;
    }

    setEvidenceLoading(true);
    setEvidenceError(null);
    const q = query(collection(db, 'launch_evidence'), orderBy('createdAt', 'desc'), limit(300));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEvidence(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<LaunchEvidence, 'id'>) })));
      setEvidenceError(null);
      setEvidenceLoading(false);
    }, (error) => {
      console.error('[PUBLIC-LAUNCH] evidence listener failed', error);
      setEvidenceError(error?.message || 'Could not read launch evidence from Firestore.');
      setEvidenceLoading(false);
    });
    return () => unsubscribe();
  }, [authorization.authorized, authorization.role, listenerRetryKey, user?.uid]);

  React.useEffect(() => {
    if (!user?.uid) {
      setSmokeRecords([]);
      setSmokeLoading(false);
      setSmokeError('No authenticated Admin session is available.');
      return undefined;
    }
    if (!authorization.authorized) {
      setSmokeRecords([]);
      setSmokeLoading(false);
      setSmokeError(`Claim role "${authorization.role || 'none'}" is not authorized by the Firestore signed-in-smoke policy.`);
      return undefined;
    }

    setSmokeLoading(true);
    setSmokeError(null);
    const q = query(collection(db, 'signed_in_smoke_checks'), orderBy('createdAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSmokeRecords(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<SignedInSmokeRecord, 'id'>) })));
      setSmokeError(null);
      setSmokeLoading(false);
    }, (error) => {
      console.error('[PUBLIC-LAUNCH] signed-in smoke listener failed', error);
      setSmokeError(error?.message || 'Could not read signed-in smoke records from Firestore.');
      setSmokeLoading(false);
    });
    return () => unsubscribe();
  }, [authorization.authorized, authorization.role, listenerRetryKey, user?.uid]);

  const latestByGate = React.useMemo(() => {
    const map = new Map<string, LaunchEvidence>();
    for (const item of evidence) {
      if (!map.has(item.gateId)) map.set(item.gateId, item);
    }
    return map;
  }, [evidence]);

  const latestSmokeByRole = React.useMemo(() => {
    const map = new Map<SmokeRole, SignedInSmokeRecord>();
    for (const item of smokeRecords) {
      if (!map.has(item.role)) map.set(item.role, item);
    }
    return map;
  }, [smokeRecords]);

  const evidenceAuthoritative = authorization.authorized && !evidenceLoading && !evidenceError;
  const smokeAuthoritative = authorization.authorized && !smokeLoading && !smokeError;
  const gateStatus = (gate: LaunchGate): GateStatus => latestByGate.get(gate.id)?.status || 'pending';
  const requiredGates = LAUNCH_GATES.filter((gate) => gate.required);
  const passedCount = requiredGates.filter((gate) => ['passed', 'waived'].includes(gateStatus(gate))).length;
  const blockedCount = requiredGates.filter((gate) => gateStatus(gate) === 'blocked').length;
  const pendingRequired = requiredGates.length - passedCount - blockedCount;
  const readiness = Math.round((passedCount / Math.max(requiredGates.length, 1)) * 100);
  const selected = LAUNCH_GATES.find((gate) => gate.id === selectedGate) || LAUNCH_GATES[0];
  const selectedEvidence = latestByGate.get(selectedGate);
  const smokePassedCount = SIGNED_IN_SMOKE_CHECKS.filter((check) => ['passed', 'waived'].includes(latestSmokeByRole.get(check.role)?.status || 'pending')).length;

  const decision = evidenceLoading
    ? 'LOADING EVIDENCE'
    : !evidenceAuthoritative
      ? 'EVIDENCE UNAVAILABLE'
      : blockedCount > 0
        ? 'PUBLIC LAUNCH BLOCKED'
        : pendingRequired === 0
          ? 'PUBLIC READY'
          : 'EVIDENCE REQUIRED';

  const groupSummary = React.useMemo(() => {
    const groups = Array.from(new Set(LAUNCH_GATES.map((gate) => gate.group)));
    return groups.map((group) => {
      const gates = LAUNCH_GATES.filter((gate) => gate.group === group && gate.required);
      const passed = gates.filter((gate) => ['passed', 'waived'].includes(latestByGate.get(gate.id)?.status || 'pending')).length;
      const blocked = gates.filter((gate) => (latestByGate.get(gate.id)?.status || 'pending') === 'blocked').length;
      const pending = gates.length - passed - blocked;
      return { group, total: gates.length, passed, blocked, pending, score: Math.round((passed / Math.max(gates.length, 1)) * 100) };
    });
  }, [latestByGate]);

  const retryEvidenceAccess = async () => {
    try {
      setRetryBusy(true);
      setNotice('');
      await retryAuthorization();
      setListenerRetryKey((value) => value + 1);
      setNotice('Authorization refreshed. Firestore evidence access is being retried.');
    } catch (error: any) {
      setNotice(error?.message || 'Authorization refresh failed. Sign out and sign in again.');
    } finally {
      setRetryBusy(false);
    }
  };

  const saveProof = async () => {
    if (!evidenceAuthoritative) {
      setNotice('Cannot record launch proof while Firestore launch evidence is unavailable. Refresh authorization first.');
      return;
    }
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
      setNotice('Launch proof saved. Readiness updates from the latest real Firestore evidence per gate.');
      setProofRef('');
      setNotes('');
    } catch (error: any) {
      setNotice(error?.message || 'Could not save launch proof record.');
    } finally {
      setBusy(false);
    }
  };

  const saveSmokeProof = async () => {
    if (!smokeAuthoritative) {
      setNotice('Cannot record signed-in smoke proof while Firestore smoke evidence is unavailable. Refresh authorization first.');
      return;
    }
    const selectedSmoke = SIGNED_IN_SMOKE_CHECKS.find((item) => item.role === selectedSmokeRole) || SIGNED_IN_SMOKE_CHECKS[0];
    if (!smokeAccountEmail.trim() || !smokeProofRef.trim()) {
      setNotice('Signed-in smoke requires tested account email and screenshot/log/proof reference.');
      return;
    }
    try {
      setSmokeBusy(true);
      setNotice('');
      await addDoc(collection(db, 'signed_in_smoke_checks'), {
        role: selectedSmokeRole,
        status: smokeStatus,
        accountEmail: smokeAccountEmail.trim().toLowerCase(),
        route: smokeRoute.trim() || selectedSmoke.route,
        requiredRoute: selectedSmoke.route,
        checkpoints: selectedSmoke.checkpoints,
        proofRef: smokeProofRef.trim(),
        notes: smokeNotes.trim(),
        recordedBy: user?.uid || null,
        recordedByEmail: user?.email || null,
        createdAt: serverTimestamp(),
      });
      setNotice('Signed-in smoke proof saved.');
      setSmokeProofRef('');
      setSmokeNotes('');
    } catch (error: any) {
      setNotice(error?.message || 'Could not save signed-in smoke proof.');
    } finally {
      setSmokeBusy(false);
    }
  };

  const decisionColor = decision === 'PUBLIC READY'
    ? '#22c55e'
    : decision === 'EVIDENCE UNAVAILABLE' || decision.includes('BLOCKED')
      ? '#ef4444'
      : '#f59e0b';

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>PUBLIC LAUNCH COMMAND CENTER</Typography>
          <Typography variant="h3" sx={{ fontWeight: 950, letterSpacing: -1 }}>Final Release Evidence Control</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.64)', maxWidth: 940, mt: 1 }}>
            Readiness is calculated only when launch_evidence is successfully read from Firestore. Authorization failures never masquerade as 0% readiness or missing proof.
          </Typography>
        </Box>
        <Chip icon={<Rocket size={16} />} label={decision} sx={{ bgcolor: alpha(decisionColor, .16), color: decisionColor, fontWeight: 950, alignSelf: { xs: 'flex-start', md: 'center' } }} />
      </Stack>

      {!evidenceAuthoritative && !evidenceLoading ? (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
          <Stack spacing={1}>
            <Typography fontWeight={900}>Launch evidence is unavailable. The release decision is paused.</Typography>
            <Typography variant="body2">{evidenceError || 'Firestore evidence could not be read.'}</Typography>
            <Typography variant="caption">
              Signed in as {user?.email || 'unknown'} · claim role: {authorization.role || 'none'} · Firestore launch policy: {authorization.authorized ? 'claim accepted, query failed' : 'claim not accepted'}.
            </Typography>
            <Button onClick={retryEvidenceAccess} disabled={retryBusy} variant="outlined" startIcon={<RefreshCw size={16} />} sx={{ alignSelf: 'flex-start' }}>
              {retryBusy ? 'Refreshing...' : 'Refresh authorization & retry'}
            </Button>
          </Stack>
        </Alert>
      ) : (
        <Alert severity={decision === 'PUBLIC READY' ? 'success' : blockedCount > 0 ? 'error' : 'warning'} sx={{ mb: 2, borderRadius: 3 }}>
          {evidenceLoading
            ? 'Loading authoritative launch evidence from Firestore. No readiness decision will be calculated until the read succeeds.'
            : decision === 'PUBLIC READY'
              ? 'All required launch gates have passed or were formally waived with recorded evidence.'
              : 'Full public launch requires passed evidence for every required gate. Do not manufacture or manually infer missing proof.'}
        </Alert>
      )}

      {smokeError && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
          Signed-in smoke evidence is unavailable: {smokeError}. Smoke status is paused rather than treated as 0/5.
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={1.2}>
              <ShieldCheck color={binThemeTokens.gold} />
              <Typography variant="h5" fontWeight={950}>Launch readiness</Typography>
              <Typography variant="h3" fontWeight={950} color={evidenceAuthoritative && readiness >= 90 ? '#22c55e' : binThemeTokens.gold}>
                {evidenceAuthoritative ? `${readiness}%` : '—'}
              </Typography>
              {evidenceLoading ? <LinearProgress sx={{ height: 10, borderRadius: 10 }} /> : <LinearProgress variant="determinate" value={evidenceAuthoritative ? readiness : 0} sx={{ height: 10, borderRadius: 10 }} />}
              <Typography sx={{ color: 'rgba(255,255,255,.62)' }}>
                {evidenceAuthoritative ? `${passedCount} of ${requiredGates.length} required gates passed/waived from Firestore evidence.` : 'Unavailable until Firestore evidence can be read successfully.'}
              </Typography>
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={1.2}>
              <ShieldAlert color={evidenceAuthoritative && blockedCount > 0 ? '#ef4444' : '#f59e0b'} />
              <Typography variant="h5" fontWeight={950}>Required gates pending</Typography>
              <Typography variant="h3" fontWeight={950} color={evidenceAuthoritative && blockedCount > 0 ? '#ef4444' : '#f59e0b'}>{evidenceAuthoritative ? pendingRequired : '—'}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.62)' }}>
                {evidenceAuthoritative ? `${blockedCount} blocked gate(s). Do not open unrestricted public signup until this is zero.` : 'Not calculated from an authorization failure.'}
              </Typography>
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
            <Stack spacing={1.2}>
              <FileCheck2 color="#22c55e" />
              <Typography variant="h5" fontWeight={950}>Evidence records</Typography>
              <Typography variant="h3" fontWeight={950} color="#22c55e">{evidenceLoading ? '...' : evidenceAuthoritative ? evidence.length : '—'}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.62)' }}>Only a successful Firestore snapshot is authoritative.</Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {groupSummary.map((item) => (
          <Grid item xs={12} sm={6} md={3} key={item.group}>
            <Paper sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)' }}>
              <Typography fontWeight={950}>{item.group}</Typography>
              <Typography variant="h5" sx={{ color: evidenceAuthoritative && item.score >= 100 ? '#22c55e' : evidenceAuthoritative && item.blocked ? '#ef4444' : binThemeTokens.gold, fontWeight: 950 }}>
                {evidenceAuthoritative ? `${item.score}%` : '—'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)' }}>
                {evidenceAuthoritative ? `${item.passed}/${item.total} passed · ${item.pending} pending · ${item.blocked} blocked` : 'Evidence unavailable'}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}`, mb: 4 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>SIGNED-IN FIVE-ROLE SMOKE</Typography>
            <Typography variant="h5" fontWeight={950}>Owner, Tenant, Technician, Broker, Admin</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,.58)', maxWidth: 880 }}>
              Real signed-in proof only. An unreadable collection is shown as unavailable, never as five pending roles.
            </Typography>
          </Box>
          <Chip
            label={smokeLoading ? 'loading...' : smokeAuthoritative ? `${smokePassedCount}/${SIGNED_IN_SMOKE_CHECKS.length} passed` : 'evidence unavailable'}
            sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, bgcolor: alpha(smokeAuthoritative && smokePassedCount === SIGNED_IN_SMOKE_CHECKS.length ? '#22c55e' : smokeAuthoritative ? '#f59e0b' : '#ef4444', .15), color: smokeAuthoritative && smokePassedCount === SIGNED_IN_SMOKE_CHECKS.length ? '#22c55e' : smokeAuthoritative ? '#f59e0b' : '#ef4444', fontWeight: 950 }}
          />
        </Stack>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          {SIGNED_IN_SMOKE_CHECKS.map((check) => {
            const latest = latestSmokeByRole.get(check.role);
            const latestStatus = latest?.status || 'pending';
            return (
              <Grid item xs={12} sm={6} md={2.4} key={check.role}>
                <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,.035)', border: `1px solid ${alpha(smokeAuthoritative ? statusColor[latestStatus] : '#ef4444', .28)}` }}>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography fontWeight={950} textTransform="capitalize">{check.role}</Typography>
                      <Chip size="small" label={smokeAuthoritative ? latestStatus : 'unavailable'} sx={{ bgcolor: alpha(smokeAuthoritative ? statusColor[latestStatus] : '#ef4444', .15), color: smokeAuthoritative ? statusColor[latestStatus] : '#ef4444', fontWeight: 850 }} />
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)' }}>{check.route}</Typography>
                    <Typography variant="caption" sx={{ color: smokeAuthoritative && latest?.proofRef ? '#22c55e' : 'rgba(255,255,255,.38)', fontWeight: 800 }}>
                      {smokeAuthoritative ? latest?.proofRef || 'No proof yet' : 'Evidence could not be read'}
                    </Typography>
                  </Stack>
                </Box>
              </Grid>
            );
          })}
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12} md={2}>
            <TextField select label="Role" value={selectedSmokeRole} fullWidth onChange={(event) => {
              const roleValue = event.target.value as SmokeRole;
              const check = SIGNED_IN_SMOKE_CHECKS.find((item) => item.role === roleValue) || SIGNED_IN_SMOKE_CHECKS[0];
              setSelectedSmokeRole(roleValue);
              setSmokeRoute(check.route);
            }}>
              {SIGNED_IN_SMOKE_CHECKS.map((check) => <MenuItem key={check.role} value={check.role}>{check.role}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField select label="Status" value={smokeStatus} fullWidth onChange={(event) => setSmokeStatus(event.target.value as GateStatus)}>
              {statuses.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}><TextField label="Tested account email" value={smokeAccountEmail} fullWidth onChange={(event) => setSmokeAccountEmail(event.target.value)} /></Grid>
          <Grid item xs={12} md={2}><TextField label="Route tested" value={smokeRoute} fullWidth onChange={(event) => setSmokeRoute(event.target.value)} /></Grid>
          <Grid item xs={12} md={3}><TextField label="Screenshot / log / proof reference" value={smokeProofRef} fullWidth onChange={(event) => setSmokeProofRef(event.target.value)} /></Grid>
          <Grid item xs={12} md={9}><TextField label="What was verified / what failed" value={smokeNotes} multiline minRows={2} fullWidth onChange={(event) => setSmokeNotes(event.target.value)} /></Grid>
          <Grid item xs={12} md={3}>
            <Button fullWidth sx={{ height: '100%', minHeight: 56, bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }} disabled={smokeBusy || !smokeAuthoritative} onClick={saveSmokeProof} variant="contained">
              {smokeBusy ? 'Saving...' : 'Save smoke proof'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

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
                    <Box onClick={() => { setSelectedGate(gate.id); if (evidenceAuthoritative) setStatus(currentStatus); }} sx={{ p: 1.6, borderRadius: 3, cursor: 'pointer', bgcolor: selectedGate === gate.id ? alpha(binThemeTokens.gold, .14) : 'rgba(255,255,255,.035)', border: `1px solid ${selectedGate === gate.id ? alpha(binThemeTokens.gold, .34) : 'rgba(255,255,255,.07)'}` }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                        <Typography fontWeight={950}>{gate.title}</Typography>
                        <Stack direction="row" spacing={0.8}>
                          <Chip size="small" label={gate.group} sx={{ bgcolor: alpha(binThemeTokens.gold, .11), color: binThemeTokens.gold, fontWeight: 850 }} />
                          <Chip size="small" label={evidenceAuthoritative ? currentStatus : 'unavailable'} sx={{ bgcolor: alpha(evidenceAuthoritative ? statusColor[currentStatus] : '#ef4444', .15), color: evidenceAuthoritative ? statusColor[currentStatus] : '#ef4444', fontWeight: 850 }} />
                        </Stack>
                      </Stack>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: .7 }}>{gate.proofRequired}</Typography>
                      <Typography variant="caption" sx={{ color: evidenceAuthoritative && latest?.proofRef ? '#22c55e' : 'rgba(255,255,255,.38)', mt: 1, display: 'block', fontWeight: 800 }}>
                        {evidenceAuthoritative ? `${latest?.proofRef ? `Latest proof: ${latest.proofRef}` : 'No proof recorded yet'} · ${getEvidenceTime(latest)}` : 'Evidence could not be read; status is not being inferred.'}
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
              {selectedEvidence && evidenceAuthoritative && (
                <Alert severity={selectedEvidence.status === 'passed' ? 'success' : selectedEvidence.status === 'blocked' ? 'error' : 'info'}>
                  Latest evidence: {selectedEvidence.status} · {selectedEvidence.proofRef || 'no proof reference'} · {getEvidenceTime(selectedEvidence)}
                </Alert>
              )}
              {!evidenceAuthoritative && <Alert severity="error">Proof recording is disabled until authoritative Firestore access is restored.</Alert>}
              {notice && <Alert severity={notice.includes('saved') || notice.includes('refreshed') ? 'success' : 'warning'}>{notice}</Alert>}
              <TextField select label="Launch gate" value={selectedGate} onChange={(event) => { setSelectedGate(event.target.value); if (evidenceAuthoritative) setStatus(latestByGate.get(event.target.value)?.status || 'pending'); }}>{LAUNCH_GATES.map((gate) => <MenuItem key={gate.id} value={gate.id}>{gate.title}</MenuItem>)}</TextField>
              <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value as GateStatus)} disabled={!evidenceAuthoritative}>{statuses.map((value) => <MenuItem key={value} value={value}><Chip size="small" label={value} sx={{ bgcolor: alpha(statusColor[value], .15), color: statusColor[value], fontWeight: 850 }} /></MenuItem>)}</TextField>
              <TextField label="Tester name" value={testerName} onChange={(event) => setTesterName(event.target.value)} disabled={!evidenceAuthoritative} />
              <TextField select label="Role tested" value={role} onChange={(event) => setRole(event.target.value)} disabled={!evidenceAuthoritative}>{roles.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
              <TextField select label="Device" value={device} onChange={(event) => setDevice(event.target.value)} disabled={!evidenceAuthoritative}>{devices.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
              <TextField label="Production URL" value={productionUrl} onChange={(event) => setProductionUrl(event.target.value)} disabled={!evidenceAuthoritative} />
              <TextField label="Screenshot / log / evidence reference" value={proofRef} onChange={(event) => setProofRef(event.target.value)} disabled={!evidenceAuthoritative} placeholder="Example: GitHub run ID, screenshot file name, Firebase log link" />
              <TextField label="Notes" multiline minRows={4} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!evidenceAuthoritative} placeholder="What passed, what failed, exact action tested, next fix if any." />
              <Button onClick={saveProof} disabled={busy || !evidenceAuthoritative} variant="contained" startIcon={<CheckCircle2 size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }}>{busy ? 'Saving...' : 'Save proof record'}</Button>
              <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)', fontWeight: 850 }}>
                Launch honesty rule: only a successful Firestore read can drive readiness. Latest real record per gate controls the decision. Authorization errors pause the decision instead of creating false 0% / 30-pending output.
              </Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
