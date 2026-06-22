import React from 'react';
import { Box, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { CalendarCheck, Coins, ShieldCheck, TrendingUp, Wrench } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Props = {
  properties: any[];
  financials?: any;
  complaints: any[];
  tickets: number;
  tenantCount: number;
};

const n = (value: unknown) => Number(value || 0);
const unitsOf = (property: any) => n(property?.units || property?.totalUnits || property?.numberOfUnits || property?.unitsCount);

export default function OwnerMoneyRiskDashboardSection({ properties, financials, complaints, tickets, tenantCount }: Props) {
  const units = properties.reduce((sum, property) => sum + unitsOf(property), 0);
  const annualMaintenance = properties.reduce((sum, property) => sum + n(property.maintenanceCostTotal || property.annualMaintenanceCost || property.maintenanceSpend), 0);
  const monthlyMaintenance = Math.round(annualMaintenance / 12);
  const costPerUnit = units ? Math.round(annualMaintenance / units) : 0;
  const serviceIssues = complaints.length;
  const healthScore = Math.max(45, Math.min(96, 92 - tickets * 6 - serviceIssues * 3 + Math.min(8, properties.length)));
  const nextAction = tickets > 0 ? 'Close active maintenance tasks first' : annualMaintenance === 0 ? 'Start asset baseline inspection' : 'Schedule preventive maintenance';

  const cards = [
    { label: 'Monthly maintenance cost', value: monthlyMaintenance ? `AED ${monthlyMaintenance.toLocaleString()}` : 'Baseline pending', icon: <Coins size={20} />, color: binThemeTokens.gold },
    { label: 'Cost per unit', value: costPerUnit ? `AED ${costPerUnit.toLocaleString()}` : '—', icon: <TrendingUp size={20} />, color: '#3b82f6' },
    { label: 'Open maintenance', value: tickets, icon: <Wrench size={20} />, color: tickets ? binThemeTokens.gold : '#10b981' },
    { label: 'Tenant complaints', value: serviceIssues, icon: <Wrench size={20} />, color: serviceIssues ? binThemeTokens.gold : '#10b981' },
    { label: 'Upcoming renewals', value: financials?.upcomingRenewals || financials?.renewalsDue || 0, icon: <CalendarCheck size={20} />, color: '#8b5cf6' },
    { label: 'Net property health', value: `${healthScore}%`, icon: <ShieldCheck size={20} />, color: healthScore >= 80 ? '#10b981' : binThemeTokens.gold },
  ];

  return (
    <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,.58)', border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}`, borderRadius: 6 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>OWNER MONEY & RISK</Typography>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>Asset value protection panel</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.52)', mt: 1 }}>Cost, service, renewal, tenant, and health signals in one owner trust panel.</Typography>
        </Box>
        <Chip label={`NEXT: ${nextAction}`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
      </Stack>
      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid item xs={12} sm={6} md={4} key={card.label}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(255,255,255,0.035)', border: `1px solid ${alpha(card.color, 0.2)}`, borderRadius: 4 }}>
              <Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{card.value}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.42)', fontWeight: 900 }}>{card.label.toUpperCase()}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.46)', mt: 3 }}>Preventive calendar preview: AC service, water tank cleaning, fire-safety inspection, pest control, lift inspection, pump-room check, and roof/drainage review.</Typography>
    </Paper>
  );
}
