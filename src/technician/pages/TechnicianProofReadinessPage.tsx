import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Grid, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import { collection, db } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { ALL_TECHNICIAN_ACTIVE_STATUSES, onSnapshotSplitIn } from '../../shared-exports';

type JobRow = { id: string; [key: string]: any };
const ui = { ink: '#111827', muted: '#667085', line: '#E5E7EB', gold: binThemeTokens.gold, green: '#059669', red: '#DC2626', blue: '#2563EB' };
const arrayCount = (value: any) => Array.isArray(value) ? value.length : 0;
const normalize = (value: any) => String(value || '').trim();
const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  if (value?._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const proofStateFor = (job: JobRow) => {
  const proof = job.proofReadiness || {};
  const before = Boolean(proof.beforePhoto) || Boolean(job.beforePhotoUrl) || arrayCount(job.beforePhotos) > 0 || arrayCount(job.tenantPhotos) > 0 || arrayCount(job.photos) > 0 || arrayCount(job.initialPhotoUrls) > 0;
  const after = Boolean(proof.afterPhoto) || Boolean(job.afterPhotoUrl) || arrayCount(job.afterPhotos) > 0 || arrayCount(job.proofPhotos) > 0 || arrayCount(job.evidencePhotos) > 0 || arrayCount(job.completionPhotos) > 0;
  const notes = Boolean(proof.notes) || normalize(job.technicianNotes || job.resolutionNotes || job.notes).length >= 10;
  const parts = Boolean(proof.partsDisposition) || arrayCount(job.materialsUsed) > 0 || Boolean(job.partsDisposition || job.partsUsed || job.noPartsRequired);
  const missing = [!before && 'before photo', !after && 'after photo', !notes && 'resolution notes', !parts && 'parts/materials'].filter(Boolean) as string[];
  return { before, after, notes, parts, score: 4 - missing.length, total: 4, ready: missing.length === 0, missing };
};

export default function TechnicianProofReadinessPage() {
  const { user } = useRole();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [warning, setWarning] = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshotSplitIn(collection(db, 'maintenanceTickets'), { field: 'assignedTechnicianId', value: user.uid }, 'status', ALL_TECHNICIAN_ACTIVE_STATUSES, (rows: JobRow[]) => {
      setJobs([...rows].sort((a, b) => getMillis(b.updatedAt || b.createdAt) - getMillis(a.updatedAt || a.createdAt)));
      setWarning('');
    }, (err: any) => {
      console.warn('[TechnicianProofReadiness] active jobs unavailable:', err);
      setWarning('Could not load active job proof readiness. Check ticket access rules or try again.');
    });
    return () => unsub();
  }, [user?.uid]);

  const rows = useMemo(() => jobs.map((job) => ({ job, proof: proofStateFor(job) })), [jobs]);
  const ready = rows.filter((row) => row.proof.ready).length;
  const blocked = rows.length - ready;
  const ratio = rows.length ? Math.round((ready / rows.length) * 100) : 0;
  const missingBefore = rows.filter((row) => !row.proof.before).length;
  const missingAfter = rows.filter((row) => !row.proof.after).length;
  const missingNotes = rows.filter((row) => !row.proof.notes).length;
  const missingParts = rows.filter((row) => !row.proof.parts).length;

  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: ui.gold, fontWeight: 950, letterSpacing: 3 }}>TECHNICIAN PROOF COMMAND</Typography>
          <Typography variant="h3" sx={{ color: ui.ink, fontWeight: 950, mt: 1 }}>Proof Readiness</Typography>
          <Typography sx={{ color: ui.muted, mt: 1, fontWeight: 700 }}>Every active job must have before evidence, after proof, resolution notes, and parts/materials disposition before close.</Typography>
        </Box>
        {warning && <Alert severity="warning">{warning}</Alert>}

        <Paper sx={{ p: 3, borderRadius: 4, border: `1px solid ${alpha(blocked ? ui.gold : ui.green, 0.28)}`, bgcolor: alpha(blocked ? ui.gold : ui.green, 0.06) }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
            <Box>
              <Typography variant="h4" sx={{ color: ui.ink, fontWeight: 950 }}>{ratio}% ready</Typography>
              <Typography sx={{ color: ui.muted, fontWeight: 800 }}>{ready}/{rows.length} active jobs have complete close proof</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Blocked: ${blocked}`} sx={{ bgcolor: '#fff', color: blocked ? ui.red : ui.green, fontWeight: 950 }} />
              <Chip label={`Before missing: ${missingBefore}`} sx={{ bgcolor: '#fff', color: missingBefore ? ui.gold : ui.green, fontWeight: 950 }} />
              <Chip label={`After missing: ${missingAfter}`} sx={{ bgcolor: '#fff', color: missingAfter ? ui.red : ui.green, fontWeight: 950 }} />
              <Chip label={`Notes missing: ${missingNotes}`} sx={{ bgcolor: '#fff', color: missingNotes ? ui.gold : ui.green, fontWeight: 950 }} />
              <Chip label={`Parts missing: ${missingParts}`} sx={{ bgcolor: '#fff', color: missingParts ? ui.gold : ui.green, fontWeight: 950 }} />
            </Stack>
          </Stack>
          <LinearProgress variant="determinate" value={ratio} sx={{ height: 10, borderRadius: 5, mt: 2, bgcolor: ui.line, '& .MuiLinearProgress-bar': { bgcolor: blocked ? ui.gold : ui.green } }} />
        </Paper>

        <Grid container spacing={2}>
          {rows.map(({ job, proof }) => (
            <Grid item xs={12} md={6} key={job.id}>
              <Paper onClick={() => navigate(`/technician/job/${job.id}`)} sx={{ p: 2.5, borderRadius: 4, cursor: 'pointer', border: `1px solid ${alpha(proof.ready ? ui.green : ui.gold, 0.28)}`, bgcolor: '#fff', '&:hover': { borderColor: ui.gold } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                  <Box>
                    <Typography sx={{ color: ui.ink, fontWeight: 950 }}>{job.category || job.issueType || 'Maintenance Mission'}</Typography>
                    <Typography variant="caption" sx={{ color: ui.muted, fontWeight: 800 }}>#{String(job.id).slice(0, 8)} · {job.propertyName || job.address || 'Property not linked'}</Typography>
                  </Box>
                  <Chip icon={proof.ready ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} label={`Proof ${proof.score}/${proof.total}`} sx={{ bgcolor: alpha(proof.ready ? ui.green : ui.gold, 0.12), color: proof.ready ? ui.green : ui.gold, fontWeight: 950 }} />
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                  {['before', 'after', 'notes', 'parts'].map((item) => {
                    const ok = Boolean((proof as any)[item]);
                    return <Chip key={item} size="small" label={`${ok ? '✓' : '•'} ${item}`} sx={{ bgcolor: alpha(ok ? ui.green : ui.gold, 0.1), color: ok ? ui.green : ui.gold, fontWeight: 900 }} />;
                  })}
                </Stack>
                {!proof.ready && <Typography variant="caption" sx={{ display: 'block', color: ui.red, mt: 1.5, fontWeight: 800 }}>Missing: {proof.missing.join(', ')}</Typography>}
                <Button endIcon={<ArrowRight size={14} />} sx={{ mt: 1.5, color: ui.gold, fontWeight: 950 }}>Open job</Button>
              </Paper>
            </Grid>
          ))}
          {rows.length === 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 6, borderRadius: 4, textAlign: 'center', border: `1px dashed ${alpha(ui.gold, 0.25)}` }}>
                <ShieldCheck size={44} color={ui.gold} style={{ margin: '0 auto 12px' }} />
                <Typography sx={{ color: ui.ink, fontWeight: 950 }}>No active jobs assigned</Typography>
                <Typography sx={{ color: ui.muted, mt: 1 }}>Proof readiness will appear when jobs are assigned or accepted.</Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      </Stack>
    </Box>
  );
}
