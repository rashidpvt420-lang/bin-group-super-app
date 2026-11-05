import { useEffect, useState } from 'react';
import { Alert, CircularProgress, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { functions, httpsCallable } from '../../lib/firebase';
import { designStatusLabel } from '../../lib/designStatusLabels';
import { ListRow, UiCard } from '../../components/ui';

type DesignJob = {
  id: string;
  status: string;
  propertyName: string;
  zoneType: string;
  optionLabel: string;
  finishTier: string;
};

export default function TechnicianDesignBriefsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<DesignJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const list = httpsCallable<Record<string, never>, { designs: DesignJob[] }>(functions, 'listDesignsAwaitingExecution');
        const result = await list({});
        if (!cancelled) setJobs(Array.isArray(result.data?.designs) ? result.data.designs : []);
      } catch (caught: any) {
        if (!cancelled) setError(caught?.message || 'Design jobs could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <Stack spacing={2} data-testid="technician-design-jobs">
      <Typography variant="h5" fontWeight={950}>Design jobs</Typography>
      <Typography variant="body2" color="text.secondary">
        Each job shows the picture the tenant locked and the layout brief for that option.
      </Typography>
      {loading && <CircularProgress aria-label="Loading design jobs" size={28} />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && jobs.length === 0 && <Alert severity="info">No design jobs are waiting for execution.</Alert>}
      {jobs.map((job) => (
        <UiCard key={job.id} testId={`design-job-${job.id}`} label={designStatusLabel(job.status)} title={job.propertyName || 'Design request'}>
          <Typography variant="body2" sx={{ mt: 0.5 }}>{[job.zoneType, job.optionLabel, job.finishTier].filter(Boolean).join(' · ')}</Typography>
          <ListRow title="Open layout brief" onClick={() => navigate(`/technician/design/${job.id}`)} />
        </UiCard>
      ))}
    </Stack>
  );
}
