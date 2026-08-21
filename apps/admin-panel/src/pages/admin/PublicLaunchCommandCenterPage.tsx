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
import { CheckCircle2, ClipboardCheck, FileCheck2, Rocket, ShieldAlert, ShieldCheck } from 'lucide-react';
import { addDoc, collection, db, limit, onSnapshot, orderBy, query, serverTimestamp } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';

type GateStatus = 'pending' | 'passed' | 'blocked' | 'waived';
type GateGroup = 'Owner' | 'Tenant' | 'Technician' | 'Broker' | 'Admin' | 'Provider' | 'Device' | 'Business' | 'Role Buttons';
type SmokeRole = 'owner' | 'tenant' | 'technician' | 'broker' | 'admin';

type LaunchGate = {
  id: string;
  group: GateGroup;
  title: string;
  required: boolean;
  proofRequired: string;
};

type EvidenceBase = {
  id: string;
  schemaVersion?: number;
  source?: string;
  status: GateStatus;
  releaseSha?: string;
  workflowRunId?: string;
  proofRef?: string;
  notes?: string;
  evidenceHash?: string;
  recordedByEmail?: string | null;
  createdAt?: any;
};

type LaunchEvidence = EvidenceBase & {
  gateId: string;
  gateTitle?: string;
  gateGroup?: GateGroup;
  testerName?: string;
  role?: string;
  device?: string;
  productionUrl?: string;
};

type SignedInSmokeCheck = {
  role: SmokeRole;
  route: string;
  checkpoints: string;
};

type SignedInSmokeRecord = EvidenceBase & {
  role: SmokeRole;
  accountEmail?: string;
  route?: string;
};

type EvidenceReadError = { code: string; message: string };

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
  { id: 'paymentGatewayOrManualBank', group: 'Provider', title: 'Phase 1 Cash/Cheque activation proof', required: true, proofRequired: 'Owner contract -> 15% mobilization using approved Cash/Cheque -> Admin verification -> dashboard unlock and rejection path. Bank Transfer and Stripe remain disabled for Phase 1.' },
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

const SIGNED_IN_SMOKE_CHECKS: SignedInSmokeCheck[] = [
  { role: 'owner', route: '/owner', checkpoints: 'Fresh login, dashboard loads, owner-scoped properties/units and contract/payment state visible.' },
  { role: 'tenant', route: '/tenant', checkpoints: 'Fresh login, assigned unit or link fallback visible, request route opens, no cross-unit access.' },
  { role: 'technician', route: '/technician', checkpoints: 'Fresh login, assigned/open jobs load and mission controls remain permission-safe.' },
  { role: 'broker', route: '/broker', checkpoints: 'Fresh login, KYC/profile state visible, commissions and payout state open.' },
  { role: 'admin', route: '/dashboard', checkpoints: 'Fresh login, owners, tenants, technicians, brokers, payments, tickets, and audit load live data.' },
];

const roles = ['admin', 'owner', 'tenant', 'technician', 'broker'];
const devices = ['Android PWA', 'iPhone Safari', 'Desktop Chrome', 'Tablet', 'Other'];
const statuses: GateStatus[] = ['pending', 'passed', 'blocked', 'waived'];
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PRODUCTION_URL_PATTERN = /^https:\/\/(bin-group-57c60|bin-group-admin-panel)\.web\.app(?:\/.*)?$/;
const READ_ONLY_LAUNCH_ROLES = new Set(['manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']);
const TRUSTED_SOURCES = ['admin-command-center', 'github-actions'];

const statusColor: Record<GateStatus, string> = {
  pending: '#f59e0b',
  passed: '#22c55e',
  blocked: '#ef4444',
  waived: '#94a3b8',
};

const normalizeReadError = (error: any): EvidenceReadError => ({
  code: String(error?.code || 'unknown').toLowerCase(),
  message: String(error?.message || 'Evidence query failed.'),
});

const evidenceTime = (item?: EvidenceBase) => {
  const raw = item?.createdAt;
  try {
    const date = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'No evidence yet';
  } catch {
    return 'Evidence recorded';
  }
};

