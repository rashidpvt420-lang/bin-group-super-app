import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { UiCard } from './ui';
import { ui } from '../theme/uiTokens';

export interface HomeQuickLink { path: string; en: string; ar: string }

/** Labelled Home shortcuts so nothing is only reachable from a hidden "full dashboard". */
export default function HomeQuickLinks({ titleEn, titleAr, links, testId }: { titleEn: string; titleAr: string; links: HomeQuickLink[]; testId: string }) {
  const navigate = useNavigate();
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  return (
    <UiCard testId={testId}>
      <Typography component="h2" sx={{ fontWeight: 800, mb: 1, color: ui.ink }}>{ar ? titleAr : titleEn}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        {links.map((l) => (
          <Button key={`${l.path}-${l.en}`} variant="outlined" onClick={() => navigate(l.path)}
            sx={{ minHeight: ui.touchTarget, color: ui.goldText, borderColor: ui.goldText, fontWeight: 700, justifyContent: isRTL ? 'flex-end' : 'flex-start', textAlign: isRTL ? 'right' : 'left' }}>
            {ar ? l.ar : l.en}
          </Button>
        ))}
      </Box>
    </UiCard>
  );
}
