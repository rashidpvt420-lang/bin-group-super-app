import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography } from '@mui/material';
import { Camera, FileText, LogIn, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

// Public explainer for the signed-in Design Studio (audit 2026-10-21 P1-4).
// The studio itself stays behind sign-in at /design-studio.
const copy = {
  en: {
    chip: 'AI DESIGN STUDIO',
    title: 'See your room redesigned before you spend.',
    desc: 'Upload a photo of a room, describe what you want, and BIN GROUP AI returns a redesigned concept image with an estimated cost.',
    steps: [
      ['Upload a photo', 'One clear photo of the room or space you want to change.'],
      ['Describe the scope', 'Area size, finish level, any MEP or structural work, and your furniture budget.'],
      ['Get a concept and an estimate', 'An AI concept image plus a cost estimate from BIN GROUP price list rates.'],
    ],
    note: 'The cost is an estimate from BIN GROUP price list rates, not a supplier quotation. The final price is confirmed after a site visit.',
    cta: 'Sign in to open Design Studio',
    start: 'New owner? Start property details',
  },
  ar: {
    chip: 'استوديو التصميم بالذكاء الاصطناعي',
    title: 'شاهد غرفتك بتصميم جديد قبل أن تنفق.',
    desc: 'ارفع صورة للغرفة واكتب ما تريد، ليعيد لك ذكاء مجموعة بن تصميمًا مقترحًا مع تكلفة تقديرية.',
    steps: [
      ['ارفع صورة', 'صورة واضحة واحدة للغرفة أو المساحة التي تريد تغييرها.'],
      ['صف نطاق العمل', 'المساحة، مستوى التشطيب، أي أعمال كهروميكانيكية أو إنشائية، وميزانية الأثاث.'],
      ['استلم التصميم والتقدير', 'صورة تصميم مقترح وتكلفة تقديرية حسب قائمة أسعار مجموعة بن.'],
    ],
    note: 'التكلفة تقديرية حسب قائمة أسعار مجموعة بن وليست عرض سعر من المورد. يتم تأكيد السعر النهائي بعد زيارة الموقع.',
    cta: 'سجّل الدخول لفتح استوديو التصميم',
    start: 'مالك جديد؟ ابدأ بيانات العقار',
  },
};

const icons = [<Camera key="c" size={22} />, <FileText key="f" size={22} />, <Sparkles key="s" size={22} />];

export default function PublicAIDesignStudioPage() {
  const { lang, isRTL } = useLanguage();
  const c = lang === 'ar' ? copy.ar : copy.en;
  return (
    <Box component="main" sx={{ minHeight: '100vh', bgcolor: binThemeTokens.canvas, direction: isRTL ? 'rtl' : 'ltr', py: { xs: 6, md: 10 } }}>
      <Container maxWidth="lg">
        <Chip label={c.chip} sx={{ mb: 3, bgcolor: 'rgba(201,166,70,.12)', color: binThemeTokens.goldText, fontWeight: 950 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: 36, md: 60 }, fontWeight: 950, color: binThemeTokens.textPrimary, mb: 2 }}>{c.title}</Typography>
        <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, maxWidth: 820, mb: 5 }}>{c.desc}</Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {c.steps.map(([t, b], i) => (
            <Grid item xs={12} md={4} key={t}>
              <Paper variant="outlined" sx={{ p: 3, height: '100%', borderRadius: 2 }}>
                <Box sx={{ color: binThemeTokens.goldText, mb: 1 }}>{icons[i]}</Box>
                <Typography variant="h6" component="h2" fontWeight={950} sx={{ color: binThemeTokens.textPrimary }}>{t}</Typography>
                <Typography sx={{ color: binThemeTokens.textSecondary }}>{b}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
        <Typography data-testid="ai-design-estimate-note" sx={{ color: binThemeTokens.textPrimary, fontWeight: 800, mb: 4 }}>{c.note}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Button variant="contained" href="/login?returnTo=/design-studio" startIcon={<LogIn size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>{c.cta}</Button>
          <Button variant="outlined" href="/onboarding" sx={{ color: binThemeTokens.textPrimary, borderColor: binThemeTokens.gold, fontWeight: 950 }}>{c.start}</Button>
        </Stack>
      </Container>
    </Box>
  );
}
