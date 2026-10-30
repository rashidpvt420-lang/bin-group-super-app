import { Box } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';

export const MADE_IN_UAE_EN = 'Made in UAE';
export const MADE_IN_UAE_AR = 'صُنع في الإمارات';

/**
 * Small "Made in UAE 🇦🇪" mark rendered once by the App root, so every public,
 * auth, profile (Owner, Tenant, Technician, Broker) and Staff/Admin page shows it.
 * The flag emoji is decorative; the text is the accessible label.
 */
export default function MadeInUaeMark() {
  const { lang, isRTL } = useLanguage();
  const text = lang === 'ar' ? MADE_IN_UAE_AR : MADE_IN_UAE_EN;
  return (
    <Box
      component="footer"
      role="contentinfo"
      aria-label={text}
      data-testid="made-in-uae-mark"
      dir={isRTL ? 'rtl' : 'ltr'}
      lang={lang === 'ar' ? 'ar' : 'en'}
      sx={{
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.75,
        flexWrap: 'wrap', textAlign: 'center',
        px: 2, pt: 1.25, pb: 'calc(10px + env(safe-area-inset-bottom, 0px))',
        mb: { xs: 9, lg: 0 },
        fontSize: '0.75rem', fontWeight: 800, letterSpacing: 0.5,
        color: '#667085', bgcolor: 'transparent',
      }}
    >
      <span>{text}</span>
      <span aria-hidden="true">🇦🇪</span>
    </Box>
  );
}
