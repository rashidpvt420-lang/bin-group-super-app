import React, { useState } from 'react';
import { Alert, Box, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, TextField, Typography, alpha, Chip, Button } from '@mui/material';
import { TrendingUp, Landmark, FileText, AlertCircle, Wrench, Shield, CheckCircle2 } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';
import type { OwnerFinancialState } from '../utils/ownerFinancialResolver';

interface OwnerRoiFinancialSectionProps {
  financials: OwnerFinancialState;
  properties: any[];
  onSaveRentIncome: (propertyId: string, propertyName: string, annualRent: number) => Promise<void>;
}

const propertyIdOf = (property: any) => String(property?.id || property?.propertyId || '');
const propertyNameOf = (property: any) => String(property?.propertyName || property?.name || propertyIdOf(property) || 'Property');

const cardSx = {
  bgcolor: 'rgba(22,22,24,0.72)',
  border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`,
  borderRadius: 4,
  minWidth: 0,
  overflow: 'hidden',
};

const metricBoxSx = {
  p: 2.5,
  bgcolor: 'rgba(255,255,255,0.025)',
  borderRadius: 3,
  border: '1px solid rgba(255,255,255,0.06)',
  minWidth: 0,
  height: '100%',
};

const textSafeSx = {
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

function formatCurrency(amount: number) {
  if (amount === 0) return 'AED 0';
  return `AED ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function OwnerRoiFinancialSection({ financials, properties, onSaveRentIncome }: OwnerRoiFinancialSectionProps) {
  const { t, isRTL } = useLanguage();
  const pmEnabled = financials.contractMode === 'PROPERTY_MANAGEMENT_ONLY' || financials.contractMode === 'HYBRID';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [annualRentInput, setAnnualRentInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const openRentDialog = () => {
    setSelectedPropertyId(propertyIdOf(properties[0]));
    setAnnualRentInput('');
    setSaveError('');
    setDialogOpen(true);
  };

  const selectedProperty = properties.find((property) => propertyIdOf(property) === selectedPropertyId);
  const annualRentValue = Number(annualRentInput);
  const isRentFormValid = !!selectedPropertyId && annualRentValue > 0;

  const handleSaveRentIncome = async () => {
    if (!isRentFormValid) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSaveRentIncome(selectedPropertyId, propertyNameOf(selectedProperty), annualRentValue);
      setDialogOpen(false);
    } catch (error: any) {
      setSaveError(error?.message || 'Could not save rent income. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderMetric = (label: string, value: React.ReactNode, icon?: React.ReactNode, color = '#fff') => (
    <Grid item xs={12} sm={6} md={3}>
      <Box sx={metricBoxSx}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          {icon && <Box sx={{ color: 'rgba(255,255,255,0.5)' }}>{icon}</Box>}
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, ...textSafeSx }}>
            {label.toUpperCase()}
          </Typography>
        </Stack>
        <Typography variant="h5" fontWeight={950} sx={{ color, ...textSafeSx }}>
          {value}
        </Typography>
      </Box>
    </Grid>
  );

  return (
    <>
    <Card sx={cardSx}>
      <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3, minWidth: 0 }}>
          <Box sx={{ p: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, color: binThemeTokens.gold, flexShrink: 0 }}>
            <TrendingUp size={22} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, ...textSafeSx }}>
              {t('owner.roiFinancialControl') || 'Financial Control & ROI'}
            </Typography>
            <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>
              Portfolio Financial Health
            </Typography>
          </Box>
        </Stack>

        {!financials.hasRentData && pmEnabled && properties.length > 0 && (
          <Box sx={{ p: 3, mb: 3, bgcolor: alpha('#f59e0b', 0.08), border: `1px solid ${alpha('#f59e0b', 0.2)}`, borderRadius: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <AlertCircle color="#f59e0b" />
              <Box>
                <Typography fontWeight={900} sx={{ color: '#fff' }}>ROI pending rent setup</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Add expected or actual annual rent to unlock live ROI projections.</Typography>
              </Box>
            </Stack>
            <Button variant="contained" onClick={openRentDialog} sx={{ bgcolor: '#f59e0b', color: '#000', fontWeight: 900, '&:hover': { bgcolor: '#d97706' } }}>
              {t('owner.addRentIncome') || 'Add Rent Income'}
            </Button>
          </Box>
        )}

        <Grid container spacing={3} sx={{ mb: 3 }}>
          {renderMetric(
            pmEnabled ? 'Net Property Position' : 'Net FM Cost Position',
            formatCurrency(pmEnabled ? financials.netPropertyPosition : (financials.totalSlaCredits - financials.totalPenalties - financials.annualContractValue - financials.totalMaintenanceCost)),
            <Landmark size={16} />,
            (pmEnabled ? financials.netPropertyPosition : (financials.totalSlaCredits - financials.totalPenalties - financials.annualContractValue - financials.totalMaintenanceCost)) >= 0 ? '#10b981' : '#ef4444'
          )}
          {renderMetric(
            'Estimated ROI',
            pmEnabled ? (financials.hasRentData ? formatCurrency(financials.estimatedOwnerRoi) : 'Pending Rent Data') : 'N/A',
            <TrendingUp size={16} />,
            pmEnabled && financials.hasRentData ? (financials.estimatedOwnerRoi >= 0 ? '#10b981' : '#ef4444') : '#fff'
          )}
          {renderMetric('Maintenance Cost', formatCurrency(financials.totalMaintenanceCost), <Wrench size={16} />, financials.totalMaintenanceCost > 0 ? '#ef4444' : '#fff')}
          {renderMetric('SLA Credits / Penalties', `${formatCurrency(financials.totalSlaCredits)} / ${formatCurrency(financials.totalPenalties)}`, <Shield size={16} />, binThemeTokens.gold)}
        </Grid>

        <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 900, mb: 2 }}>CONTRACT LEDGER & PAYMENTS</Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ ...metricBoxSx, bgcolor: 'transparent', border: 'none', px: 0 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, display: 'block', mb: 0.5 }}>ANNUAL CONTRACT VALUE</Typography>
                <Typography variant="h6" fontWeight={950} sx={{ color: '#fff' }}>{formatCurrency(financials.annualContractValue)}</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ ...metricBoxSx, bgcolor: 'transparent', border: 'none', px: 0 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, display: 'block', mb: 0.5 }}>15% MOBILIZATION</Typography>
                <Typography variant="h6" fontWeight={950} sx={{ color: '#fff' }}>{formatCurrency(financials.mobilizationAmount)}</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ ...metricBoxSx, bgcolor: 'transparent', border: 'none', px: 0 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, display: 'block', mb: 0.5 }}>TOTAL PAID / PENDING</Typography>
                <Typography variant="h6" fontWeight={950} sx={{ color: '#fff' }}>
                  <span style={{ color: '#10b981' }}>{formatCurrency(financials.totalPaid)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 8px' }}>/</span>
                  <span style={{ color: financials.totalPending > 0 ? '#ef4444' : '#fff' }}>{formatCurrency(financials.totalPending)}</span>
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ ...metricBoxSx, bgcolor: 'transparent', border: 'none', px: 0 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, display: 'block', mb: 0.5 }}>UPCOMING INVOICE</Typography>
                <Typography variant="h6" fontWeight={950} sx={{ color: '#fff' }}>{financials.upcomingInvoiceAmount !== null ? formatCurrency(financials.upcomingInvoiceAmount) : 'None'}</Typography>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>

    <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>{t('owner.addRentIncome') || 'Add Rent Income'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 1 }}>
          <TextField
            select
            label="Property"
            value={selectedPropertyId}
            onChange={(event) => setSelectedPropertyId(event.target.value)}
            fullWidth
            required
          >
            {properties.map((property) => {
              const id = propertyIdOf(property);
              return <MenuItem key={id} value={id}>{propertyNameOf(property)}</MenuItem>;
            })}
          </TextField>
          <TextField
            type="number"
            label="Annual rent (AED)"
            value={annualRentInput}
            onChange={(event) => setAnnualRentInput(event.target.value)}
            helperText="Expected or actual annual rent collected from your tenant for this property."
            fullWidth
            required
          />
          {saveError && <Alert severity="error">{saveError}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
        <Button onClick={handleSaveRentIncome} disabled={!isRentFormValid || saving} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
