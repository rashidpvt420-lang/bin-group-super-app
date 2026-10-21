import React from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { CloudCheck, CloudOff, Images } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import SafeIcon from '../../components/SafeIcon';
import { loadOfflineQueue } from '../utils/offlineQueue';
import {
  getTechnicianEvidenceQueueCount,
  TECHNICIAN_EVIDENCE_QUEUE_EVENT,
} from '../utils/offlineEvidenceQueue';

export default function TechnicianSyncStatusStrip() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [online, setOnline] = React.useState(() => navigator.onLine);
  const [actionCount, setActionCount] = React.useState(() => loadOfflineQueue().length);
  const [evidenceCount, setEvidenceCount] = React.useState(0);

  const refreshCounts = React.useCallback(() => {
    setActionCount(loadOfflineQueue().length);
    void getTechnicianEvidenceQueueCount().then(setEvidenceCount).catch(() => setEvidenceCount(0));
  }, []);

  React.useEffect(() => {
    refreshCounts();
    const handleOnline = () => {
      setOnline(true);
      refreshCounts();
    };
    const handleOffline = () => {
      setOnline(false);
      refreshCounts();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('bin-offline-queue-updated', refreshCounts as EventListener);
    window.addEventListener(TECHNICIAN_EVIDENCE_QUEUE_EVENT, refreshCounts as EventListener);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('bin-offline-queue-updated', refreshCounts as EventListener);
      window.removeEventListener(TECHNICIAN_EVIDENCE_QUEUE_EVENT, refreshCounts as EventListener);
    };
  }, [refreshCounts]);

  const total = actionCount + evidenceCount;
  const copy = lang === 'ar'
    ? {
        clear: 'تم إرسال كل التحديثات.',
        pending: `${actionCount + evidenceCount} تحديث بانتظار الإرسال.`,
        offline: 'أنت غير متصل. نحفظ صورك على هذا الهاتف ونرسلها عند عودة الاتصال.',
        completion: 'أنهِ المهمة فقط بعد ظهور صورك كمُرسلة.',
        open: 'عرض',
      }
    : {
        clear: 'All updates sent.',
        pending: `${actionCount + evidenceCount} update${actionCount + evidenceCount === 1 ? '' : 's'} waiting to send. They'll send when you're online.`,
        offline: "You're offline. Photos are saved on this phone and sent when you're back online.",
        // Queued items never complete a job on their own: the server copy is the only truth.
        completion: 'Finish the job only after your photos show as sent.',
        open: 'View',
      };

  // Redesign R3: no banner when everything is sent; show it only when something is waiting or offline.
  if (online && total === 0) return null;

  return (
    <Alert
      data-testid="technician-sync-status-strip"
      data-unsent-actions={actionCount}
      data-unsent-evidence={evidenceCount}
      severity={!online || total > 0 ? 'warning' : 'success'}
      icon={<SafeIcon icon={!online || total > 0 ? CloudOff : CloudCheck} size={19} />}
      sx={{ mb: 2.5, borderRadius: 3, alignItems: 'center', '& .MuiAlert-message': { width: '100%' } }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <SafeIcon icon={Images} size={16} />
            <Typography sx={{ fontWeight: 800 }}>{total > 0 ? copy.pending : copy.clear}</Typography>
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            {!online ? copy.offline : copy.completion}
          </Typography>
        </Box>
        <Button size="small" onClick={() => navigate('/technician/offline')} sx={{ flexShrink: 0, fontWeight: 900 }}>
          {copy.open}
        </Button>
      </Stack>
    </Alert>
  );
}
