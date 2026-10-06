import { Box, Button, Container, Stack, Typography, alpha } from '@mui/material';
import { Home, Search } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

/**
 * Real Not Found UI for unknown SPA paths.
 * Firebase Hosting still serves index.html (HTTP 200) for unknown URLs;
 * this page stops silently rewriting unknown paths to the home page.
 */
export default function NotFoundPage() {
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const gold = binThemeTokens.gold;

  return (
    <Box
      component="main"
      dir={isRTL ? 'rtl' : 'ltr'}
      sx={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        bgcolor: '#FFFFFF',
        color: '#111827',
        py: 8,
      }}
    >
      <Container maxWidth="sm" sx={{ my: 'auto' }}>
        <Stack spacing={3} textAlign="center" sx={{ '& > *': { mx: 'auto' } }}>
          <Typography component="h1" variant="h2" fontWeight={950} sx={{ letterSpacing: -1 }}>
            {ar ? 'الصفحة غير موجودة' : 'Page not found'}
          </Typography>
          <Typography sx={{ color: '#667085', fontWeight: 700, lineHeight: 1.8, maxWidth: 520 }}>
            {ar
              ? 'رابط هذه الصفحة غير موجود أو تم نقله. يمكنك العودة للرئيسية أو البحث عن منزل.'
              : 'This page does not exist or was moved. Go back home, or search verified homes.'}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button
              component={RouterLink}
              to="/"
              variant="contained"
              startIcon={<Home size={18} />}
              sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, textTransform: 'none' }}
            >
              {ar ? 'العودة للرئيسية' : 'Back to home'}
            </Button>
            <Button
              component={RouterLink}
              to="/homes"
              variant="outlined"
              startIcon={<Search size={18} />}
              sx={{
                borderColor: alpha(gold, 0.5),
                color: gold,
                fontWeight: 950,
                textTransform: 'none',
                '&:hover': { bgcolor: alpha(gold, 0.05) },
              }}
            >
              {ar ? 'البحث عن منزل' : 'Find a home'}
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
