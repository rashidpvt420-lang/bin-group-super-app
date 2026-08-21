import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { auth, functions, httpsCallable } from '../../lib/firebase';

const PHASE1_GATE_KEYS = [
  'ownerPaymentActivation',
  'paymentUnlockExactlyOnce',
  'tenantNotificationDelivery',
  'technicianPhysicalGpsEvidence',
  'brokerCommissionLockExactlyOnce',
  'adminStaffClaims',
  'appCheckEnforcement',
  'aiProviderHealth',
  'privilegedAccessRotation',
  'brandedEmailDelivery',
  'renewalScheduler',
] as const;

const GATE_LABELS: Record<string, string> = {
  ownerPaymentActivation: 'Owner Cash/Cheque payment activation',
  paymentUnlockExactlyOnce: 'Payment approval unlock exactly once',
  tenantNotificationDelivery: 'Tenant notification delivery',
  technicianPhysicalGpsEvidence: 'Technician physical GPS and evidence upload',
  brokerCommissionLockExactlyOnce: 'Broker attribution and commission lock',
  adminStaffClaims: 'Admin and staff production claims',
  stripeLiveBilling: 'Stripe live billing',
  appCheckEnforcement: 'Firebase App Check production enforcement',
  aiProviderHealth: 'Production AI provider health',
  privilegedAccessRotation: 'Privileged credential and secret rotation',
  brandedEmailDelivery: 'BIN GROUP branded email delivery',
  renewalScheduler: 'Contract renewal scheduler',
};

type GateEvidence = {
  status?: string;
  commitSha?: string;
  projectId?: string;
  evidenceReference?: string;
  sourceSystem?: string;
  verifiedBy?: string;
  verifiedAt?: string;
};

type LaunchSummary = {
  generatedAt?: string;
  sourceDocument?: string;
  paymentConfigSourceDocument?: string;
  paymentPolicy?: string;
  paymentConfigVersion?: string;
  approvedPaymentMethods?: string[];
  bankTransferEnabled?: boolean;
  stripeEnabled?: boolean;
  operationalEvidence?: Record<string, GateEvidence>;
};

function readableTimestamp(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  return 'Not recorded';
}

const errorText = (error: any) => String(
  error?.details || error?.message || error?.code || 'Unable to read protected production launch evidence.',
).replace(/^FirebaseError:\s*/i, '').slice(0, 360);

