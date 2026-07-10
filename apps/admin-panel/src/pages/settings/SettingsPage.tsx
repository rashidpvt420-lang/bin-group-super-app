import React, { useEffect, useMemo, useState } from 'react';
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
import { db, doc, onSnapshot } from '../../lib/firebase';

const LAUNCH_SUMMARY_PATH = ['system_health', 'admin_summaries'] as const;

const launchGates = [
  { key: 'adminCredentialLogin', label: 'Admin production credential login' },
  { key: 'fiveProfileSmoke', label: 'Five-profile live workflow smoke test' },
  { key: 'stripeLiveMode', label: 'Stripe live payment mode' },
  { key: 'appCheckProduction', label: 'Firebase App Check production enforcement' },
  { key: 'brandedEmailSender', label: 'BIN GROUP branded email delivery' },
  { key: 'adminSecretRotation', label: 'Admin credential and secret rotation' },
  { key: 'tenantNotificationDelivery', label: 'Tenant notification delivery' },
  { key: 'technicianGpsStorageProof', label: 'Technician GPS and evidence upload' },
  { key: 'brokerCommissionLock', label: 'Broker attribution and commission lock' },
  { key: 'renewalWatch', label: 'Contract renewal watch and document queue' },
] as const;

type LaunchSummary = Record<string, unknown>;

function readableTimestamp(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toLocaleString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  return 'Not recorded';
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<LaunchSummary>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    const ref = doc(db, ...LAUNCH_SUMMARY_PATH);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setSummary(snapshot.exists() ? snapshot.data() : {});
        setLoading(false);
        setError(null);
        setLastSync(new Date());
      },
      (snapshotError) => {
        console.error('Failed to load launch configuration evidence:', snapshotError);
        setError(snapshotError.message || 'Unable to read production launch evidence.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const passedCount = useMemo(
    () => launchGates.filter((gate) => summary[gate.key] === true).length,
    [summary],
  );
  const allPassed = passedCount === launchGates.length;

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
          Verified Firebase configuration and evidence-backed launch status. Operational policies are deployment-managed; this page does not use the retired localhost REST API.
        </Typography>
      </Stack>

      <Alert severity={allPassed ? 'success' : 'warning'} sx={{ mb: 3, fontWeight: 700 }}>
        {allPassed
          ? 'All required public-launch evidence gates are recorded as PASS.'
          : `${passedCount} of ${launchGates.length} public-launch evidence gates are proven. Public launch remains blocked until every gate is verified with live evidence.`}
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error} Confirm that this admin account has current production claims and that Firestore is reachable.
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Firebase project</Typography>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>{firebaseProjectId}</Typography>
              <Typography variant="body2" color="text.secondary">Functions region: europe-west3</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Admin App Check client</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip
                  label={appCheckClientEnabled ? 'ENABLED' : 'DISABLED'}
                  color={appCheckClientEnabled ? 'success' : 'warning'}
                  size="small"
                />
                <Chip
                  label={appCheckSiteKeyConfigured ? 'SITE KEY SET' : 'SITE KEY MISSING'}
                  color={appCheckSiteKeyConfigured ? 'success' : 'warning'}
                  size="small"
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Console enforcement still requires separate live verification.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Evidence sync</Typography>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                {lastSync ? lastSync.toLocaleString() : 'Waiting for Firestore'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Source: system_health/admin_summaries
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>Public-launch evidence</Typography>
            <Typography variant="body2" color="text.secondary">
              A gate turns green only after its live proof is written by the controlled verification process.
            </Typography>
          </Box>
          <Chip
            label={`${passedCount}/${launchGates.length} PASS`}
            color={allPassed ? 'success' : 'warning'}
            sx={{ fontWeight: 900 }}
          />
        </Stack>

        <Divider sx={{ my: 2 }} />

        {loading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={2}>
            {launchGates.map((gate) => {
              const passed = summary[gate.key] === true;
              const evidence = summary[`${gate.key}Evidence`];
              const verifiedAt = summary[`${gate.key}VerifiedAt`];
              const verifiedBy = summary[`${gate.key}VerifiedBy`];
              return (
                <Grid item xs={12} md={6} key={gate.key}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                        <Typography sx={{ fontWeight: 800 }}>{gate.label}</Typography>
                        <Chip label={passed ? 'PASS' : 'PENDING'} color={passed ? 'success' : 'warning'} size="small" />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        Verified: {readableTimestamp(verifiedAt)}
                      </Typography>
                      {verifiedBy ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Verified by: {String(verifiedBy)}
                        </Typography>
                      ) : null}
                      {evidence ? (
                        <Typography variant="body2" sx={{ mt: 1, overflowWrap: 'anywhere' }}>
                          {String(evidence)}
                        </Typography>
                      ) : null}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Paper>

      <Alert severity="info" sx={{ mb: 3 }}>
        Maintenance mode, dispatch limits, payroll values, fee percentages, and notification delivery must not be changed through unvalidated browser defaults. Those controls were removed until each policy is backed by a protected server workflow and consumed by the production services that enforce it.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Button variant="contained" onClick={() => navigate('/smoke-test')}>
          Open Five-Profile Smoke Test
        </Button>
        <Button variant="outlined" onClick={() => window.location.reload()}>
          Refresh Evidence
        </Button>
        <Button variant="text" onClick={() => navigate('/dashboard')}>
          Back to Operations Dashboard
        </Button>
      </Stack>
    </Container>
  );
}
