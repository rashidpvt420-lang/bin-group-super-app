import React from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import SafeIcon from '../components/SafeIcon';

const ADMIN_PANEL_URL = 'https://bin-group-admin-panel.web.app';

function resolveAdminTarget() {
  if (typeof window === 'undefined') return `${ADMIN_PANEL_URL}/dashboard`;
  const sourcePath = window.location.pathname.replace(/^\/admin(?=\/|$)/, '') || '/dashboard';
  const canonicalPath = sourcePath === '/' ? '/dashboard' : sourcePath;
  return `${ADMIN_PANEL_URL}${canonicalPath}${window.location.search}${window.location.hash}`;
}

export default function AdminTerminal() {
  const { isRTL, lang, tx } = useLanguage();
  const targetUrl = React.useMemo(resolveAdminTarget, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => window.location.replace(targetUrl), 700);
    return () => window.clearTimeout(timer);
  }, [targetUrl]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#020617',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        p: 3,
        direction: isRTL ? 'rtl' : 'ltr',
        backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(201,166,70,0.18), transparent 45%)',
      }}
    >
      <Stack
        spacing={3}
        alignItems="center"
        sx={{
          width: '100%',
          maxWidth: 680,
          p: { xs: 3, md: 5 },
          borderRadius: 5,
          bgcolor: 'rgba(15,23,42,0.94)',
          border: '1px solid rgba(201,166,70,0.32)',
          textAlign: 'center',
          boxShadow: '0 30px 80px rgba(0,0,0,0.38)',
        }}
      >
        <Box sx={{ width: 58, height: 58, borderRadius: 4, bgcolor: '#C9A646', color: '#111827', display: 'grid', placeItems: 'center' }}>
          <SafeIcon icon={ShieldCheck} size={28} />
        </Box>
        <Typography variant="overline" sx={{ color: '#E5C86B', fontWeight: 950, letterSpacing: 4 }}>
          BIN GROUP ADMIN
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 950 }}>
          {tx('admin.bridge.title', 'Opening the canonical Admin Panel')}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.8 }}>
          {lang === 'ar'
            ? 'تم توحيد لوحة الإدارة في تطبيق واحد. يتم فتح جميع ميزات الملاك والمستأجرين والفنيين والمدفوعات والعقود والتقارير والتدقيق من نطاق الإدارة المخصص.'
            : 'Admin operations are consolidated into one application. Owners, tenants, technicians, payments, contracts, reports, launch controls, and audit tools now run from the dedicated Admin Panel.'}
        </Typography>
        <CircularProgress size={28} sx={{ color: '#C9A646' }} />
        <Button
          variant="contained"
          href={targetUrl}
          endIcon={<SafeIcon icon={ExternalLink} size={17} />}
          sx={{ bgcolor: '#C9A646', color: '#111827', fontWeight: 950, px: 4, '&:hover': { bgcolor: '#E5C86B' } }}
        >
          {lang === 'ar' ? 'فتح لوحة الإدارة' : 'Open Admin Panel'}
        </Button>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', overflowWrap: 'anywhere' }}>
          {targetUrl}
        </Typography>
      </Stack>
    </Box>
  );
}
