import { Box, Chip, Grid, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { BarChart3, CheckCircle2, TrendingUp } from 'lucide-react';
import { PILOT_DOMINATION_METRICS } from '../config/uaeDominationBlueprint';
import { binThemeTokens } from '../theme/binGroupTheme';

type PilotMetricValue = {
  id: string;
  current?: number;
  target?: number;
  unit?: string;
  healthy?: boolean;
};

type PilotMetricsDashboardProps = {
  values?: PilotMetricValue[];
  isRTL?: boolean;
};

export default function PilotMetricsDashboard({ values = [], isRTL = false }: PilotMetricsDashboardProps) {
  const valueMap = new Map(values.map((value) => [value.id, value]));
  const healthyCount = PILOT_DOMINATION_METRICS.filter((metric) => valueMap.get(metric.id)?.healthy === true).length;
  const readinessPct = Math.round((healthyCount / PILOT_DOMINATION_METRICS.length) * 100);

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(binThemeTokens.gold, 0.045), border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
      <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>90-DAY PILOT METRICS</Typography>
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>Market leadership proof board</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 0.5 }}>Use these metrics to prove the UAE No-Call Maintenance model before broad public launch.</Typography>
          </Box>
          <Chip icon={<TrendingUp size={16} />} label={`${readinessPct}% pilot proof healthy`} sx={{ bgcolor: readinessPct >= 80 ? alpha('#10b981', 0.15) : alpha('#f59e0b', 0.15), color: readinessPct >= 80 ? '#6ee7b7' : '#fcd34d', fontWeight: 950 }} />
        </Stack>
        <Grid container spacing={2}>
          {PILOT_DOMINATION_METRICS.map((metric) => {
            const value = valueMap.get(metric.id);
            const progress = typeof value?.current === 'number' && typeof value?.target === 'number' && value.target > 0
              ? Math.max(0, Math.min(100, Math.round((value.current / value.target) * 100)))
              : value?.healthy ? 100 : 0;
            return (
              <Grid item xs={12} md={6} key={metric.id}>
                <Box sx={{ p: 2, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" spacing={2}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center">
                      <Box sx={{ color: value?.healthy ? '#6ee7b7' : binThemeTokens.gold }}>{value?.healthy ? <CheckCircle2 size={18} /> : <BarChart3 size={18} />}</Box>
                      <Typography sx={{ color: '#fff', fontWeight: 950 }}>{metric.label}</Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: value?.healthy ? '#6ee7b7' : 'rgba(255,255,255,0.52)', fontWeight: 950 }}>
                      {typeof value?.current === 'number' ? `${value.current.toLocaleString()}${value.unit || ''}` : 'Not measured'}
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={progress} sx={{ height: 8, mt: 1.5, mb: 1, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: value?.healthy ? '#10b981' : binThemeTokens.gold } }} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)' }}>Target: {metric.target}</Typography>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </Stack>
    </Paper>
  );
}
