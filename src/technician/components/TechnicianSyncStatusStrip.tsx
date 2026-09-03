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
        clear: 'تمت مزامنة إجراءات وصور الفني المسجلة على هذا الجهاز.',
        pending: `${actionCount} إجراء و ${evidenceCount} صورة بانتظار المزامنة.`,
        offline: 'أنت دون اتصال. يتم حفظ الدليل المدعوم محلياً، ولا يعتبر مُرسلاً حتى تؤكد الخوادم المزامنة.',
        completion: 'لا يتم اعتماد إكمال المهمة تلقائياً من قائمة الانتظار. يجب تأكيد الإكمال بعد ظهور الدليل المتزامن.',
        open: 'فتح قائمة المزامنة',
      }
    : {
        clear: 'Technician actions and photo evidence recorded on this device are synchronized.',
        pending: `${actionCount} action${actionCount === 1 ? '' : 's'} and ${evidenceCount} photo${evidenceCount === 1 ? '' : 's'} are waiting to sync.`,
        offline: 'You are offline. Supported evidence is saved on this device and is not treated as sent until server synchronization succeeds.',
        completion: 'Mission completion is never auto-confirmed from the queue. Complete the mission only after synchronized evidence appears on the server-backed job.',
        open: 'Open sync queue',
      };

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
            <Typography sx={{ fontWeight: 950 }}>{total > 0 ? copy.pending : copy.clear}</Typography>
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
