import React from 'react';
import { Alert, Box, Chip, CircularProgress, Stack, Typography, alpha } from '@mui/material';
import {
  evidenceCountsForPublicLaunch,
  normalizeCommitSha,
  selectAuthoritativeLaunchEvidence,
} from '@bin/shared';
import { collection, db, limit, onSnapshot, query, where } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import PublicLaunchCommandCenterPageV2, { LAUNCH_GATES } from './PublicLaunchCommandCenterPageV2';

type SmokeRole = 'owner' | 'tenant' | 'technician' | 'broker' | 'admin';

type SmokeRecord = {
  id: string;
  role?: SmokeRole;
  status?: string | null;
  evidenceLayer?: string | null;
  releaseSha?: string | null;
  commitSha?: string | null;
  source?: string | null;
  executionGenerated?: boolean | null;
  hardLaunchClaim?: boolean | null;
  createdAt?: { toMillis?: () => number; seconds?: number } | null;
};

const REQUIRED_SMOKE_ROLES: readonly SmokeRole[] = ['owner', 'tenant', 'technician', 'broker', 'admin'];
const RELEASE_SHA = normalizeCommitSha(process.env.REACT_APP_RELEASE_COMMIT_SHA);

export { LAUNCH_GATES };

function createdAtMillis(value: SmokeRecord['createdAt']): number {
  if (!value || typeof value !== 'object') return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

/**
 * Route-level fail-closed guard for the public-launch command center.
 * The detailed workspace is not rendered until all five protected signed-in
 * role smoke proofs qualify as exact-SHA hosted production evidence.
 */
export default function PublicLaunchCommandCenterPage() {
  const { user } = useAuth();
  const [records, setRecords] = React.useState<SmokeRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [readError, setReadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user?.uid) {
      setRecords([]);
      setLoading(false);
      setReadError('No authenticated Admin session is available.');
      return undefined;
    }
    if (!RELEASE_SHA) {
      setRecords([]);
      setLoading(false);
      setReadError('This build is not bound to an exact 40-character release SHA.');
      return undefined;
    }

    setLoading(true);
    setReadError(null);
    // Scope to the exact release SHA so protected evidence cannot fall out of a
    // global newest-N window after unrelated smoke history grows.
    const smokeQuery = query(
      collection(db, 'signed_in_smoke_checks'),
      where('releaseSha', '==', RELEASE_SHA),
      limit(150),
    );
    const unsubscribe = onSnapshot(smokeQuery, (snapshot) => {
      setRecords(snapshot.docs.map((document) => ({
        id: document.id,
        ...(document.data() as Omit<SmokeRecord, 'id'>),
      })));
      setReadError(null);
      setLoading(false);
    }, (error) => {
      console.error('[PUBLIC-LAUNCH] five-role smoke guard failed', error);
      setRecords([]);
      setReadError(error?.message || 'Could not read authoritative signed-in smoke evidence.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const currentByRole = React.useMemo(() => {
    const result = new Map<SmokeRole, SmokeRecord>();
    if (!RELEASE_SHA) return result;
    for (const record of records) {
      if (!record.role || !REQUIRED_SMOKE_ROLES.includes(record.role)) continue;
      const observedSha = normalizeCommitSha(record.releaseSha || record.commitSha);
      if (observedSha !== RELEASE_SHA) continue;
      const existing = result.get(record.role);
      result.set(
        record.role,
        selectAuthoritativeLaunchEvidence(
          existing,
          record,
          RELEASE_SHA,
          'hosted',
          createdAtMillis(record.createdAt) > createdAtMillis(existing?.createdAt),
        ),
      );
    }
    return result;
  }, [records]);

  const roleStatuses = REQUIRED_SMOKE_ROLES.map((role) => {
    const latest = currentByRole.get(role);
    const passed = evidenceCountsForPublicLaunch(latest, RELEASE_SHA, 'hosted');
    return {
      role,
      passed,
      label: passed
        ? 'passed'
        : !latest
          ? 'missing'
          : latest.source === 'github-actions' && latest.executionGenerated === true
            ? 'proof insufficient'
            : latest.source === 'admin-manual-evidence'
              ? 'manual only'
              : 'not protected',
    };
  });
  const smokePassedCount = roleStatuses.filter((item) => item.passed).length;
  const fiveRoleSmokeReady = Boolean(RELEASE_SHA)
    && !loading
    && !readError
    && smokePassedCount === REQUIRED_SMOKE_ROLES.length;

  if (!fiveRoleSmokeReady) {
    return (
      <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
        <Stack spacing={2}>
          <Typography variant="overline" sx={{ fontWeight: 950, letterSpacing: 3 }}>PUBLIC LAUNCH COMMAND CENTER</Typography>
          <Typography variant="h3" sx={{ fontWeight: 950 }}>Five-role smoke gate</Typography>
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            <strong>PUBLIC LAUNCH BLOCKED.</strong> The detailed release-decision workspace is fail-closed until Owner, Tenant, Technician, Broker and Admin all have protected, execution-generated, exact-SHA hosted smoke evidence.
          </Alert>
          {loading ? (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={20} />
              <Typography>Loading authoritative signed-in smoke evidence…</Typography>
            </Stack>
          ) : (
            <Alert severity={readError ? 'error' : 'warning'} sx={{ borderRadius: 3 }}>
              Release SHA: <strong>{RELEASE_SHA || 'UNAVAILABLE'}</strong><br />
              Protected role smoke: <strong>{smokePassedCount}/{REQUIRED_SMOKE_ROLES.length}</strong><br />
              {readError || 'All five roles must pass on this exact release before the command center can evaluate PUBLIC READY.'}
            </Alert>
          )}
          {!loading && !readError && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {roleStatuses.map((item) => (
                <Chip
                  key={item.role}
                  size="small"
                  label={`${item.role}: ${item.label}`}
                  sx={{
                    textTransform: 'capitalize',
                    fontWeight: 850,
                    bgcolor: alpha(item.passed ? '#22c55e' : '#f59e0b', 0.16),
                    color: item.passed ? '#22c55e' : '#f59e0b',
                  }}
                />
              ))}
            </Stack>
          )}
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.68)', maxWidth: 900 }}>
            Manual browser evidence remains history/review material only. It cannot unlock this guard and cannot shadow protected GitHub Actions evidence; only records marked executionGenerated=true and hardLaunchClaim=false can qualify.
          </Typography>
        </Stack>
      </Box>
    );
  }

  return <PublicLaunchCommandCenterPageV2 />;
}
