import React from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import SafeIcon from './SafeIcon';

type PortalConnectionStripProps = {
  dark?: boolean;
};

export default function PortalConnectionStrip({ dark = false }: PortalConnectionStripProps) {
  const { lang } = useLanguage();
  const [online, setOnline] = React.useState(() => navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const copy = lang === 'ar'
    ? {
        online: 'الاتصال متاح',
        onlineDetail: 'يتم تحديث كل قسم من مصدره المباشر. تحقق من وقت التحديث داخل القسم قبل اتخاذ قرار.',
        offline: 'أنت تعمل دون اتصال',
        offlineDetail: 'قد تظهر بيانات محفوظة مؤقتاً. لا تعتبر الصور أو الإجراءات مرسلة حتى يعود الاتصال وتظهر حالة نجاح.',
        retry: 'إعادة المحاولة',
      }
    : {
        online: 'Connection available',
        onlineDetail: 'Each module refreshes from its live source. Check its update time before making a decision.',
        offline: 'You are working offline',
        offlineDetail: 'Cached data may be shown. Photos and actions are not sent until connectivity returns and success is confirmed.',
        retry: 'Retry',
      };

  return (
    <Alert
      severity={online ? 'info' : 'warning'}
      icon={<SafeIcon icon={online ? Cloud : CloudOff} size={19} />}
      sx={{
        mb: 3,
        borderRadius: 3,
        border: `1px solid ${online ? 'rgba(59,130,246,0.24)' : 'rgba(245,158,11,0.34)'}`,
        bgcolor: dark ? 'rgba(15,23,42,0.82)' : online ? '#F8FBFF' : '#FFFBEB',
        color: dark ? '#FFFFFF' : '#111827',
        alignItems: 'center',
        '& .MuiAlert-message': { width: '100%' },
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
        <Box>
          <Typography sx={{ fontWeight: 950, fontSize: '0.84rem' }}>{online ? copy.online : copy.offline}</Typography>
          <Typography variant="caption" sx={{ color: dark ? 'rgba(255,255,255,0.68)' : '#667085', lineHeight: 1.45 }}>
            {online ? copy.onlineDetail : copy.offlineDetail}
          </Typography>
        </Box>
        {!online && (
          <Button size="small" onClick={() => window.location.reload()} startIcon={<SafeIcon icon={RefreshCw} size={15} />} sx={{ flexShrink: 0, fontWeight: 900 }}>
            {copy.retry}
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