export default function SettingsPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<LaunchSummary>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const loadEvidence = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      if (!auth.currentUser) throw new Error('Admin authentication is required.');
      await auth.currentUser.getIdToken(true);
      const response: any = await httpsCallable(functions, 'adminGetLaunchConfigurationSummary')({});
      setSummary(response.data || {});
      setError(null);
      setLastSync(new Date());
    } catch (loadError) {
      console.error('Failed to load protected launch configuration evidence:', loadError);
      setError(errorText(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadEvidence(); }, [loadEvidence]);

  const paymentPolicy = String(summary.paymentPolicy || '').trim().toLowerCase();
  const launchGates = useMemo(() => {
    if (paymentPolicy === 'phase1-manual') return PHASE1_GATE_KEYS.map((key) => ({ key, label: GATE_LABELS[key] }));
    if (paymentPolicy === 'phase2-stripe') {
      return [...PHASE1_GATE_KEYS, 'stripeLiveBilling' as const].map((key) => ({ key, label: GATE_LABELS[key] }));
    }
    return [];
  }, [paymentPolicy]);

  const passedCount = useMemo(
    () => launchGates.filter((gate) => String(summary.operationalEvidence?.[gate.key]?.status || '').toLowerCase() === 'passed').length,
    [launchGates, summary.operationalEvidence],
  );
  const allPassed = launchGates.length > 0 && passedCount === launchGates.length;
  const methods = (summary.approvedPaymentMethods || []).map((method) => String(method).toUpperCase()).sort();
  const phase1PolicyValid = paymentPolicy === 'phase1-manual'
    && JSON.stringify(methods) === JSON.stringify(['CASH', 'CHEQUE'])
    && summary.bankTransferEnabled === false
    && summary.stripeEnabled === false;

  const appCheckClientEnabled = process.env.REACT_APP_ENABLE_FIREBASE_APPCHECK === 'true';
  const appCheckSiteKeyConfigured = Boolean(
    process.env.REACT_APP_APP_CHECK_SITE_KEY &&
    !String(process.env.REACT_APP_APP_CHECK_SITE_KEY).includes('REPLACE_ME'),
  );
  const firebaseProjectId = process.env.REACT_APP_FIREBASE_PROJECT_ID || 'bin-group-57c60';

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={1} sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          Production Configuration & Launch Gates
        </Typography>
        <Typography color="text.secondary">
          Protected server snapshot of the canonical production evidence registry and authoritative payment policy. Browser Firestore reads are not used for launch authority.
        </Typography>
      </Stack>

      <Alert severity={allPassed ? 'success' : 'warning'} sx={{ mb: 3, fontWeight: 700 }}>
        {allPassed
          ? `All ${launchGates.length} operational evidence records required by ${paymentPolicy} are present as PASS. Final public-launch clearance still requires the protected exact-SHA hard-launch validator.`
          : `${passedCount} of ${launchGates.length || 'the required'} operational evidence records are currently PASS. No hard-launch claim is made by this screen.`}
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Protected evidence sync failed: {error}
        </Alert>
      )}

      {paymentPolicy === 'phase1-manual' && !phase1PolicyValid && !loading && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Phase 1 payment policy mismatch. Production must allow exactly CASH and CHEQUE, with Bank Transfer and Stripe disabled.
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Firebase project</Typography>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>{firebaseProjectId}</Typography>
              <Typography variant="body2" color="text.secondary">Functions region: europe-west3</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Payment policy</Typography>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>{paymentPolicy || 'Not published'}</Typography>
              <Typography variant="body2" color="text.secondary">
                Approved: {methods.length ? methods.join(' + ') : 'Not recorded'}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                <Chip label={`BANK ${summary.bankTransferEnabled ? 'ON' : 'OFF'}`} color={summary.bankTransferEnabled ? 'error' : 'success'} size="small" />
                <Chip label={`STRIPE ${summary.stripeEnabled ? 'ON' : 'OFF'}`} color={summary.stripeEnabled ? 'warning' : 'success'} size="small" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Admin App Check client</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip label={appCheckClientEnabled ? 'ENABLED' : 'DISABLED'} color={appCheckClientEnabled ? 'success' : 'warning'} size="small" />
                <Chip label={appCheckSiteKeyConfigured ? 'SITE KEY SET' : 'SITE KEY MISSING'} color={appCheckSiteKeyConfigured ? 'success' : 'warning'} size="small" />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Server callable also enforces App Check.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Evidence sync</Typography>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                {lastSync ? lastSync.toLocaleString() : 'Waiting for protected snapshot'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Source: {summary.sourceDocument || 'system_health/admin_summaries'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>Operational launch evidence</Typography>
            <Typography variant="body2" color="text.secondary">
              Phase 1 excludes Stripe by policy. Each record below is written by a controlled verification workflow; the final exact-SHA launch validator remains authoritative.
            </Typography>
          </Box>
          <Chip label={`${passedCount}/${launchGates.length} PASS`} color={allPassed ? 'success' : 'warning'} sx={{ fontWeight: 900 }} />
        </Stack>

        <Divider sx={{ my: 2 }} />

        {loading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : launchGates.length === 0 ? (
          <Alert severity="error">Unsupported or missing production payment policy: {paymentPolicy || 'not published'}.</Alert>
        ) : (
          <Grid container spacing={2}>
            {launchGates.map((gate) => {
              const evidence = summary.operationalEvidence?.[gate.key] || {};
              const passed = String(evidence.status || '').toLowerCase() === 'passed';
              return (
                <Grid item xs={12} md={6} key={gate.key}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                        <Typography sx={{ fontWeight: 800 }}>{gate.label}</Typography>
                        <Chip label={passed ? 'PASS' : 'PENDING'} color={passed ? 'success' : 'warning'} size="small" />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        Verified: {readableTimestamp(evidence.verifiedAt)}
                      </Typography>
                      {evidence.verifiedBy ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Verified by: {String(evidence.verifiedBy)}</Typography> : null}
                      {evidence.commitSha ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Evidence SHA: {String(evidence.commitSha).slice(0, 12)}…</Typography> : null}
                      {evidence.sourceSystem ? <Typography variant="body2" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{String(evidence.sourceSystem)}</Typography> : null}
                      {evidence.evidenceReference ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, overflowWrap: 'anywhere' }}>{String(evidence.evidenceReference)}</Typography> : null}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Paper>

      <Alert severity="info" sx={{ mb: 3 }}>
        Maintenance mode, dispatch limits, payroll values, fee percentages, and notification delivery must not be changed through unvalidated browser defaults. Those controls remain protected until each policy is backed by a server workflow consumed by the production services that enforce it.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Button variant="contained" onClick={() => navigate('/smoke-test')}>Open Five-Profile Smoke Test</Button>
        <Button variant="outlined" onClick={() => void loadEvidence(true)} disabled={refreshing}>
          {refreshing ? <CircularProgress size={18} /> : 'Refresh Evidence'}
        </Button>
        <Button variant="text" onClick={() => navigate('/dashboard')}>Back to Operations Dashboard</Button>
      </Stack>
    </Container>
  );
}
