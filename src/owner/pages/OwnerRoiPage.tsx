import {
  Alert, Box, Button, Chip, CircularProgress, Grid, LinearProgress,
  Paper, Stack, Tooltip, Typography, alpha,
} from '@mui/material';
import { BarChart2, Building2, Calendar, Info, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { downloadCsv } from '../../utils/downloadCsv';
import { resolveOwnerFinancialTruth } from '../../utils/propertyIntelligenceEngine';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useOwnerFinancialTruthData } from '../hooks/useOwnerFinancialTruthData';

const fmtAed = (value: number) =>
  `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

const fmtPercent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;

export default function OwnerRoiPage() {
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const navigate = useNavigate();
  const { passports, properties, summary, loading, error: loadError } = useOwnerFinancialTruthData(user);
  const truth = resolveOwnerFinancialTruth(properties);

  if (loading) {
    return (
      <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <CircularProgress sx={{ color: binThemeTokens.goldHover }} />
        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>
          {tx('owner.roi.loading', 'Calculating recorded portfolio performance...')}
        </Typography>
      </Box>
    );
  }

  if (loadError) return <Alert severity="error">{loadError}</Alert>;

  const totalOutstanding = passports.reduce((sum, passport) => sum + Number(passport.rentOutstandingTotal || 0), 0);
  const collectionRate = summary.totalRevenue + totalOutstanding > 0
    ? (summary.totalRevenue / (summary.totalRevenue + totalOutstanding)) * 100
    : null;

  const MetricCard = ({
    label,
    value,
    color,
    progress,
    sub,
    tooltip,
  }: {
    label: string;
    value: string;
    color: string;
    progress?: number | null;
    sub: string;
    tooltip: string;
  }) => (
    <Paper sx={{ p: 3, bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, borderRadius: 6, height: '100%' }}>
      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1.5 }}>{label}</Typography>
        <Tooltip title={tooltip}>
          <Info size={15} color={binThemeTokens.textSecondary} />
        </Tooltip>
      </Stack>
      <Typography variant="h4" fontWeight={950} sx={{ color, mb: 1 }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{sub}</Typography>
      {progress !== undefined && progress !== null && (
        <Box sx={{ mt: 2.5 }}>
          <LinearProgress
            variant="determinate"
            value={Math.max(0, Math.min(progress, 100))}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: binThemeTokens.softCanvas,
              '& .MuiLinearProgress-bar': { background: color },
            }}
          />
        </Box>
      )}
    </Paper>
  );

  return (
    <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 5, display: 'flex', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, justifyContent: 'space-between', gap: 2, alignItems: { md: 'flex-end' } }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 900, letterSpacing: 3 }}>
            {tx('owner.roi.overline', 'PORTFOLIO PERFORMANCE')}
          </Typography>
          <Typography variant="h4" fontWeight={950} sx={{ color: binThemeTokens.textPrimary, mt: 1 }}>
            {tx('owner.roi.title', 'ROI & Yield Analytics')}
          </Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, maxWidth: 820 }}>
            {tx('owner.roi.subtitle', 'Yield is shown only when a recorded property-value basis exists. Collection performance is kept separate from investment return.')}
          </Typography>
        </Box>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} flexWrap="wrap" useFlexGap>
          <Chip icon={<Calendar size={16} />} label={tx('owner.roi.period', 'All recorded financials')} variant="outlined" />
          <Button
            variant="contained"
            disabled={!passports.length}
            onClick={() => downloadCsv(
              'bin-roi-by-property.csv',
              ['Property', 'Rent collected (AED)', 'Rent outstanding (AED)', 'Maintenance cost (AED)', 'Collection rate (%)'],
              passports.map((passport: any) => {
                const collected = Number(passport.rentCollectedTotal || 0);
                const outstanding = Number(passport.rentOutstandingTotal || 0);
                const rate = collected + outstanding > 0 ? (collected / (collected + outstanding)) * 100 : 0;
                return [passport.propertyName || passport.id, collected, outstanding, passport.maintenanceCostTotal || 0, rate.toFixed(2)];
              }),
            )}
            sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 900 }}
          >
            {tx('owner.roi.export', 'Export CSV')}
          </Button>
        </Stack>
      </Box>

      {passports.length === 0 && properties.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center', bgcolor: '#FFFFFF', border: `1px dashed ${binThemeTokens.border}`, borderRadius: 6 }}>
          <BarChart2 size={46} color="#D1D5DB" style={{ margin: '0 auto 14px' }} />
          <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>
            {tx('owner.roi.empty', 'No recorded portfolio performance data is available yet.')}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <MetricCard
              label={tx('owner.roi.gross_yield', 'Gross Yield')}
              value={fmtPercent(truth.grossYield.value)}
              color={binThemeTokens.goldHover}
              progress={truth.grossYield.value}
              sub={truth.grossYield.basis}
              tooltip={`${truth.grossYield.status}: ${truth.grossYield.basis}`}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <MetricCard
              label={tx('owner.roi.net_yield', 'Net Yield / ROI Basis')}
              value={fmtPercent(truth.netYield.value)}
              color="#10b981"
              progress={truth.netYield.value}
              sub={truth.netYield.basis}
              tooltip={`${truth.netYield.status}: ${truth.netYield.basis}`}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <MetricCard
              label={tx('owner.roi.collection_rate', 'Rent Collection Rate')}
              value={fmtPercent(collectionRate)}
              color="#3b82f6"
              progress={collectionRate}
              sub={tx('owner.roi.collection_basis', 'Collected rent divided by collected + outstanding rent')}
              tooltip={tx('owner.roi.collection_tooltip', 'Operational collection performance, not investment yield.')}
            />
          </Grid>

          {[
            [tx('owner.roi.net_income', 'Net Owner Income'), fmtAed(summary.netPayout), summary.netPayout >= 0 ? '#10b981' : '#ef4444'],
            [tx('owner.roi.management_fees', 'Recorded Management Fees'), `-${fmtAed(summary.managementFees)}`, '#ef4444'],
            [tx('owner.roi.maintenance', 'Maintenance Deductions'), `-${fmtAed(summary.maintenanceDeductions)}`, '#f59e0b'],
            [tx('owner.roi.outstanding', 'Outstanding Rent'), fmtAed(totalOutstanding), '#ef4444'],
          ].map(([label, value, color]) => (
            <Grid item xs={12} sm={6} md={3} key={String(label)}>
              <Paper sx={{ p: 3, bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, borderRadius: 4 }}>
                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1 }}>{label}</Typography>
                <Typography variant="h6" fontWeight={950} sx={{ color }}>{value}</Typography>
              </Paper>
            </Grid>
          ))}

          <Grid item xs={12}>
            <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 2, mt: 2 }}>
              {tx('owner.roi.asset_performance', 'ASSET COLLECTION PERFORMANCE')}
            </Typography>
            <Stack spacing={2}>
              {passports.map((passport: any) => {
                const collected = Number(passport.rentCollectedTotal || 0);
                const outstanding = Number(passport.rentOutstandingTotal || 0);
                const rate = collected + outstanding > 0 ? (collected / (collected + outstanding)) * 100 : 0;
                return (
                  <Paper key={passport.id} sx={{ p: 3, bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, borderRadius: 5 }}>
                    <Grid container spacing={3} alignItems="center">
                      <Grid item xs={12} md={4}>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                          <Box sx={{ width: 46, height: 46, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, display: 'grid', placeItems: 'center', color: binThemeTokens.goldHover }}>
                            <Building2 size={22} />
                          </Box>
                          <Box>
                            <Typography fontWeight={950} sx={{ color: binThemeTokens.textPrimary }}>{passport.propertyName || passport.id}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>
                              {passport.occupiedUnits || 0} / {passport.totalUnits || 0} {tx('owner.roi.units_occupied', 'units occupied')}
                            </Typography>
                          </Box>
                        </Stack>
                      </Grid>
                      <Grid item xs={12} md={5}>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" sx={{ mb: 1 }}>
                          <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{tx('owner.roi.collection_rate', 'COLLECTION RATE')}</Typography>
                          <Typography variant="caption" sx={{ color: binThemeTokens.goldHover, fontWeight: 950 }}>{rate.toFixed(1)}%</Typography>
                        </Stack>
                        <LinearProgress variant="determinate" value={Math.min(rate, 100)} sx={{ height: 6, borderRadius: 3, bgcolor: binThemeTokens.softCanvas, '& .MuiLinearProgress-bar': { background: binThemeTokens.goldHover } }} />
                      </Grid>
                      <Grid item xs={12} md={3} sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                        <Typography fontWeight={950} sx={{ color: '#10b981' }}>{fmtAed(collected)}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{tx('owner.roi.period_revenue', 'RECORDED RENT')}</Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                );
              })}
            </Stack>
          </Grid>
        </Grid>
      )}

      <Paper sx={{ p: 4, mt: 5, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="flex-start">
          <Shield size={18} color={binThemeTokens.goldHover} />
          <Box sx={{ flex: 1 }}>
            <Typography fontWeight={950} sx={{ color: binThemeTokens.textPrimary }}>
              {tx('owner.roi.truth_title', 'Financial truth basis')}
            </Typography>
            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5 }}>
              {tx('owner.roi.truth_body', 'Net payable uses the same recorded Owner Financial Truth as the dashboard and Financials page. Gross/net yield is withheld when no property-value basis is recorded; collection rate is never presented as investment yield.')}
            </Typography>
          </Box>
          <Button onClick={() => navigate('/owner/complaint')} sx={{ color: binThemeTokens.goldHover, fontWeight: 900 }}>
            {tx('owner.roi.review', 'Request review')}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
