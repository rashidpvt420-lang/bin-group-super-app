import React from 'react';
import { 
    Box, 
    Typography, 
    Grid, 
    Paper, 
    Button, 
    Stack, 
    Chip,
    Divider,
    useTheme,
    alpha
} from '@mui/material';
import { 
    Check, 
    ShieldAlert, 
    Waves, 
    ArrowRight,
    Droplets,
    Activity,
    Wind,
    ArrowUpRight,
    Camera,
    Trash2,
    Info,
    Building,
    ArrowLeft
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../../utils/formatters';

const AddOnsStep: React.FC<{ onNext: () => void, onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, selectedAddOns, toggleAddOn } = useOnboardingStore();
    const { t, tx, isRTL } = useLanguage();
    const activeProperty = properties[0];

    const allAddOns = [
        { 
            id: 'fire_safety', 
            icon: ShieldAlert, 
            name: 'Fire Safety AMC', 
            desc: 'Dubai Civil Defense compliance & certification.', 
            price: 2500, 
            mandatory: true,
            showIf: true,
            reason: 'Mandatory for all UAE properties.'
        },
        { 
            id: 'water_tank', 
            icon: Droplets, 
            name: 'Water Tank Sterilization', 
            desc: 'Quarterly lab-tested sterilization and cleaning.', 
            price: 1200, 
            mandatory: activeProperty?.tank || false,
            showIf: activeProperty?.tank || false,
            reason: 'Mandatory if tank exists.'
        },
        { 
            id: 'elevator_amc', 
            icon: Activity, 
            name: 'Elevator / Lift AMC', 
            desc: 'Full-cycle lift maintenance, quarterly inspections & Municipality certifications.', 
            price: 3200, 
            mandatory: (activeProperty?.floors || 0) > 2 || (activeProperty?.lifts || 0) > 0,
            showIf: (activeProperty?.floors || 0) > 2 || (activeProperty?.lifts || 0) > 0,
            reason: 'Mandatory for multi-floor assets per UAE regulations.'
        },
        { 
            id: 'pool_care', 
            icon: Waves, 
            name: 'Swimming Pool Maintenance', 
            desc: 'Daily chemicals, vacuuming, and pump care.', 
            price: 6000, 
            mandatory: false,
            showIf: activeProperty?.pool || activeProperty?.majlis || false,
            reason: 'Villa/Majlis specialty care.'
        },
        { 
            id: 'façade_access', 
            icon: ArrowUpRight, 
            name: 'BMU / Façade Access Mission', 
            desc: 'Annual safety certification for rigging/BMU crane systems.', 
            price: 4500, 
            mandatory: activeProperty?.bmu || false,
            showIf: activeProperty?.bmu || false,
            reason: 'Compliance for high-rise assets.'
        },
        { 
            id: 'dist_cooling', 
            icon: Wind, 
            name: 'District Cooling Optimization', 
            desc: 'Energy management interface optimization.', 
            price: 3500, 
            mandatory: false,
            showIf: activeProperty?.districtCooling || false,
            reason: 'Recommended for utility savings.'
        },
        { 
            id: 'sira_renewal', 
            icon: Camera, 
            name: 'CCTV / SIRA Maintenance', 
            desc: 'SIRA-approved preventive care and renewals.', 
            price: 1800, 
            mandatory: activeProperty?.sira || false,
            showIf: activeProperty?.sira || false,
            reason: 'SIRA regulatory requirement.'
        },
        { 
            id: 'grease_trap', 
            icon: Trash2, 
            name: 'Grease Trap Service', 
            desc: 'Monthly grease trap cleaning to Municipality standards.', 
            price: 900, 
            mandatory: false,
            showIf: activeProperty?.propertyType === 'Commercial' || (['Hotel', 'Retail', 'Mall'] as string[]).includes(activeProperty?.subType || ''),
            reason: 'Required for F&B / commercial kitchen tenancies.'
        },
        { 
            id: 'pca_audit', 
            icon: Activity, 
            name: 'PCA Asset Audit', 
            desc: 'Professional engineering condition report.', 
            price: 5000, 
            mandatory: activeProperty?.propertyType === 'Commercial' || (activeProperty?.age || 0) > 15,
            showIf: true,
            reason: 'Institutional asset requirement.'
        },
        {
            id: 'security',
            icon: ShieldAlert,
            name: 'Security Services',
            desc: 'Guarding, access control coordination, incident logging and patrol support.',
            price: 12000,
            mandatory: false,
            showIf: true,
            reason: 'Optional manpower layer for towers, retail and high-value assets.'
        },
        {
            id: 'cleaning',
            icon: Droplets,
            name: 'Cleaning Services',
            desc: 'Common area cleaning and scheduled hygiene operations.',
            price: 9000,
            mandatory: false,
            showIf: true,
            reason: 'Recommended for shared facilities and tenant-heavy properties.'
        },
        {
            id: 'manpower',
            icon: Activity,
            name: 'Manpower Support',
            desc: 'Dedicated helpers and operational manpower for daily property tasks.',
            price: 15000,
            mandatory: false,
            showIf: true,
            reason: 'Optional staffing capacity for institutional owners.'
        },
        {
            id: 'concierge',
            icon: Info,
            name: 'Concierge Desk',
            desc: 'Front desk coordination and tenant/visitor support.',
            price: 18000,
            mandatory: false,
            showIf: (activeProperty?.units || 0) >= 20 || activeProperty?.propertyType === 'Hotel',
            reason: 'Recommended for towers, hotels and premium mixed-use properties.'
        },
        {
            id: 'pest_control',
            icon: ShieldAlert,
            name: 'Pest Control',
            desc: 'Scheduled pest prevention and emergency treatment.',
            price: 1500,
            mandatory: false,
            showIf: true,
            reason: 'Recommended baseline protection for all occupied assets.'
        },
        {
            id: 'generator',
            icon: Activity,
            name: 'Generator Maintenance',
            desc: 'Generator testing, preventive checks and emergency readiness.',
            price: 3500,
            mandatory: activeProperty?.gen || false,
            showIf: activeProperty?.gen || false,
            reason: 'Required where backup power systems exist.'
        },
        {
            id: 'office_units',
            icon: Building,
            name: 'Office Unit Support',
            desc: 'Dedicated checks for office units, pantry, lighting and MEP coordination.',
            price: 2500,
            mandatory: false,
            showIf: (activeProperty?.offices || 0) > 0,
            reason: 'Office units require separate occupancy and fit-out service tracking.'
        },
        {
            id: 'retail_shops',
            icon: Building,
            name: 'Retail Shops Support',
            desc: 'Retail tenancy MEP coordination, signage checks and service logging.',
            price: 3000,
            mandatory: false,
            showIf: (activeProperty?.shops || 0) > 0,
            reason: 'Retail shops add footfall and service complexity.'
        },
        {
            id: 'parking_management',
            icon: Camera,
            name: 'Parking Management',
            desc: 'Parking operations, access coordination and incident reporting.',
            price: 6000,
            mandatory: false,
            showIf: (activeProperty?.parkingCapacity || 0) > 0 || (activeProperty?.units || 0) >= 20,
            reason: 'Recommended for towers and high-occupancy buildings.'
        },
        {
            id: 'waste_management',
            icon: Trash2,
            name: 'Waste Management',
            desc: 'Waste room checks, municipal coordination and disposal schedules.',
            price: 3500,
            mandatory: activeProperty?.wasteMan || false,
            showIf: true,
            reason: 'Protects hygiene and compliance for occupied properties.'
        },
        {
            id: 'mep_support',
            icon: Activity,
            name: 'MEP Support',
            desc: 'Integrated mechanical, electrical and plumbing preventive support.',
            price: 8500,
            mandatory: false,
            showIf: true,
            reason: 'Core operational resilience layer for all asset classes.'
        },
        {
            id: 'hvac_pm',
            icon: Wind,
            name: 'HVAC Preventive Maintenance',
            desc: 'Preventive AC inspections, filters, coils, drain lines and performance checks.',
            price: 4500,
            mandatory: activeProperty?.hvac || false,
            showIf: true,
            reason: 'UAE climate makes HVAC continuity mission-critical.'
        },
        // ── MAJLIS ADD-ONS ────────────────────────────────────────────────
        {
            id: 'majlis_deep_care',
            icon: ShieldAlert,
            name: 'Majlis Deep Care Programme',
            desc: 'Monthly deep cleaning, joinery care, upholstery protection & guest-wear restoration.',
            price: 8400,
            mandatory: activeProperty?.propertyType === 'Government Majlis',
            showIf: activeProperty?.propertyType === 'Government Majlis' || activeProperty?.majlis || false,
            reason: 'Required for high-footfall Majlis reception assets.'
        },
        {
            id: 'majlis_landscaping',
            icon: Waves,
            name: 'Majlis Landscaping & Grounds AMC',
            desc: 'Fortnightly garden maintenance, irrigation systems, palm care & decorative lighting.',
            price: 6000,
            mandatory: activeProperty?.propertyType === 'Government Majlis' && activeProperty?.majlisGarden,
            showIf: (activeProperty?.propertyType === 'Government Majlis' || activeProperty?.majlis || false) && activeProperty?.majlisGarden,
            reason: 'Mandatory for properties with landscaped grounds.'
        },
        {
            id: 'majlis_exterior_wash',
            icon: Droplets,
            name: 'Majlis Exterior & Facade Wash',
            desc: 'Pressure washing, window cleaning, entrance gate & perimeter care.',
            price: 2800,
            mandatory: false,
            showIf: activeProperty?.propertyType === 'Government Majlis' || activeProperty?.majlis || false,
            reason: 'Recommended for premium Majlis estates.'
        },
        {
            id: 'majlis_standby',
            icon: Activity,
            name: 'Majlis Event Standby',
            desc: 'Technical standby for Majlis / event venue during official functions.',
            price: 2500,
            mandatory: false,
            showIf: activeProperty?.propertyType === 'Government Majlis' || activeProperty?.majlis || false,
            reason: 'On-call technical integrity for high-priority functions.'
        }
    ];

    const currentAddOns = allAddOns.filter(a => a.showIf);
    const safeSelectedAddOns = Array.isArray(selectedAddOns) ? selectedAddOns : [];

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{t('onboarding.addons_title')}</Typography>
                <Typography variant="h4" fontWeight="950" sx={{ mb: 1, color: '#FFF' }}>{t('onboarding.addons_subtitle')}</Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 800, mx: 'auto' }}>
                    {t('onboarding.addons_desc')}
                </Typography>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Grid container spacing={2}>
                        {currentAddOns.map((addon) => {
                            const isSelected = safeSelectedAddOns.includes(addon.id) || addon.mandatory;
                            const Icon = addon.icon as LucideIcon;
                            
                            return (
                                <Grid item xs={12} key={addon.id}>
                                    <Paper 
                                        onClick={() => !addon.mandatory && toggleAddOn(addon.id)}
                                        sx={{ 
                                            p: 3, borderRadius: 6, cursor: addon.mandatory ? 'default' : 'pointer',
                                            bgcolor: isSelected ? alpha(binThemeTokens.gold, 0.08) : 'rgba(22, 22, 24, 0.6)',
                                            border: '1px solid',
                                            borderColor: isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                            transition: 'all 0.2s ease',
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between',
                                            position: 'relative',
                                            '&:hover': {
                                                borderColor: binThemeTokens.gold,
                                                bgcolor: isSelected ? alpha(binThemeTokens.gold, 0.12) : 'rgba(198, 167, 94, 0.03)'
                                            }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Box sx={{ 
                                                p: 1.5, borderRadius: 3, 
                                                bgcolor: isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                                color: isSelected ? '#000' : binThemeTokens.gold,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <Icon size={24} />
                                            </Box>
                                            <Box>
                                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 900, color: '#FFF' }}>{addon.name}</Typography>
                                                    {addon.mandatory && (
                                                        <Chip label={t('onboarding.mandatory')} size="small" sx={{ height: 16, fontSize: 8, fontWeight: 950, bgcolor: alpha('#ef4444', 0.1), color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} />
                                                    )}
                                                </Stack>
                                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>{addon.desc}</Typography>
                                                <Typography variant="caption" sx={{ color: addon.mandatory ? '#ef4444' : binThemeTokens.gold, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Info size={12} /> {t('onboarding.reason')}: {addon.reason}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 2, minWidth: 150, justifyContent: 'flex-end' }}>
                                            <Box>
                                                <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF', whiteSpace: 'nowrap' }}>{t('common.currency')} {addon.price.toLocaleString()}+</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>{t('onboarding.annual')}</Typography>
                                            </Box>
                                            {isSelected ? (
                                                <Check color={binThemeTokens.gold} size={24} strokeWidth={3} />
                                            ) : (
                                                <Box sx={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)' }} />
                                            )}
                                        </Box>
                                    </Paper>
                                </Grid>
                            );
                        })}
                    </Grid>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: '#111112', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, position: 'sticky', top: 100 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{t('onboarding.sovereign_stack')}</Typography>
                        <Typography variant="h6" fontWeight="900" sx={{ mb: 3, color: '#FFF' }}>{t('onboarding.selected_addons')}</Typography>
                        
                        <Stack spacing={2} divider={<Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}>
                            {currentAddOns.filter(a => safeSelectedAddOns.includes(a.id) || a.mandatory).map((a) => (
                                <Box key={a.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>{a.name}</Typography>
                                    <Typography variant="body2" fontWeight="900" sx={{ color: binThemeTokens.gold }}>AED {a.price.toLocaleString()}</Typography>
                                </Box>
                            ))}
                            
                            {currentAddOns.filter(a => safeSelectedAddOns.includes(a.id) || a.mandatory).length === 0 && (
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>No additional missions selected.</Typography>
                            )}

                            <Box sx={{ pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography fontWeight="950" sx={{ color: '#FFF' }}>{t('onboarding.total_annual')}</Typography>
                                <Typography variant="h5" fontWeight="950" sx={{ color: binThemeTokens.gold }}>
                                    {t('common.currency')} {currentAddOns
                                        .filter(a => safeSelectedAddOns.includes(a.id) || a.mandatory)
                                        .reduce((sum, a) => sum + a.price, 0).toLocaleString()}
                                </Typography>
                            </Box>
                        </Stack>

                        <Stack spacing={2} sx={{ mt: 6 }}>
                            <Button 
                                variant="contained" fullWidth size="large" onClick={onNext}
                                endIcon={isRTL ? <ArrowLeft /> : <ArrowRight />}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', py: 2, fontWeight: 950, borderRadius: 3 }}
                            >
                                {t('btn.next')}
                            </Button>
                            <Button 
                                variant="text" fullWidth onClick={onBack} startIcon={isRTL ? <ArrowRight /> : <ArrowLeft />}
                                sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}
                            >
                                {t('onboarding.back_to_models')}
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default AddOnsStep;
