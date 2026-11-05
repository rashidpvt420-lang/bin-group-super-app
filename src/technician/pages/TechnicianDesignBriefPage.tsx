import { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { designStatusLabel } from '../../lib/designStatusLabels';
import DesignExecutionBriefView, { type DesignExecutionBrief } from '../../components/design/DesignExecutionBriefView';

type BriefResponse = {
  requestId: string;
  status: string;
  propertyName: string;
  executionBrief: DesignExecutionBrief | null;
  chosenImageUrl: string;
  referenceImageUrl: string;
  completionNote: string;
};

export default function TechnicianDesignBriefPage() {
  const { requestId = '' } = useParams();
  const { tx, isRTL } = useLanguage();
  const lang = isRTL ? 'ar' : 'en';
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      setBrief(null);
      try {
        const getBrief = httpsCallable<{ designRequestId: string }, BriefResponse>(functions, 'getDesignExecutionBrief');
        const result = await getBrief({ designRequestId: requestId });
        if (!cancelled) {
          setBrief(result.data);
          setNote(result.data?.completionNote || '');
        }
      } catch (caught: any) {
        if (!cancelled) setError(caught?.message || 'The execution brief could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (requestId) void load();
    return () => { cancelled = true; };
  }, [requestId]);

  const markReady = async () => {
    setProcessing(true);
    setError('');
    try {
      const mark = httpsCallable(functions, 'markDesignExecutionReady');
      await mark({ designRequestId: requestId, completionNote: note });
      const getBrief = httpsCallable<{ designRequestId: string }, BriefResponse>(functions, 'getDesignExecutionBrief');
      const result = await getBrief({ designRequestId: requestId });
      setBrief(result.data);
    } catch (caught: any) {
      setError(caught?.message || 'The design could not be marked ready for handover.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <CircularProgress aria-label={tx('tech.design.loadingBrief', 'Loading design brief')} />;
  if (!brief) return <Alert severity="error">{error || tx('tech.design.briefUnavailable', 'This design brief is not available.')}</Alert>;

  return (
    <Stack spacing={2} data-testid="technician-design-brief" sx={{ direction: isRTL ? 'rtl' : 'ltr', px: { xs: 0, sm: 1 } }}>
      <Typography variant="h5" fontWeight={950}>{brief.propertyName || tx('tech.design.request', 'Design request')}</Typography>
      <Typography variant="body2">{designStatusLabel(brief.status, lang)} · {brief.requestId}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <DesignExecutionBriefView
        tone="light"
        brief={brief.executionBrief}
        chosenImageUrl={brief.chosenImageUrl}
        referenceImageUrl={brief.referenceImageUrl}
      />
      {brief.status === 'ENGINEER_REVIEW' && (
        <Stack spacing={1.5} direction={{ xs: 'column', sm: 'column' }}>
          <TextField label={tx('tech.design.completionNote', 'Completion note for tenant and owner')} value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} multiline minRows={2} fullWidth />
          <Button variant="contained" onClick={() => void markReady()} disabled={processing} sx={{ fontWeight: 900, width: { xs: '100%', sm: 'auto' } }}>
            {processing ? tx('tech.design.saving', 'Saving…') : tx('tech.design.markReady', 'Mark work ready for handover')}
          </Button>
        </Stack>
      )}
      {brief.status === 'EXECUTION_READY' && (
        <Alert severity="success">{tx('tech.design.ready', 'Work is done and ready for handover. Tenant and owner have the update.')}{brief.completionNote ? ` ${brief.completionNote}` : ''}</Alert>
      )}
    </Stack>
  );
}
