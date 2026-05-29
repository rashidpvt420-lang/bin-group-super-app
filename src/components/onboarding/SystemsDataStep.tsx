import React from 'react';
import { Box, Typography, Grid, Paper, Checkbox, Button, Stack, Chip, Divider, Container } from '@mui/material';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type SystemItem = { key: string; label: string };
type AddOnItem = { id: string; name: string; desc: string; price: number; reason: string; required?: boolean; selected?: boolean };

const aed = (value: number) => `AED ${value.toLocaleString()}`;

const systemGroups: Array<{ title: string; systems: SystemItem[] }> = [
  {
    title: 'Core MEP Systems',
    systems: [
      { key: 'electrical', label: 'Electrical / Power' },
      { key: 'plumbing', label: 'Plumbing & Water' },
      { key: 'drainage', label: 'Drainage & Sewage' },
      { key: 'pumps', label: 'Water Pumps' },
      { key: 'hvac', label: 'HVAC / AC systems' },
      { key: 'districtCooling', label: 'District cooling' },
      { key: 'tank', label: 'Water tank' },
      { key: 'gen', label: 'Generator / backup power' },
      { key: 'lifts', label: 'Lifts / elevators' },
    ],
  },
  {
    title: 'Life Safety & Compliance',
    systems: [
      { key: 'fireAlarm', label: 'Fire alarm system' },
      { key: 'firePump', label: 'Fire pump system' },
      { key: 'sira', label: 'SIRA / CCTV system' },
      { key: 'emergencyLighting', label: 'Emergency Lighting' },
      { key: 'accessControl', label: 'Access Control' },
      { key: 'bmu', label: 'BMU / façade access' },
      { key: 'wasteMan', label: 'Waste management room' },
    ],
  },
  {
    title: 'Amenities & Special Assets',
    systems: [
      { key: 'bms', label: 'Building Mgmt System (BMS)' },
      { key: 'iotSensors', label: 'IoT Sensors' },
      { key: 'pool', label: 'Swimming pool' },
      { key: 'gym', label: 'Gymnasium / Fitness' },
      { key: 'centralLPG', label: 'Gas / LPG system' },
      { key: 'greaseTrap', label: 'Grease trap' },
      { key: 'majlisGarden', label: 'Majlis garden / landscape' },
      { key: 'solarIntegration', label: 'Solar integration' },
      { key: 'evReadiness', label: 'EV charging readiness' },
    ],
  },
];

const addOns: AddOnItem[] = [
  { id: 'fire_safety', name: 'Fire Safety AMC', required: true, selected: true, price: 8000, desc: 'Civil Defense compliance checks, alarm readiness and certification support.', reason: 'Mandatory baseline for UAE occupied assets.' },
  { id: 'water_tank', name: 'Water Tank Sterilization', required: true, selected: true, price: 2200, desc: 'Quarterly cleaning, sterilization and hygiene documentation.', reason: 'Required when water tanks exist.' },
  { id: 'elevator_amc', name: 'Elevator / Lift AMC', required: true, selected: true, price: 7500, desc: 'Lift inspections, safety checks and service coordination.', reason: 'Required for multi-floor assets.' },
  { id: 'hvac_pm', name: 'HVAC Preventive Maintenance', required: true, selected: true, price: 6680, desc: 'AC inspections, filters, coils, drain lines and performance checks.', reason: 'UAE climate makes HVAC continuity mission-critical.' },
  { id: 'cleaning', name: 'Cleaning Team / Deep Cleaning', price: 18450, desc: 'Common area cleaning and scheduled hygiene operations.', reason: 'Recommended for shared facilities and Majlis readiness.' },
  { id: 'security', name: 'Security Services / CCTV', price: 36600, desc: 'Guarding coordination, access control and incident logging.', reason: 'Optional manpower layer for towers, retail and high-value assets.' },
  { id: 'pest_control', name: 'Pest Control', price: 2475, desc: 'Quarterly municipality-approved pest control treatments.', reason: 'Standard preventive hygiene measure.' },
  { id: 'landscaping', name: 'Landscaping & Irrigation', price: 12000, desc: 'Garden maintenance, pruning and irrigation system checks.', reason: 'Essential for outdoor and garden spaces.' },
  { id: 'move_in_out_inspection', name: 'Move-in / Move-out Inspection', price: 1200, desc: 'Snagging and condition report before/after tenancy or event.', reason: 'Protects asset condition and lifecycle.' },
  { id: 'mep_support', name: 'MEP Support', price: 13500, desc: 'Integrated mechanical, electrical and plumbing preventive support.', reason: 'Core operational resilience layer.' },
  { id: 'waste_management', name: 'Waste Management', selected: true, price: 6600, desc: 'Waste room checks and disposal schedule coordination.', reason: 'Protects hygiene and compliance.' },
];

const SystemsDataStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
  const { properties, propertyData, updateProperty, selectedAddOns, toggleAddOn, calculateSummary } = useOnboardingStore();
  const { isRTL } = useLanguage();
  const activeProperty = properties[0] || propertyData || ({} as any);
  const selectedIds = new Set([...(Array.isArray(selectedAddOns) ? selectedAddOns : []), ...addOns.filter((a) => a.selected || a.required).map((a) => a.id)]);
  const selectedAddOnRows = addOns.filter((a) => selectedIds.has(a.id));
  const total = selectedAddOnRows.reduce((sum, a) => sum + a.price, 0);

  const setSystem = (key: string, checked: boolean) => {
    updateProperty(0, { [key]: key === 'lifts' ? (checked ? Math.max(activeProperty.lifts || 1, 1) : 0) : checked } as any);
  };

  const continueNext = () => {
    addOns.filter((a) => a.selected || a.required).forEach((a) => {
      if (!selectedAddOns.includes(a.id)) toggleAddOn(a.id);
    });
    calculateSummary();
    onNext();
  };

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: { xs: 2, md: 4 } }}>
      <Container maxWidth="xl" disableGutters>
        <Grid container spacing={3} alignItems="flex-start">
          <Grid item xs={12} lg={8.3}>
            <Paper sx={{ p: { xs: 2, md: 4 }, borderRadius: 6, bgcolor: 'rgba(17,17,18,0.82)', border: '1px solid rgba(198,167,94,0.18)' }}>
              <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>Systems & Add-ons Audit</Typography>
                <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>Systems Matrix</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.58)', maxWidth: 900, mx: 'auto', mt: 1 }}>Select every critical building system. These choices control SLA scope, add-ons, dispatch readiness and quote accuracy.</Typography>
              </Box>

              <Grid container spacing={2}>
                {systemGroups.map((group) => (
                  <Grid item xs={12} md={4} key={group.title}>
                    <Paper sx={{ p: 2.2, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}>
                      <Typography variant="overline" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1.5 }}>{group.title}</Typography>
                      <Stack spacing={1}>
                        {group.systems.map((system) => {
                          const checked = Boolean((activeProperty as any)[system.key]);
                          return (
                            <Paper key={system.key} onClick={() => setSystem(system.key, !checked)} sx={{ p: 1.15, minHeight: 52, borderRadius: 2.5, cursor: 'pointer', display: 'flex', gap: 1, alignItems: 'center', bgcolor: checked ? 'rgba(198,167,94,.11)' : 'rgba(255,255,255,.025)', border: `1px solid ${checked ? 'rgba(198,167,94,.55)' : 'rgba(255,255,255,.06)'}` }}>
                              <Checkbox checked={checked} onClick={(e) => e.stopPropagation()} onChange={(e) => setSystem(system.key, e.target.checked)} sx={{ p: 0, color: 'rgba(255,255,255,.3)', '&.Mui-checked': { color: binThemeTokens.gold } }} />
                              <Typography sx={{ color: checked ? '#fff' : 'rgba(255,255,255,.68)', fontWeight: 850, lineHeight: 1.25, wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' }}>{system.label}</Typography>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Box sx={{ textAlign: 'center', my: 5 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>Operational Add-ons</Typography>
                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>Select Additional Service Layers</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.56)', maxWidth: 850, mx: 'auto', mt: 1 }}>Add manpower, compliance, hygiene, standby and specialist services directly to the same systems page before commercial confirmation.</Typography>
              </Box>

              <Grid container spacing={2}>
                {addOns.map((addon) => {
                  const checked = selectedIds.has(addon.id);
                  return (
                    <Grid item xs={12} md={6} xl={4} key={addon.id}>
                      <Paper onClick={() => !addon.required && !addon.selected && toggleAddOn(addon.id)} sx={{ p: 2.25, height: '100%', minHeight: 205, borderRadius: 4, cursor: addon.required || addon.selected ? 'default' : 'pointer', bgcolor: checked ? 'rgba(198,167,94,.09)' : 'rgba(255,255,255,.025)', border: `1px solid ${checked ? 'rgba(198,167,94,.65)' : 'rgba(255,255,255,.07)'}` }}>
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Typography sx={{ color: '#fff', fontWeight: 950 }}>{addon.name}</Typography>
                            {addon.required && <Chip label="Required" size="small" sx={{ height: 19, fontSize: 9, color: '#ef4444', bgcolor: 'rgba(239,68,68,.12)', fontWeight: 900 }} />}
                          </Stack>
                          <Typography sx={{ color: 'rgba(255,255,255,.58)', lineHeight: 1.55 }}>{addon.desc}</Typography>
                          <Typography sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{aed(addon.price)} / Annual</Typography>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.44)', lineHeight: 1.45 }}>ⓘ {addon.reason}</Typography>
                        </Stack>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={3.7}>
            <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#111112', border: '1px solid rgba(198,167,94,.28)', position: { lg: 'sticky' }, top: 100 }}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>Service Stack</Typography>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 900, mb: 3 }}>Selected add-ons</Typography>
              <Stack spacing={2} divider={<Divider sx={{ borderColor: 'rgba(255,255,255,.06)' }} />}>
                {selectedAddOnRows.map((addon) => (
                  <Box key={addon.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.78)', fontWeight: 850 }}>{addon.name}</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950, whiteSpace: 'nowrap' }}>{aed(addon.price)}</Typography>
                  </Box>
                ))}
                <Box sx={{ pt: 2, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                  <Typography sx={{ color: '#fff', fontWeight: 950 }}>Total annual add-ons</Typography>
                  <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 950, whiteSpace: 'nowrap' }}>{aed(total)}</Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" size="large" onClick={onBack} sx={{ borderRadius: 100, px: 6, color: 'rgba(255,255,255,.72)', borderColor: 'rgba(255,255,255,.16)' }}>Back</Button>
          <Button variant="contained" size="large" onClick={continueNext} sx={{ borderRadius: 100, px: 8, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, '&:hover': { bgcolor: '#E6C77A' } }}>Initialize Analysis</Button>
        </Box>
      </Container>
    </Box>
  );
};

export default SystemsDataStep;
