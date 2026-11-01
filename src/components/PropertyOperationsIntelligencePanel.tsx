import React, { useMemo } from 'react';
import { Alert, Box, Button, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowRight, Activity, Building2, ClipboardCheck, FileCheck2, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { buildPropertyOperationsSummary, type IntelligenceRow } from '../utils/propertyOperationsIntelligence';

type Props = {
  properties: IntelligenceRow[];
  passports: IntelligenceRow[];
  tickets: IntelligenceRow[];
  invoices: IntelligenceRow[];
  sourceErrors?: string[];
};

const money = (value: number) => value.toLocaleString('en-AE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function PropertyOperationsIntelligencePanel({
  properties,
  passports,
  tickets,
  invoices,
  sourceErrors = [],
}: Props) {
  const navigate = useNavigate();
  const { isRTL, tx } = useLanguage();
  const summary = useMemo(
    () => buildPropertyOperationsSummary({ properties, passports, tickets, invoices }),
    [properties, passports, tickets, invoices],
  );
  const metrics = [
    {
      label: tx('ops.properties', 'PROPERTIES IN SCOPE'),
      value: String(summary.propertyCount),
      detail: tx('ops.properties_detail', 'Owner-linked property records'),
      icon: Building2,
    },
    {
      label: tx('ops.health', 'RECORD-BASED PORTFOLIO HEALTH'),
      value: summary.portfolioHealthScore === null ? '—' : `${summary.portfolioHealthScore}/100`,
      detail: summary.portfolioHealthReasons.slice(0, 2).join(' · '),
      icon: Activity,
    },
    {
      label: tx('ops.passports', 'PROPERTY PASSPORTS'),
      value: `${summary.passportCoveredProperties}/${summary.propertyCount}`,
      detail: summary.missingPassportProperties
        ? `${summary.missingPassportProperties} ${tx('ops.passports_missing', 'property record(s) need a passport')}`
        : tx('ops.passports_detail', 'Passport coverage from owner-linked records'),
      icon: FileCheck2,
    },
    {
      label: tx('ops.assets', 'REGISTERED ASSETS'),
      value: String(summary.registeredAssets),
      detail: tx('ops.assets_detail', 'Assets recorded in property/passport lists'),
      icon: ClipboardCheck,
    },
    {
      label: tx('ops.open_jobs', 'OPEN WORK ORDERS'),
      value: String(summary.openWorkOrders),
      detail: summary.urgentOpenWorkOrders
        ? `${summary.urgentOpenWorkOrders} ${tx('ops.urgent', 'urgent / critical')}`
        : tx('ops.open_detail', 'Owner-linked jobs not yet closed'),
      icon: Activity,
    },
    {
      label: tx('ops.completed_jobs', 'COMPLETED WORK ORDERS'),
      value: String(summary.completedWorkOrders),
      detail: tx('ops.completed_detail', 'Closed or resolved work history'),
      icon: ClipboardCheck,
    },
    {
      label: tx('ops.paid_invoices', 'PAID / VERIFIED INVOICES'),
      value: `AED ${money(summary.verifiedPaidInvoiceAed)}`,
      detail: `${summary.verifiedPaidInvoiceCount} ${tx('ops.invoice_count', 'verified invoice record(s)')}`,
      icon: Wallet,
    },
    {
      label: tx('ops.actions', 'OUTSTANDING ACTIONS'),
      value: String(summary.outstandingActionCount),
      detail: tx('ops.actions_detail', 'Open jobs, missing passports and unlinked work orders'),
      icon: Activity,
    },
    {
      label: tx('ops.unlinked', 'UNLINKED WORK ORDERS'),
      value: String(summary.unlinkedWorkOrders),
      detail: tx('ops.unlinked_detail', 'Owner work orders that do not match a property ID'),
      icon: ClipboardCheck,
    },
  ];

  return (
    <Paper
      data-testid="property-operations-intelligence"
      sx={{ p: { xs: 2.5, md: 3.5 }, mb: 4, bgcolor: 'rgba(15, 23, 42, 0.52)', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: 4 }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 2.5, direction: isRTL ? 'rtl' : 'ltr' }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2.2 }}>
            BIN GROUP PROPERTY OPERATIONS INTELLIGENCE
          </Typography>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>
            {tx('ops.title', 'One operational picture for every property')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'rgba(255,255,255,.58)', maxWidth: 760 }}>
            {tx('ops.subtitle', 'Maintenance history, asset records, owner-linked invoices and actions that still need attention. Figures come from the records currently available to this Owner account.')}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          onClick={() => navigate('/owner/tickets')}
          endIcon={<ArrowRight size={16} />}
          sx={{ borderColor: alpha(binThemeTokens.gold, 0.5), color: binThemeTokens.gold, fontWeight: 900, flexShrink: 0 }}
        >
          {tx('ops.open_work', 'OPEN WORK ORDERS')}
        </Button>
      </Stack>

      {sourceErrors.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {tx('ops.partial', 'Some data sources are unavailable. Counts and totals below are partial, not confirmed zero values:')} {sourceErrors.join(' ')}
        </Alert>
      )}

      <Grid container spacing={1.5}>
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <Grid item xs={12} sm={6} md={4} key={label}>
            <Box sx={{ height: '100%', p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.48)', fontWeight: 900, letterSpacing: 1.2 }}>{label}</Typography>
                  <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: { xs: '1.35rem', md: '1.65rem' }, mt: 0.5, overflowWrap: 'anywhere' }}>{value}</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.48)', display: 'block', mt: 0.4 }}>{detail}</Typography>
                </Box>
                <Icon size={18} color={binThemeTokens.gold} />
              </Stack>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2.5 }}>
        <Button variant="text" onClick={() => navigate('/owner/approvals')} sx={{ color: '#fff', fontWeight: 850 }}>
          {tx('ops.authorize', 'Review authorizations and approvals')}
        </Button>
        <Button variant="text" onClick={() => navigate('/owner/property-passport')} sx={{ color: '#fff', fontWeight: 850 }}>
          {tx('ops.passports', 'Review property passports')}
        </Button>
        <Button variant="text" onClick={() => navigate('/owner/financials')} sx={{ color: '#fff', fontWeight: 850 }}>
          {tx('ops.financials', 'Open financial control centre')}
        </Button>
      </Stack>

      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.38)', display: 'block', mt: 1.5 }}>
        {tx('ops.note', 'Paid / verified invoice value is an invoice-status total, not a cash-flow forecast or a maintenance-cost-only total. Work orders are capped at 250 and invoices at 100 in this live snapshot; use the full ledgers for formal reconciliation. No unavailable records are treated as zero when a source warning is shown.')}
      </Typography>
    </Paper>
  );
}
