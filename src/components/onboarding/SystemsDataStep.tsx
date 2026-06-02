import React, { useEffect, useMemo } from 'react';
import { Box, Typography, Grid, Paper, Checkbox, Button, Stack, Chip, Divider, Container } from '@mui/material';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type SystemItem = { key: string; label: string };
type AddOnItem = { id: string; name: string; desc: string; price: number; reason: string; required?: boolean; defaultSelected?: boolean };

const aed = (value: number) => `AED ${value.toLocaleString()}`;

const BASE_REQUIRED_STACK_IDS = ['fire_safety', 'water_tank', 'hvac_pm'];
const ELEVATOR_ADDON_ID = 'elevator_amc';
const LEGACY_OPTIONAL_ADDON_IDS = ['waste_management'];
const LEGACY_OPTIONAL_PRUNE_KEY = 'bin-group:onboarding:optional-addons-pruned:v1';

const isMajlisAsset = (property: any) => {
  const text = [
    property?.propertyType,
    property?.subType,
    property?.assetClass,
    property?.majlisType,
    property?.serviceModel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return Boolean(
    property?.majlis ||
    property?.majlisGarden ||
    (property?.majlisType && property.majlisType !== 'none') ||
    text.includes('majlis')
  );
};

const getRequiredStackIds = (property: any) => {
  const ids = [...BASE_REQUIRED_STACK_IDS];
  const hasRealLiftScope = Number(property?.lifts || 0) > 0 || Number(property?.floors || 0) > 1;

  if (!isMajlisAsset(property) && hasRealLiftScope) {
    ids.push(ELEVATOR_ADDON_ID);
  }

  return ids;
};

const getHiddenAddOnIds = (property: any) => (isMajlisAsset(property) ? [ELEVATOR_ADDON_ID] : []);

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
  { id: 'fire_safety', name: 'Fire Safety AMC', required: true, defaultSelected: true, price: 8000, desc: 'Civil Defense compliance checks, alarm readiness and certification support.', reason: 'Mandatory baseline for UAE occupied assets.' },
  { id: 'water_tank', name: 'Water Tank Sterilization', required: true, defaultSelected: true, price: 2200, desc: 'Quarterly cleaning, sterilization and hygiene documentation.', reason: 'Required when water tanks exist.' },
  { id: 'elevator_amc', name: 'Elevator / Lift AMC', price: 7500, desc: 'Lift inspections, safety checks and service coordination.', reason: 'Required only when the asset has floors/lifts. Hidden for Majlis assets.' },
  { id: 'hvac_pm', name: 'HVAC Preventive Maintenance', required: true, defaultSelected: true, price: 6680, desc: 'AC inspections, filters, coils, drain lines and performance checks.', reason: 'UAE climate makes HVAC continuity mission-critical.' },
  { id: 'cleaning', name: 'Cleaning Team / Deep Cleaning', price: 18450, desc: 'Common area cleaning and scheduled hygiene operations.', reason: 'Recommended for shared facilities and Majlis readiness.' },
  { id: 'security', name: 'Security Services / CCTV', price: 36600, desc: 'Guarding coordination, access control and incident logging.', reason: 'Optional manpower layer for towers, retail and high-value assets.' },
  { id: 'pest_control', name: 'Pest Control', price: 2475, desc: 'Quarterly municipality-approved pest control treatments.', reason: 'Standard preventive hygiene measure.' },
  { id: 'landscaping', name: 'Landscaping & Irrigation', price: 12000, desc: 'Garden maintenance, pruning and irrigation system checks.', reason: 'Essential for outdoor and garden spaces.' },
  { id: 'move_in_out_inspection', name: 'Move-in / Move-out Inspection', price: 1200, desc: 'Snagging and condition report before/after tenancy or event.', reason: 'Protects asset condition and lifecycle.' },
  { id: 'mep_support', name: 'MEP Support', price: 13500, desc: 'Integrated mechanical, electrical and plumbing preventive support.', reason: 'Core operational resilience layer.' },
  { id: 'waste_management', name: 'Waste Management', price: 6600, desc: 'Waste room checks and disposal schedule coordination.', reason: 'Optional hygiene and disposal coordination layer.' },
];

const SystemsDataStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
  const { properties, propertyData, updateProperty, selectedAddOns, toggleAddOn, calculateSummary } = useOnboardingStore();
  const { isRTL } = useLanguage();
  const activeProperty = properties[0] || propertyData || ({} as any);
  const storedSelectedIds = Array.isArray(selectedAddOns) ? selectedAddOns : [];
  const requiredStackIds = useMemo(() => getRequiredStackIds(activeProperty), [activeProperty]);
  const hiddenAddOnIds = useMemo(() => getHiddenAddOnIds(activeProperty), [activeProperty]);
  const visibleAddOns = addOns.filter((addon) => !hiddenAddOnIds.includes(addon.id));
  const selectedIds = new Set([
    ...storedSelectedIds.filter((id) => !hiddenAddOnIds.includes(id)),
    ...requiredStackIds,
  ]);
  const selectedAddOnRows = visibleAddOns.filter((a) => selectedIds.has(a.id));
  const selectedSystemGroups = systemGroups
    .map((group) => ({
      title: group.title,
      systems: group.systems.filter((system) => Boolean((activeProperty as any)[system.key])),
    }))
    .filter((group) => group.systems.length > 0);
  const selectedSystemCount = selectedSystemGroups.reduce((count, group) => count + group.systems.length, 0);
  const total = selectedAddOnRows.reduce((sum, a) => sum + a.price, 0);

  useEffect(() => {
    if (typeof window === 'undefined' || window.localStorage.getItem(LEGACY_OPTIONAL_PRUNE_KEY) === 'done') return;

    let changed = false;
    LEGACY_OPTIONAL_ADDON_IDS.forEach((id) => {
      if (storedSelectedIds.includes(id)) {
        toggleAddOn(id);
        changed = true;
      }
    });

    window.localStorage.setItem(LEGACY_OPTIONAL_PRUNE_KEY, 'done');
    if (changed) calculateSummary();
  }, []);

  useEffect(() => {
    let changed = false;

    requiredStackIds.forEach((id) => {
      if (!storedSelectedIds.includes(id)) {
        toggleAddOn(id);
        changed = true;
      }
    });

    hiddenAddOnIds.forEach((id) => {
      if (storedSelectedIds.includes(id)) {
        toggleAddOn(id);
        changed = true;
      }
    });

    if (!changed) calculateSummary();
  }, [requiredStackIds.join('|'), hiddenAddOnIds.join('|')]);

  const setSystem = (key: string, checked: boolean) => {
    updateProperty(0, { [key]: key === 'lifts' ? (checked ? Math.max(activeProperty.lifts || 1, 1) : 0) : checked } as any);
    calculateSummary();
  };

  const setAddOn = (id: string, checked: boolean) => {
    if (requiredStackIds.includes(id) || hiddenAddOnIds.includes(id)) return;
    const isSelected = storedSelectedIds.includes(id);
    if (checked !== isSelected) toggleAddOn(id);
  };

  const continueNext = () => {
    requiredStackIds.forEach((id) => {
      if (!selectedAddOns.includes(id)) toggleAddOn(id);
    });
    hiddenAddOnIds.forEach((id) => {
      if (selectedAddOns.includes(id)) toggleAddOn(id);
    });
    calculateSummary();
    onNext();
  };

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: { xs: 2, md: 4 } }}>
      <Container maxWidth="xl" disableGutters>
        <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 6, bgcolor: 'rgba(17,17,18,0.86)', border: '1px solid rgba(198,167,94,0.18)' }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>Systems & Add-ons Audit</Typography>
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>Systems Matrix</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,.58)', maxWidth: 900, mx: 'auto', mt: 1 }}>Select every critical building system. These choices control SLA scope, add-ons, dispatch readiness and quote accuracy.</Typography>
          </Box>

          <Grid container spacing={2.5} alignItems="stretch">
            <Grid item xs={12} xl={6.8}>
              <Grid container spacing={1.5} sx={{ height: '100%' }}>
                {systemGroups.map((group) => (
                  <Grid item xs={12} md={4} key={group.title}>
                    <Paper sx={{ p: 1.8, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}>
                      <Typography variant="overline" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1.2, lineHeight: 1.5 }}>{group.title}</Typography>
                      <Stack spacing={0.75}>
                        {group.systems.map((system) => {
                          const checked = Boolean((activeProperty as any)[system.key]);
                          return (
                            <Paper key={system.key} onClick={() => setSystem(system.key, !checked)} sx={{ p: 1, minHeight: 48, borderRadius: 2.5, cursor: 'pointer', display: 'flex', gap: 1, alignItems: 'center', bgcolor: checked ? 'rgba(198,167,94,.14)' : 'rgba(255,255,255,.025)', border: `1px solid ${checked ? 'rgba(198,167,94,.65)' : 'rgba(255,255,255,.06)'}`, transition: '150ms ease', '&:hover': { borderColor: 'rgba(198,167,94,.7)' } }}>
                              <Checkbox checked={checked} onClick={(e) => e.stopPropagation()} onChange={(e) => setSystem(system.key, e.target.checked)} sx={{ p: 0, color: 'rgba(255,255,255,.3)', '&.Mui-checked': { color: binThemeTokens.gold } }} />
                              <Typography sx={{ color: checked ? '#fff' : 'rgba(255,255,255,.72)', fontWeight: 850, lineHeight: 1.22, fontSize: { xs: 14, md: 13.5 }, wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' }}>{system.label}</Typography>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Grid>

            <Grid item xs={12} xl={3.2}>
              <Paper sx={{ p: 2, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>Operational Add-ons</Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>Select Additional Service Layers</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.52)', mb: 1.5, lineHeight: 1.55 }}>Add manpower, compliance, hygiene, standby and specialist services directly to the same systems page before commercial confirmation.</Typography>
                <Stack spacing={1} sx={{ maxHeight: { xl: 590 }, overflowY: { xl: 'auto' }, pr: { xl: 0.5 } }}>
                  {visibleAddOns.map((addon) => {
                    const checked = selectedIds.has(addon.id);
                    const locked = requiredStackIds.includes(addon.id);
                    return (
                      <Paper key={addon.id} onClick={() => setAddOn(addon.id, !checked)} sx={{ p: 1.2, borderRadius: 3, cursor: locked ? 'default' : 'pointer', bgcolor: checked ? 'rgba(198,167,94,.1)' : 'rgba(255,255,255,.025)', border: `1px solid ${checked ? 'rgba(198,167,94,.6)' : 'rgba(255,255,255,.07)'}` }}>
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                          <Checkbox checked={checked} disabled={locked} onChange={(e) => setAddOn(addon.id, e.target.checked)} sx={{ p: 0.2, color: 'rgba(255,255,255,.3)', '&.Mui-checked': { color: binThemeTokens.gold } }} />
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                              <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: 13 }}>{addon.name}</Typography>
                              {locked && <Chip label="Required" size="small" sx={{ height: 18, fontSize: 9, color: '#ef4444', bgcolor: 'rgba(239,68,68,.12)', fontWeight: 900 }} />}
                            </Stack>
                            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.54)', lineHeight: 1.45 }}>{addon.desc}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mt: 0.5 }}>{aed(addon.price)} / Annual</Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.38)', lineHeight: 1.35 }}>{addon.reason}</Typography>
                          </Box>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} xl={2}>
              <Paper sx={{ p: 2.2, height: '100%', borderRadius: 5, bgcolor: '#111112', border: '1px solid rgba(198,167,94,.28)' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>Service Stack</Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 900, mb: 0.5 }}>Selected systems & add-ons</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.46)', mb: 2 }}>{selectedSystemCount} selected systems · {selectedAddOnRows.length} priced add-ons</Typography>
                <Stack spacing={1.5} divider={<Divider sx={{ borderColor: 'rgba(255,255,255,.06)' }} />}>
                  {selectedSystemGroups.length > 0 && (
                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1 }}>Selected building systems</Typography>
                      <Stack spacing={1}>
                        {selectedSystemGroups.map((group) => (
                          <Box key={group.title}>
                            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.42)', fontWeight: 900, mb: 0.5 }}>{group.title}</Typography>
                            <Stack spacing={0.5}>
                              {group.systems.map((system) => (
                                <Box key={system.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: binThemeTokens.gold, flex: '0 0 auto' }} />
                                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.78)', fontWeight: 800, lineHeight: 1.35 }}>{system.label}</Typography>
                                </Box>
                              ))}
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}

                  <Box>
                    <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mb: 1 }}>Selected priced add-ons</Typography>
                    <Stack spacing={1}>
                      {selectedAddOnRows.map((addon) => (
                        <Box key={addon.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.78)', fontWeight: 850, lineHeight: 1.4 }}>{addon.name}</Typography>
                          <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, whiteSpace: 'nowrap' }}>{aed(addon.price)}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>

                  <Box sx={{ pt: 2 }}>
                    <Typography sx={{ color: '#fff', fontWeight: 950, lineHeight: 1.25 }}>Total annual add-ons</Typography>
                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 0.75 }}>{aed(total)}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" size="large" onClick={onBack} sx={{ borderRadius: 100, px: 6, color: 'rgba(255,255,255,.72)', borderColor: 'rgba(255,255,255,.16)' }}>Back</Button>
          <Button variant="contained" size="large" onClick={continueNext} sx={{ borderRadius: 100, px: 8, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, '&:hover': { bgcolor: '#E6C77A' } }}>Initialize Analysis</Button>
        </Box>
      </Container>
    </Box>
  );
};

export default SystemsDataStep;
