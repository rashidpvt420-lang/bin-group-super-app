import { Box, Button, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import SafeIcon from './SafeIcon';
import { binThemeTokens } from '../theme/binGroupTheme';

export type CanonicalNextAction = {
  id: string;
  label: string;
  detail: string;
  path: string;
  count?: number | null;
  urgent?: boolean;
};

type Props = {
  actions: CanonicalNextAction[];
  dark?: boolean;
};

export default function CanonicalNextActions({ actions, dark = false }: Props) {
  const navigate = useNavigate();
  const { isRTL, lang } = useLanguage();
  const visibleActions = actions.slice(0, 3);
  const copy = lang === 'ar'
    ? { title: 'الخطوات التالية', subtitle: 'ابدأ بالإجراء الأعلى أولوية، ثم انتقل إلى البقية.', open: 'فتح' }
    : { title: 'Next actions', subtitle: 'Start with the highest-priority action, then work through the rest.', open: 'Open' };
  const ink = dark ? '#FFFFFF' : binThemeTokens.textPrimary;
  const muted = dark ? 'rgba(255,255,255,0.62)' : binThemeTokens.textSecondary;

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 5, bgcolor: dark ? 'rgba(15,23,42,0.94)' : binThemeTokens.card, border: `1px solid ${dark ? 'rgba(201,166,70,0.24)' : binThemeTokens.border}`, boxShadow: dark ? 'none' : binThemeTokens.cardShadow }}>
      <Stack spacing={2.2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Box>
          <Typography variant="h6" sx={{ color: ink, fontWeight: 950 }}>{copy.title}</Typography>
          <Typography variant="body2" sx={{ color: muted, mt: 0.4 }}>{copy.subtitle}</Typography>
        </Box>
        <Stack spacing={1.2}>
          {visibleActions.map((action, index) => (
            <Button
              key={action.id}
              fullWidth
              onClick={() => navigate(action.path)}
              aria-label={`${copy.open}: ${action.label}`}
              sx={{
                p: 1.7,
                minHeight: 72,
                justifyContent: 'space-between',
                textAlign: isRTL ? 'right' : 'left',
                textTransform: 'none',
                color: ink,
                bgcolor: index === 0 ? alpha(action.urgent ? binThemeTokens.danger : binThemeTokens.gold, dark ? 0.17 : 0.10) : dark ? 'rgba(255,255,255,0.035)' : binThemeTokens.softCanvas,
                border: `1px solid ${index === 0 ? alpha(action.urgent ? binThemeTokens.danger : binThemeTokens.gold, 0.38) : dark ? 'rgba(255,255,255,0.08)' : binThemeTokens.border}`,
                borderRadius: 3,
                '&:hover': { bgcolor: alpha(action.urgent ? binThemeTokens.danger : binThemeTokens.gold, dark ? 0.24 : 0.15) },
              }}
            >
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.4} alignItems="center" sx={{ minWidth: 0 }}>
                <Box sx={{ color: action.urgent ? binThemeTokens.danger : binThemeTokens.goldHover, display: 'flex', flexShrink: 0 }}><SafeIcon icon={CircleAlert} size={19} /></Box>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
                    <Typography sx={{ color: ink, fontWeight: 950 }}>{action.label}</Typography>
                    {typeof action.count === 'number' && <Typography variant="caption" sx={{ color: action.urgent ? binThemeTokens.danger : binThemeTokens.goldHover, fontWeight: 950 }}>({action.count})</Typography>}
                  </Stack>
                  <Typography variant="caption" sx={{ color: muted, display: 'block', lineHeight: 1.45 }}>{action.detail}</Typography>
                </Box>
              </Stack>
              <SafeIcon icon={ArrowRight} size={17} style={{ flexShrink: 0, transform: isRTL ? 'rotate(180deg)' : 'none' }} />
            </Button>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
