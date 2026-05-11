import React from 'react';
import {
    Box, Typography, Grid, Paper, Checkbox, FormControlLabel,
    Stack, Button, Container, alpha, Chip, Divider
} from '@mui/material';
import {
    ArrowRight, ArrowLeft, Zap, Wind, Waves, ShieldCheck, Flame, Sun, Car,
    Check, ShieldAlert, Droplets, Activity, Camera, Trash2, Info, Building, Wrench
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const SystemsDataStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty, selectedAddOns, toggleAddOn } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const activeProperty = properties[0] || ({} as any);
    const safeSelectedAddOns = Array.isArray(selectedAddOns) ? selectedAddOns : [];

    const systemGroups = [
        {
            title: t('onboarding.sys.core'),
            systems: [
                { key: 'hvac', label: t('onboarding.sys.hvac'), icon: <Wind size={18} /> },
                { key: 'districtCooling', label: t('onboarding.sys.districtCooling'), icon: <Wind size={18} /> },
                { key: 'tank', label: t('onboarding.sys.tank'), icon: <Zap size={18} /> },
                { key: 'gen', label: t('onboarding.sys.gen'), icon: <Zap size={18} /> },
                { key: 'lifts', label: t('onboarding.sys.lifts'), icon: <Zap size={18} /> },
            ]
        },
        {
            title: t('onboarding.sys.safety'),
            systems: [
                { key: 'fireAlarm', label: t('onboarding.sys.fireAlarm'), icon: <Flame size={18} /> },
                { key: 'firePump', label: t('onboarding.sys.firePump'), icon: <Flame size={18} /> },
                { key: 'sira', label: t('onboarding.sys.sira'), icon: <ShieldCheck size={18} /> },
                { key: 'bmu', label: t('onboarding.sys.bmu'), icon: <Zap size={18} /> },
                { key: 'wasteMan', label: t('onboarding.sys.wasteMan'), icon: <Zap size={18} /> },
            ]
        },
        {
            title: t('onboarding.sys.amenities'),
            systems: [
                { key: 'pool', label: t('onboarding.sys.pool'), icon: <Waves size={18} /> },
                { key: 'centralLPG', label: t('onboarding.sys.gasSystem'), icon: <Flame size={18} /> },
                { key: 'greaseTrap', label: t('onboarding.sys.greaseTrap'), icon: <Waves size={18} /> },
                { key: 'majlisGarden', label: t('onboarding.sys.majlisGarden'), icon: <Sun size={18} /> },
                { key: 'solarIntegration', label: t('onboarding.sys.solarIntegration'), icon: <Sun size={18} /> },
                { key: 'evReadiness', label: t('onboarding.sys.evReadiness'), icon: <Car size={18} /> },
            ]
        }
    ];

    const allAddOns = [
        { id: 'fire_safety', icon: ShieldAlert, name: 'Fire Safety AMC', desc: 'Civil Defense compliance checks, alarm readiness and certification support.', price: 2500, mandatory: true, showIf: true, reason: 'Mandatory baseline for UAE occupied assets.' },
        { id: 'water_tank', icon: Droplets, name: 'Water Tank Sterilization', desc: 'Quarterly cleaning, sterilization and hygiene documentation.', price: 1200, mandatory: !!activeProperty.tank, showIf: !!activeProperty.tank, reason: 'Required when water tanks exist.' },
        { id: 'elevator_amc', icon: Activity, name: 'Elevator / Lift AMC', desc: 'Lift inspections, safety checks and service coordination.', price: 3200, mandatory: (activeProperty.floors || 0) > 2 || (activeProperty.lifts || 0) > 0, showIf: (activeProperty.floors || 0) > 2 || (activeProperty.lifts || 0) > 0, reason: 'Required for multi-floor assets.' },
        { id: 'hvac_pm', icon: Wind, name: 'HVAC Preventive Maintenance', desc: 'AC inspections, filters, coils, drain lines and performance checks.', price: 4500, mandatory: !!activeProperty.hvac, showIf: true, reason: 'UAE climate makes HVAC continuity mission-critical.' },
        { id: 'cleaning', icon: Droplets, name: 'Cleaning Team / Deep Cleaning', desc: 'Common area cleaning and scheduled hygiene operations.', price: 9000, mandatory: false, showIf: true, reason: 'Recommended for shared facilities and Majlis readiness.' },
        { id: 'security', icon: ShieldAlert, name: 'Security Services / CCTV', desc: 'Guarding coordination, access control and incident logging.', price: 12000, mandatory: false, showIf: true, reason: 'Optional manpower layer for towers, retail and high-value assets.' },
        { id: 'technician_standby', icon: Activity, name: 'Technician Standby / Event Support', desc: 'Dedicated on-site technician for VIP events or critical operations.', price: 5000, mandatory: false, showIf: !!activeProperty.majlis || activeProperty.propertyType === 'Hotel', reason: 'Crucial for VIP operational continuity.' },
        { id: 'pest_control', icon: ShieldAlert, name: 'Pest Control', desc: 'Quarterly municipality-approved pest control treatments.', price: 1500, mandatory: false, showIf: true, reason: 'Standard preventive hygiene measure.' },
        { id: 'landscaping', icon: Waves, name: 'Landscaping & Irrigation', desc: 'Garden maintenance, pruning and irrigation system checks.', price: 4000, mandatory: false, showIf: activeProperty.propertyType === 'Villa' || !!activeProperty.majlis, reason: 'Essential for outdoor and garden spaces.' },
        { id: 'move_in_out', icon: Check, name: 'Move-in / Move-out Inspection', desc: 'Snagging and condition report before/after tenancy or event.', price: 800, mandatory: false, showIf: true, reason: 'Protects asset condition and lifecycle.' },
        { id: 'mep_support', icon: Wrench, name: 'MEP Support', desc: 'Integrated mechanical, electrical and plumbing preventive support.', price: 8500, mandatory: false, showIf: true, reason: 'Core operational resilience layer.' },
        { id: 'office_units', icon: Building, name: 'Office Unit Support', desc: 'Office unit, pantry, lighting and fit-out coordination checks.', price: 2500, mandatory: false, showIf: (activeProperty.offices || 0) > 0, reason: 'Office units need separate occupancy tracking.' },
        { id: 'parking_management', icon: Camera, name: 'Parking Management', desc: 'Parking access coordination and incident reporting.', price: 6000, mandatory: false, showIf: (activeProperty.parkingCapacity || 0) > 0 || (activeProperty.units || 0) >= 20, reason: 'Recommended for towers and high-occupancy assets.' },
        { id: 'waste_management', icon: Trash2, name: 'Waste Management', desc: 'Waste room checks and disposal schedule coordination.', price: 3500, mandatory: !!activeProperty.wasteMan, showIf: true, reason: 'Protects hygiene and compliance.' },
    ].filter((addon) => addon.showIf);

    const selectedVisibleAddOns = allAddOns.filter((addon) => safeSelectedAddOns.includes(addon.id) || addon.mandatory);
    const addOnTotal = selectedVisibleAddOns.reduce((sum, addon) => sum + addon.price, 0);

    return (
        <Box sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                    {t('onboarding.systems_audit')}
                </Typography>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.systems_matrix')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 840, mx: 'auto' }}>
                    {t('onboarding.systems_desc')}
                </Typography>
            </Box>

            <Container maxWidth="xl">
                <Grid container spacing={3}>
                    <Grid item xs={12} lg={8}>
                        <Grid container spacing={3}>
                            {systemGroups.map((group) => (
                                <Grid item xs={12} md={4} key={group.title}>
                                    <Paper sx={{ p: 4, borderRadius: 6, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>
                                            {group.title}
                                        </Typography>
                                        <Stack spacing={1}>
                                            {group.systems.map((sys) => (
                                                <FormControlLabel
                                                    key={sys.key}
                                                    control={
                                                        <Checkbox
                                                            checked={Boolean((activeProperty as any)[sys.key])}
                                                            onChange={(e) => updateProperty(0, { [sys.key]: sys.key === 'lifts' ? (e.target.checked ? Math.max(activeProperty.lifts || 1, 1) : 0) : e.target.checked } as any)}
                                                            sx={{ color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: binThemeTokens.gold } }}
                                                        />
                                                    }
                                                    label={
                                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                            <Box sx={{ color: (activeProperty as any)[sys.key] ? binThemeTokens.gold : 'rgba(255,255,255,0.2)' }}>
                                                                {sys.icon}
                                                            </Box>
                                                            <Typography variant="body2" sx={{ color: (activeProperty as any)[sys.key] ? '#FFF' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                                                                {sys.label}
                                                            </Typography>
                                                        </Stack>
                                                    }
                                                    sx={{
                                                        m: 0, mb: 1, p: 1.5, borderRadius: 2,
                                                        bgcolor: (activeProperty as any)[sys.key] ? 'rgba(198, 167, 94, 0.05)' : 'transparent',
                                                        border: `1px solid ${(activeProperty as any)[sys.key] ? 'rgba(198, 167, 94, 0.1)' : 'transparent'}`,
                                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                                                        flexDirection: isRTL ? 'row-reverse' : 'row',
                                                        '& .MuiTypography-root': { flexGrow: 1, textAlign: isRTL ? 'right' : 'left' }
                                                    }}
                                                />
                                            ))}
                                        </Stack>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>

                        <Box sx={{ textAlign: 'center', my: 6 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{t('onboarding.addons_title')}</Typography>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{t('onboarding.addons_subtitle')}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 760, mx: 'auto', mt: 1 }}>{t('onboarding.addons_desc')}</Typography>
                        </Box>

                        <Grid container spacing={2}>
                            {allAddOns.map((addon) => {
                                const isSelected = safeSelectedAddOns.includes(addon.id) || addon.mandatory;
                                const Icon = addon.icon as LucideIcon;
                                return (
                                    <Grid item xs={12} md={6} key={addon.id}>
                                        <Paper
                                            onClick={() => !addon.mandatory && toggleAddOn(addon.id)}
                                            sx={{
                                                p: 2.5,
                                                borderRadius: 4,
                                                cursor: addon.mandatory ? 'default' : 'pointer',
                                                bgcolor: isSelected ? alpha(binThemeTokens.gold, 0.08) : 'rgba(22,22,24,0.6)',
                                                border: '1px solid',
                                                borderColor: isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.06)',
                                                minHeight: 170,
                                                '&:hover': { borderColor: binThemeTokens.gold }
                                            }}
                                        >
                                            <Stack direction="row" spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                <Box sx={{ p: 1.2, borderRadius: 2.5, bgcolor: isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.05)', color: isSelected ? '#000' : binThemeTokens.gold, height: 44 }}>
                                                    <Icon size={22} />
                                                </Box>
                                                <Box sx={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row', mb: 0.5 }}>
                                                        <Typography variant="subtitle2" sx={{ color: '#FFF', fontWeight: 950 }}>{addon.name}</Typography>
                                                        {addon.mandatory && <Chip label={t('onboarding.mandatory')} size="small" sx={{ height: 18, fontSize: 9, color: '#ef4444', bgcolor: 'rgba(239,68,68,0.1)' }} />}
                                                    </Stack>
                                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mb: 1 }}>{addon.desc}</Typography>
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('common.currency')} {addon.price.toLocaleString()} / {t('onboarding.annual')}</Typography>
                                                    <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.42)', mt: 0.75 }}><Info size={11} /> {addon.reason}</Typography>
                                                </Box>
                                                {isSelected ? <Check color={binThemeTokens.gold} /> : <Box sx={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.16)' }} />}
                                            </Stack>
                                        </Paper>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: '#111112', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`, position: { lg: 'sticky' }, top: 100 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{t('onboarding.sovereign_stack')}</Typography>
                            <Typography variant="h6" fontWeight="900" sx={{ mb: 3, color: '#FFF' }}>{t('onboarding.selected_addons')}</Typography>
                            <Stack spacing={2} divider={<Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}>
                                {selectedVisibleAddOns.length === 0 ? (
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)' }}>No add-ons selected yet.</Typography>
                                ) : selectedVisibleAddOns.map((addon) => (
                                    <Box key={addon.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>{addon.name}</Typography>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950, whiteSpace: 'nowrap' }}>{t('common.currency')} {addon.price.toLocaleString()}</Typography>
                                    </Box>
                                ))}
                                <Box sx={{ pt: 2, display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Typography fontWeight="950" sx={{ color: '#FFF' }}>{t('onboarding.total_annual')}</Typography>
                                    <Typography variant="h5" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{t('common.currency')} {addOnTotal.toLocaleString()}</Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>

                <Box sx={{ mt: 8, display: 'flex', justifyContent: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Button
                        variant="outlined"
                        size="large"
                        onClick={onBack}
                        startIcon={!isRTL ? <ArrowLeft /> : null}
                        endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null}
                        sx={{ borderRadius: 100, px: 6, color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.16)' }}
                    >
                        {t('onboarding.back')}
                    </Button>
                    <Button
                        variant="contained"
                        size="large"
                        onClick={onNext}
                        endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                        sx={{ borderRadius: 100, px: 8, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, '&:hover': { bgcolor: '#E6C77A' } }}
                    >
                        {t('onboarding.initialize_analysis')}
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default SystemsDataStep;
