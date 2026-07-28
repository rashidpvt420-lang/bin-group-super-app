import React from 'react';
import { Alert, Box, Button, Chip, Container, Paper, Stack, Typography } from '@mui/material';
import { ImageOff, MessageCircle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';

const WHATSAPP_URL = 'https://wa.me/971552423233';

export default function DesignStudioPage() {
  const navigate = useNavigate();
  const { role } = useRole();
  const { isRTL, lang } = useLanguage();
  const normalizedRole = String(role || '').toLowerCase();
  const home = normalizedRole === 'tenant' ? '/tenant/dashboard' : '/owner/dashboard';
  const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;

  return (
    <Container maxWidth="md" dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: { xs: 5, md: 9 } }}>
      <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: 4, bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, boxShadow: '0 20px 50px rgba(17,24,39,0.10)' }}>
        <Stack spacing={3} alignItems="flex-start">
          <Box sx={{ width: 58, height: 58, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'rgba(184,147,47,0.10)', color: binThemeTokens.goldHover }}>
            <ImageOff size={30} />
          </Box>

          <Stack spacing={1}>
            <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2.5 }}>
              {copy('LAUNCH SAFETY HOLD', 'إيقاف مؤقت لأمان الإطلاق')}
            </Typography>
            <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, letterSpacing: '-0.04em' }}>
              {copy('AI Design Studio is temporarily unavailable', 'استوديو التصميم بالذكاء الاصطناعي غير متاح مؤقتاً')}
            </Typography>
            <Typography sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.8, maxWidth: 720 }}>
              {copy(
                'The previous browser workflow allowed design pricing, ownership links and render metadata to be submitted from the client. It has been disabled until the replacement server-authoritative workflow and protected image delivery complete production review.',
                'تم تعطيل المسار السابق لأن بيانات التسعير وربط الملكية وبيانات الصور كانت تُرسل من المتصفح. سيعود الاستوديو بعد اكتمال المسار الجديد الخاضع لسلطة الخادم ومراجعة حماية الصور في الإنتاج.',
              )}
            </Typography>
          </Stack>

          <Alert severity="info" icon={<ShieldCheck size={21} />} sx={{ width: '100%' }}>
            {copy(
              'No design request, quote, approval, payment status or generated property image will be created from this page while the safety hold is active.',
              'لن يتم إنشاء أي طلب تصميم أو عرض سعر أو موافقة أو حالة دفع أو صورة عقار مولدة من هذه الصفحة أثناء الإيقاف المؤقت.',
            )}
          </Alert>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: '100%' }}>
            <Button variant="contained" onClick={() => navigate(home)} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, minHeight: 48 }}>
              {copy('Return to dashboard', 'العودة إلى لوحة التحكم')}
            </Button>
            <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noreferrer" variant="outlined" startIcon={<MessageCircle size={18} />} sx={{ borderColor: binThemeTokens.goldHover, color: binThemeTokens.goldHover, fontWeight: 950, minHeight: 48 }}>
              {copy('Request a manual design consultation', 'طلب استشارة تصميم يدوية')}
            </Button>
          </Stack>

          <Chip label={copy('Fail-closed: public AI render submission disabled', 'إيقاف آمن: تم تعطيل إرسال التصاميم العامة')} color="warning" variant="outlined" />
        </Stack>
      </Paper>
    </Container>
  );
}