const evidenceMillis = (item: EvidenceBase) => {
  const raw = item.createdAt;
  try {
    if (typeof raw?.toMillis === 'function') return raw.toMillis();
    const date = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
    return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
  } catch {
    return 0;
  }
};

const hasTrustedProvenance = (record: EvidenceBase) =>
  record.schemaVersion === 2 &&
  TRUSTED_SOURCES.includes(String(record.source || '')) &&
  RELEASE_SHA_PATTERN.test(String(record.releaseSha || '')) &&
  HASH_PATTERN.test(String(record.evidenceHash || ''));

const sha256 = async (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export { LAUNCH_GATES };

export default function PublicLaunchCommandCenterPage() {
  const { user } = useAuth();
  const claims = (user?.claims || {}) as Record<string, any>;
  const claimRole = String(claims.role || claims.userRole || claims.primaryRole || user?.role || '').trim().toLowerCase();
  const permissions = claims.permissions && typeof claims.permissions === 'object' ? claims.permissions as Record<string, unknown> : {};
  const highTrustAdmin = Boolean(
    claims.superAdmin === true || claims.super_admin === true || claims.ceo === true ||
    ['admin', 'super_admin', 'ceo'].includes(claimRole) ||
    (!claimRole && (claims.admin === true || claims.isAdmin === true))
  );
  const canWriteEvidence = highTrustAdmin || permissions.canManageLaunchEvidence === true;
  const canReadEvidence = canWriteEvidence || READ_ONLY_LAUNCH_ROLES.has(claimRole);

  const [evidence, setEvidence] = React.useState<LaunchEvidence[]>([]);
  const [smokeRecords, setSmokeRecords] = React.useState<SignedInSmokeRecord[]>([]);
  const [evidenceLoading, setEvidenceLoading] = React.useState(true);
  const [smokeLoading, setSmokeLoading] = React.useState(true);
  const [evidenceReadError, setEvidenceReadError] = React.useState<EvidenceReadError | null>(null);
  const [smokeReadError, setSmokeReadError] = React.useState<EvidenceReadError | null>(null);
  const [selectedGate, setSelectedGate] = React.useState(LAUNCH_GATES[0].id);
  const [status, setStatus] = React.useState<GateStatus>('pending');
  const [testerName, setTesterName] = React.useState(user?.displayName || '');
  const [role, setRole] = React.useState('admin');
  const [device, setDevice] = React.useState('Desktop Chrome');
  const [productionUrl, setProductionUrl] = React.useState('https://bin-group-57c60.web.app');
  const [workflowRunId, setWorkflowRunId] = React.useState('');
  const [proofRef, setProofRef] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [selectedSmokeRole, setSelectedSmokeRole] = React.useState<SmokeRole>('owner');
  const [smokeStatus, setSmokeStatus] = React.useState<GateStatus>('pending');
  const [smokeAccountEmail, setSmokeAccountEmail] = React.useState('');
  const [smokeProofRef, setSmokeProofRef] = React.useState('');
  const [smokeNotes, setSmokeNotes] = React.useState('');
  const [smokeBusy, setSmokeBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  React.useEffect(() => {
    const launchQuery = query(collection(db, 'launch_evidence'), orderBy('createdAt', 'desc'), limit(300));
    return onSnapshot(launchQuery, (snapshot) => {
      setEvidence(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<LaunchEvidence, 'id'>) })));
      setEvidenceReadError(null);
      setEvidenceLoading(false);
    }, (error) => {
      setEvidenceReadError(normalizeReadError(error));
      setEvidenceLoading(false);
    });
  }, []);

  React.useEffect(() => {
    const smokeQuery = query(collection(db, 'signed_in_smoke_checks'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(smokeQuery, (snapshot) => {
      setSmokeRecords(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<SignedInSmokeRecord, 'id'>) })));
      setSmokeReadError(null);
      setSmokeLoading(false);
    }, (error) => {
      setSmokeReadError(normalizeReadError(error));
      setSmokeLoading(false);
    });
  }, []);

  const trustedEvidence = React.useMemo(() => evidence.filter(hasTrustedProvenance), [evidence]);
  const trustedSmokeRecords = React.useMemo(() => smokeRecords.filter(hasTrustedProvenance), [smokeRecords]);
  const evidenceReadable = !evidenceLoading && !evidenceReadError;
  const smokeReadable = !smokeLoading && !smokeReadError;
  const allEvidenceReadable = evidenceReadable && smokeReadable;

  const activeReleaseSha = React.useMemo(() => {
    const records: EvidenceBase[] = [...trustedEvidence, ...trustedSmokeRecords]
      .filter((item) => item.source === 'github-actions' && RELEASE_SHA_PATTERN.test(String(item.releaseSha || '')))
      .sort((a, b) => evidenceMillis(b) - evidenceMillis(a));
    return String(records[0]?.releaseSha || '');
  }, [trustedEvidence, trustedSmokeRecords]);
  const releaseSha = activeReleaseSha;
  const currentReleaseEvidence = React.useMemo(
    () => trustedEvidence.filter((item) => item.releaseSha === activeReleaseSha),
    [activeReleaseSha, trustedEvidence],
  );
  const currentReleaseSmokeRecords = React.useMemo(
    () => trustedSmokeRecords.filter((item) => item.releaseSha === activeReleaseSha),
    [activeReleaseSha, trustedSmokeRecords],
  );
  const releaseAuthoritative = allEvidenceReadable && RELEASE_SHA_PATTERN.test(activeReleaseSha);

  const latestByGate = React.useMemo(() => {
    const map = new Map<string, LaunchEvidence>();
    for (const item of currentReleaseEvidence) if (!map.has(item.gateId)) map.set(item.gateId, item);
    return map;
  }, [currentReleaseEvidence]);
  const latestSmokeByRole = React.useMemo(() => {
    const map = new Map<SmokeRole, SignedInSmokeRecord>();
    for (const item of currentReleaseSmokeRecords) if (!map.has(item.role)) map.set(item.role, item);
    return map;
  }, [currentReleaseSmokeRecords]);

  const requiredGates = LAUNCH_GATES.filter((gate) => gate.required);
  const gateStatus = (gate: LaunchGate): GateStatus | null => releaseAuthoritative ? (latestByGate.get(gate.id)?.status || 'pending') : null;
  const passedCount = releaseAuthoritative ? requiredGates.filter((gate) => ['passed', 'waived'].includes(gateStatus(gate) || '')).length : null;
  const blockedCount = releaseAuthoritative ? requiredGates.filter((gate) => gateStatus(gate) === 'blocked').length : null;
  const pendingRequired = passedCount === null || blockedCount === null ? null : requiredGates.length - passedCount - blockedCount;
  const readiness = passedCount === null ? null : Math.round((passedCount / Math.max(requiredGates.length, 1)) * 100);
  const smokePassedCount = releaseAuthoritative
    ? SIGNED_IN_SMOKE_CHECKS.filter((check) => ['passed', 'waived'].includes(latestSmokeByRole.get(check.role)?.status || 'pending')).length
    : null;

  const decision = evidenceLoading || smokeLoading
    ? 'EVIDENCE LOADING'
    : !releaseAuthoritative
      ? 'EVIDENCE UNAVAILABLE'
      : (blockedCount || 0) > 0
        ? 'PUBLIC LAUNCH BLOCKED'
        : pendingRequired === 0 && smokePassedCount === SIGNED_IN_SMOKE_CHECKS.length
          ? 'PUBLIC READY'
          : 'EVIDENCE REQUIRED';

  const groupSummary = React.useMemo(() => {
    const groups = Array.from(new Set(LAUNCH_GATES.map((gate) => gate.group)));
    return groups.map((group) => {
      const gates = LAUNCH_GATES.filter((gate) => gate.group === group && gate.required);
      if (!releaseAuthoritative) return { group, total: gates.length, passed: null, blocked: null, pending: null, score: null };
      const passed = gates.filter((gate) => ['passed', 'waived'].includes(latestByGate.get(gate.id)?.status || 'pending')).length;
      const blocked = gates.filter((gate) => latestByGate.get(gate.id)?.status === 'blocked').length;
      return { group, total: gates.length, passed, blocked, pending: gates.length - passed - blocked, score: Math.round((passed / Math.max(gates.length, 1)) * 100) };
    });
  }, [latestByGate, releaseAuthoritative]);

  const authorizationDiagnostic = React.useMemo(() => {
    const error = evidenceReadError || smokeReadError;
    if (!error) return !activeReleaseSha ? 'No trusted GitHub Actions production-release evidence is available yet. Readiness is withheld until an exact-SHA bridge/backfill publishes it.' : '';
    const denied = error.code.includes('permission-denied') || error.message.toLowerCase().includes('insufficient permissions');
    if (!denied) return `Evidence backend error: ${error.message}`;
    return canReadEvidence
      ? 'The signed token indicates launch-evidence read access, but deployed Firestore rules rejected the query. Refresh claims and verify deployed rules; do not weaken authorization.'
      : `Claim role “${claimRole || 'unknown'}” is not authorized to read launch evidence.`;
  }, [activeReleaseSha, canReadEvidence, claimRole, evidenceReadError, smokeReadError]);

  const validateCommonProof = (proof: string, proofNotes: string, proofStatus: GateStatus) => {
    if (!canWriteEvidence) return 'This account is read-only. Writing requires Admin/CEO/super-admin or canManageLaunchEvidence.';
    if (!releaseAuthoritative) return 'A trusted GitHub Actions production release must be active before manual proof can be appended.';
    if (!RELEASE_SHA_PATTERN.test(releaseSha)) return 'Exact production release SHA is unavailable.';
    if (workflowRunId && !/^\d+$/.test(workflowRunId)) return 'Workflow run ID must be numeric when provided.';
    if (!proof.trim()) return 'Screenshot/log/proof reference is required.';
    if (proofStatus === 'waived' && !proofNotes.trim()) return 'A waiver requires an explicit reason in Notes.';
    return '';
  };

  const saveProof = async () => {
    const selected = LAUNCH_GATES.find((gate) => gate.id === selectedGate) || LAUNCH_GATES[0];
    const validation = validateCommonProof(proofRef, notes, status);
    if (validation || !testerName.trim() || !PRODUCTION_URL_PATTERN.test(productionUrl.trim())) {
      setNotice(validation || (!testerName.trim() ? 'Tester name is required.' : 'Use a BIN GROUP production web.app URL.'));
      return;
    }
    try {
      setBusy(true);
      const payload = {
        schemaVersion: 2,
        source: 'admin-command-center',
        gateId: selectedGate,
        gateTitle: selected.title,
        gateGroup: selected.group,
        status,
        testerName: testerName.trim(),
        role,
        device,
        productionUrl: productionUrl.trim(),
        releaseSha,
        workflowRunId: workflowRunId.trim(),
        proofRef: proofRef.trim(),
        notes: notes.trim(),
        recordedBy: user?.uid || null,
        recordedByEmail: user?.email || null,
      };
      const evidenceHash = await sha256(payload);
      await addDoc(collection(db, 'launch_evidence'), { ...payload, evidenceHash, createdAt: serverTimestamp() });
      setNotice('Launch proof saved with exact-release provenance and evidence hash.');
      setProofRef('');
      setNotes('');
    } catch (error: any) {
      setNotice(error?.message || 'Could not save launch proof.');
    } finally {
      setBusy(false);
    }
  };

  const saveSmokeProof = async () => {
    const check = SIGNED_IN_SMOKE_CHECKS.find((item) => item.role === selectedSmokeRole) || SIGNED_IN_SMOKE_CHECKS[0];
    const validation = validateCommonProof(smokeProofRef, smokeNotes, smokeStatus);
    if (validation || !smokeAccountEmail.trim()) {
      setNotice(validation || 'Signed-in smoke requires the tested account email.');
      return;
    }
    try {
      setSmokeBusy(true);
      const payload = {
        schemaVersion: 2,
        source: 'admin-command-center',
        role: selectedSmokeRole,
        status: smokeStatus,
        accountEmail: smokeAccountEmail.trim().toLowerCase(),
        route: check.route,
        requiredRoute: check.route,
        checkpoints: check.checkpoints,
        proofRef: smokeProofRef.trim(),
        notes: smokeNotes.trim(),
        releaseSha,
        workflowRunId: workflowRunId.trim(),
        recordedBy: user?.uid || null,
        recordedByEmail: user?.email || null,
      };
      const evidenceHash = await sha256(payload);
      await addDoc(collection(db, 'signed_in_smoke_checks'), { ...payload, evidenceHash, createdAt: serverTimestamp() });
      setNotice('Signed-in smoke proof saved with exact-release provenance and evidence hash.');
      setSmokeProofRef('');
      setSmokeNotes('');
    } catch (error: any) {
      setNotice(error?.message || 'Could not save signed-in smoke proof.');
    } finally {
      setSmokeBusy(false);
    }
  };

  const decisionColor = decision === 'PUBLIC READY' ? '#22c55e' : decision.includes('BLOCKED') || decision === 'EVIDENCE UNAVAILABLE' ? '#ef4444' : '#f59e0b';
  const selectedEvidence = releaseAuthoritative ? latestByGate.get(selectedGate) : undefined;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>PUBLIC LAUNCH COMMAND CENTER</Typography>
          <Typography variant="h3" sx={{ fontWeight: 950, letterSpacing: -1 }}>Final Release Evidence Control</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.64)', maxWidth: 940, mt: 1 }}>
            Readiness is fail-closed and exact-release scoped. Historical evidence from another SHA can never complete the current release.
          </Typography>
        </Box>
        <Chip icon={<Rocket size={16} />} label={decision} sx={{ bgcolor: alpha(decisionColor, .16), color: decisionColor, fontWeight: 950, alignSelf: { xs: 'flex-start', md: 'center' } }} />
      </Stack>

      {!releaseAuthoritative && !evidenceLoading && !smokeLoading ? (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}><strong>EVIDENCE UNAVAILABLE — READINESS NOT CALCULATED.</strong> {authorizationDiagnostic}</Alert>
      ) : (
        <Alert severity={decision === 'PUBLIC READY' ? 'success' : decision.includes('BLOCKED') ? 'error' : 'warning'} sx={{ mb: 3, borderRadius: 3 }}>
          {decision === 'PUBLIC READY' ? 'All 30 gates and all five signed-in roles are proven for the same trusted production SHA.' : 'Full public launch requires all 30 gates and all five signed-in roles on the exact active production SHA.'}
        </Alert>
      )}

      {activeReleaseSha && <Alert severity="info" sx={{ mb: 3, borderRadius: 3 }}>Active trusted production evidence SHA: <strong>{activeReleaseSha}</strong>. Only this SHA affects readiness.</Alert>}
      {(evidenceReadError || smokeReadError) && <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>Launch evidence feed: {evidenceReadError?.message || 'readable'} · Smoke feed: {smokeReadError?.message || 'readable'}</Alert>}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}><Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)' }}><ShieldCheck color={readiness === null ? '#ef4444' : binThemeTokens.gold} /><Typography variant="h5" fontWeight={950}>Launch readiness</Typography><Typography variant="h3" fontWeight={950} color={readiness === null ? '#ef4444' : binThemeTokens.gold}>{readiness === null ? '—' : `${readiness}%`}</Typography><LinearProgress variant="determinate" value={readiness ?? 0} sx={{ height: 10, borderRadius: 10, my: 1 }} /><Typography sx={{ color: 'rgba(255,255,255,.62)' }}>{passedCount === null ? 'Evidence unreadable; score withheld.' : `${passedCount}/${requiredGates.length} exact-SHA gates passed/waived.`}</Typography></Paper></Grid>
        <Grid item xs={12} md={4}><Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)' }}><ShieldAlert color={(blockedCount || 0) > 0 ? '#ef4444' : '#f59e0b'} /><Typography variant="h5" fontWeight={950}>Required gates pending</Typography><Typography variant="h3" fontWeight={950}>{pendingRequired === null ? '—' : pendingRequired}</Typography><Typography sx={{ color: 'rgba(255,255,255,.62)' }}>{blockedCount === null ? 'Counts unavailable.' : `${blockedCount} blocked. Public signup stays closed until both are zero.`}</Typography></Paper></Grid>
        <Grid item xs={12} md={4}><Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)' }}><FileCheck2 color={releaseAuthoritative ? '#22c55e' : '#ef4444'} /><Typography variant="h5" fontWeight={950}>Current-release evidence</Typography><Typography variant="h3" fontWeight={950}>{releaseAuthoritative ? currentReleaseEvidence.length : '—'}</Typography><Typography sx={{ color: 'rgba(255,255,255,.62)' }}>{releaseAuthoritative ? `${currentReleaseEvidence.length} trusted current-SHA records; ${trustedEvidence.length} trusted records exist across all releases.` : 'Zero is never assumed when release evidence is unavailable.'}</Typography></Paper></Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {groupSummary.map((item) => <Grid item xs={12} sm={6} md={3} key={item.group}><Paper sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,.035)' }}><Typography fontWeight={950}>{item.group}</Typography><Typography variant="h5" fontWeight={950}>{item.score === null ? '—' : `${item.score}%`}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)' }}>{item.passed === null ? 'Evidence unavailable' : `${item.passed}/${item.total} passed · ${item.pending} pending · ${item.blocked} blocked`}</Typography></Paper></Grid>)}
      </Grid>

      <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', mb: 4 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}><Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>SIGNED-IN FIVE-ROLE SMOKE</Typography><Typography variant="h5" fontWeight={950}>Owner, Tenant, Technician, Broker, Admin</Typography></Box><Chip label={releaseAuthoritative ? `${smokePassedCount}/${SIGNED_IN_SMOKE_CHECKS.length} passed` : 'EVIDENCE UNAVAILABLE'} /></Stack>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {SIGNED_IN_SMOKE_CHECKS.map((check) => {
            const latest = releaseAuthoritative ? latestSmokeByRole.get(check.role) : undefined;
            const state = latest?.status || 'pending';
            return <Grid item xs={12} sm={6} md={2.4} key={check.role}><Box sx={{ p: 2, borderRadius: 3, border: `1px solid ${alpha(releaseAuthoritative ? statusColor[state] : '#ef4444', .3)}` }}><Typography fontWeight={950} textTransform="capitalize">{check.role}</Typography><Chip size="small" label={releaseAuthoritative ? state : 'unavailable'} /><Typography variant="caption" display="block" sx={{ mt: 1, color: 'rgba(255,255,255,.58)' }}>{releaseAuthoritative ? latest?.proofRef || 'No trusted proof yet' : 'Evidence feed unavailable — status withheld'}</Typography></Box></Grid>;
          })}
        </Grid>
        <Grid container spacing={2}>
          <Grid item xs={12} md={2}><TextField select fullWidth label="Role" value={selectedSmokeRole} onChange={(event) => setSelectedSmokeRole(event.target.value as SmokeRole)}>{SIGNED_IN_SMOKE_CHECKS.map((check) => <MenuItem key={check.role} value={check.role}>{check.role}</MenuItem>)}</TextField></Grid>
          <Grid item xs={12} md={2}><TextField select fullWidth label="Status" value={smokeStatus} onChange={(event) => setSmokeStatus(event.target.value as GateStatus)}>{statuses.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth label="Tested account email" value={smokeAccountEmail} onChange={(event) => setSmokeAccountEmail(event.target.value)} /></Grid>
          <Grid item xs={12} md={4}><TextField fullWidth label="Screenshot / log / proof reference" value={smokeProofRef} onChange={(event) => setSmokeProofRef(event.target.value)} /></Grid>
          <Grid item xs={12} md={9}><TextField fullWidth multiline minRows={2} label="What was verified / what failed" value={smokeNotes} onChange={(event) => setSmokeNotes(event.target.value)} /></Grid>
          <Grid item xs={12} md={3}><Button fullWidth variant="contained" sx={{ minHeight: 56, bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }} disabled={smokeBusy || !canWriteEvidence || !releaseAuthoritative} onClick={saveSmokeProof}>{smokeBusy ? 'Saving...' : 'Save smoke proof'}</Button></Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}><Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)' }}><Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2 }}><ClipboardCheck color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950}>Required launch gates</Typography></Stack><Grid container spacing={1.4}>{LAUNCH_GATES.map((gate) => {
          const state = gateStatus(gate);
          const latest = releaseAuthoritative ? latestByGate.get(gate.id) : undefined;
          return <Grid item xs={12} md={6} key={gate.id}><Box onClick={() => { setSelectedGate(gate.id); if (state) setStatus(state); }} sx={{ p: 1.6, borderRadius: 3, cursor: 'pointer', bgcolor: selectedGate === gate.id ? alpha(binThemeTokens.gold, .14) : 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)' }}><Stack direction="row" justifyContent="space-between" spacing={1}><Typography fontWeight={950}>{gate.title}</Typography><Chip size="small" label={state || 'unavailable'} /></Stack><Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: .7 }}>{gate.proofRequired}</Typography><Typography variant="caption" sx={{ color: latest?.proofRef ? '#22c55e' : 'rgba(255,255,255,.38)', mt: 1, display: 'block' }}>{releaseAuthoritative ? `${latest?.proofRef ? `Latest proof: ${latest.proofRef}` : 'No trusted proof recorded yet'} · ${evidenceTime(latest)}` : 'Evidence feed unavailable — status withheld'}</Typography></Box></Grid>;
        })}</Grid></Paper></Grid>

        <Grid item xs={12} md={5}><Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)' }}><Stack spacing={2}>
          <Typography variant="h5" fontWeight={950}>Record proof</Typography>
          {!canWriteEvidence && <Alert severity="info">Read-only access. Writing requires Admin/CEO/super-admin or the explicit canManageLaunchEvidence permission.</Alert>}
          {selectedEvidence && <Alert severity={selectedEvidence.status === 'passed' ? 'success' : selectedEvidence.status === 'blocked' ? 'error' : 'info'}>Latest exact-SHA evidence: {selectedEvidence.status} · {selectedEvidence.proofRef}</Alert>}
          {notice && <Alert severity={notice.toLowerCase().includes('saved') ? 'success' : 'warning'}>{notice}</Alert>}
          <TextField label="Active exact production release SHA" value={releaseSha} helperText="Set only by trusted GitHub Actions evidence; historical SHAs are excluded from readiness." InputProps={{ readOnly: true }} />
          <TextField label="GitHub workflow run ID (optional)" value={workflowRunId} onChange={(event) => setWorkflowRunId(event.target.value.trim())} />
          <TextField select label="Launch gate" value={selectedGate} onChange={(event) => setSelectedGate(event.target.value)}>{LAUNCH_GATES.map((gate) => <MenuItem key={gate.id} value={gate.id}>{gate.title}</MenuItem>)}</TextField>
          <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value as GateStatus)}>{statuses.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
          <TextField label="Tester name" value={testerName} onChange={(event) => setTesterName(event.target.value)} />
          <TextField select label="Role tested" value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
          <TextField select label="Device" value={device} onChange={(event) => setDevice(event.target.value)}>{devices.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
          <TextField label="Production URL" value={productionUrl} onChange={(event) => setProductionUrl(event.target.value)} />
          <TextField label="Screenshot / log / evidence reference" value={proofRef} onChange={(event) => setProofRef(event.target.value)} />
          <TextField label="Notes" multiline minRows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
          <Button onClick={saveProof} disabled={busy || !canWriteEvidence || !releaseAuthoritative} variant="contained" startIcon={<CheckCircle2 size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }}>{busy ? 'Saving...' : 'Save proof record'}</Button>
          <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)', fontWeight: 850 }}>Only schema-v2 records with trusted provenance, SHA-256 evidenceHash, and the active exact releaseSha affect readiness. Evidence is append-only; corrections are newer records, never edits/deletes.</Typography>
        </Stack></Paper></Grid>
      </Grid>
    </Box>
  );
}
