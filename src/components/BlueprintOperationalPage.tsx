import React from 'react';
import { Box, Grid, Paper, Stack, Typography, Chip, alpha } from '@mui/material';
import { CheckCircle2, Circle, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import SafeIcon from './SafeIcon';

type BlueprintItem = {
  title: string;
  description: string;
  status?: 'ready' | 'configured' | 'pending';
};

type BlueprintOperationalPageProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  items: BlueprintItem[];
  dark?: boolean;
};

const statusLabel = (status: BlueprintItem['status']) => {
  if (status === 'ready') return 'READY';
  if (status === 'configured') return 'CONFIGURED';
  return 'WAITING FOR DATA';
};

const statusColor = (status: BlueprintItem['status']) => {
  if (status === 'ready') return '#10B981';
  if (status === 'configured') return binThemeTokens.gold;
  return '#94A3B8';
};

export default function BlueprintOperationalPage({ eyebrow, title, subtitle, items, dark = false }: BlueprintOperationalPageProps) {
  const { isRTL } = useLanguage();
  const bg = dark ? 'rgba(15,23,42,0.72)' : '#FFFFFF';
  const text = dark ? '#FFFFFF' : binThemeTokens.textPrimary;
  const muted = dark ? 'rgba(255,255,255,0.62)' : binThemeTokens.textSecondary;
  const border = dark ? 'rgba(255,255,255,0.08)' : binThemeTokens.border;

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', textAlign: isRTL ? 'right' : 'left' }}>
      <Stack spacing={1.25} sx={{ mb: 4 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
          {eyebrow}
        </Typography>
        <Typography variant="h4" sx={{ color: text, fontWeight: 950, letterSpacing: -0.8 }}>
          {title}
        </Typography>
        <Typography sx={{ color: muted, fontWeight: 700, maxWidth: 840, lineHeight: 1.7 }}>
          {subtitle}
        </Typography>
      </Stack>

      <Grid container spacing={2.5}>
        {items.map((item) => {
          const color = statusColor(item.status);
          return (
            <Grid item xs={12} md={6} key={item.title}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  height: '100%',
                  bgcolor: bg,
                  border: `1px solid ${border}`,
                  borderRadius: 4,
                  boxShadow: dark ? 'none' : '0 12px 34px rgba(17,24,39,0.06)',
                }}
              >
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="flex-start">
                  <Box sx={{ mt: 0.3, color }}>
                    <SafeIcon icon={item.status === 'ready' ? CheckCircle2 : item.status === 'configured' ? ShieldCheck : Circle} size={20} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1, gap: 1 }}>
                      <Typography sx={{ color: text, fontWeight: 950 }}>{item.title}</Typography>
                      <Chip
                        size="small"
                        label={statusLabel(item.status)}
                        sx={{ bgcolor: alpha(color, 0.12), color, border: `1px solid ${alpha(color, 0.25)}`, fontWeight: 950, fontSize: '0.62rem' }}
                      />
                    </Stack>
                    <Typography variant="body2" sx={{ color: muted, fontWeight: 650, lineHeight: 1.65 }}>
                      {item.description}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
