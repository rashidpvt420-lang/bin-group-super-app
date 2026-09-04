import React from 'react';
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';
import { evidenceCountsForPublicLaunch, normalizeCommitSha } from '@bin/shared';
import { collection, db, limit, onSnapshot, orderBy, query } from '../../lib/firebase';
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
};

const REQUIRED_SMOKE_ROLES: readonly SmokeRole[] = ['owner', 'tenant', 'technician', 'broker', 'admin'];
const RELEASE_SHA = normalizeCommitSha(process.env.REACT_APP_RELEASE_COMMIT_SHA);

export { LAUNCH_GATES };

/**
 * Route-level fail-closed guard for the public-launch command center.
 *
 * The V2 workspace contains the detailed gate/evidence UI. It is intentionally
 * not rendered until all five signed-in role smoke proofs qualify as protected,
 * exact-SHA hosted evidence. This prevents the detailed gate view from ever
 * displaying PUBLIC READY while the five-role smoke chain is incomplete.
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
    const smokeQuery = query(
      collection(db, 'signed_in_smoke_checks'),
      orderBy('createdAt', 'desc'),
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
      if (observedSha !== RELEASE_SHA || result.has(record.role)) continue;
      result.set(record.role, record);
    }
    return result;
  }, [records]);

  const smokePassedCount = REQUIRED_SMOKE_ROLES.filter((role) => evidenceCountsForPublicLaunch(
    currentByRole.get(role),
    RELEASE_SHA,
    'hosted',
  )).length;
  const fiveRoleSmokeReady = Boolean(RELEASE_SHA) && !loading && !readError && smokePassedCount === REQUIRED_SMOKE_ROLES.length;

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
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.68)', maxWidth: 900 }}>
            Manual browser evidence remains history/review material only. It cannot unlock this guard; only GitHub Actions evidence marked executionGenerated=true and hardLaunchClaim=false can qualify.
          </Typography>
        </Stack>
      </Box>
    );
  }

  return <PublicLaunchCommandCenterPageV2 />;
}
