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
    useTheme
} from '@mui/material';
import { 
    Check, 
    ShieldAlert, 
    Waves, 
    ArrowRight,
    LucideIcon,
    Droplets,
    Activity,
    Wind,
    ArrowUpRight,
    Camera,
    Trash2
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { formatAED } from '../../utils/formatters';

const AddOnsStep: React.FC<{ onNext: () => void, onBack: () => void }> = ({ onNext, onBack }) => {
    const { propertyData, selectedAddOns, toggleAddOn } = useOnboardingStore();
    const theme = useTheme();

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
            mandatory: propertyData?.tank || false,
            showIf: propertyData?.tank || false,
            reason: 'Mandatory if tank exists.'
        },
        { 
            id: 'elevator_amc', 
            icon: Activity, 
            name: 'Elevator / Lift AMC', 
            desc: 'Full-cycle lift maintenance, quarterly inspections & Dubai Mun. certifications.', 
            price: 3200, 
            mandatory: (propertyData?.floors || 0) > 2 || (propertyData?.lifts || 0) > 0,
            showIf: (propertyData?.floors || 0) > 2 || (propertyData?.lifts || 0) > 0,
            reason: 'Mandatory for multi-floor assets per DM regulations.'
        },
        { 
            id: 'pool_care', 
            icon: Waves, 
            name: 'Swimming Pool Maintenance', 
            desc: 'Daily chemicals, vacuuming, and pump care.', 
            price: 6000, 
            mandatory: false,
            showIf: propertyData?.pool || propertyData?.majlis || false,
            reason: 'Villa/Majlis specialty care.'
        },
        { 
            id: 'façade_access', 
            icon: ArrowUpRight, 
            name: 'BMU / Façade Access Mission', 
            desc: 'Annual safety certification for rigging/BMU crane systems.', 
            price: 4500, 
            mandatory: propertyData?.bmu || false,
            showIf: propertyData?.bmu || false,
            reason: 'Compliance for high-rise assets.'
        },
        { 
            id: 'dist_cooling', 
            icon: Wind, 
            name: 'District Cooling Optimization', 
            desc: 'Energy management interface optimization.', 
            price: 3500, 
            mandatory: false,
            showIf: propertyData?.districtCooling || false,
            reason: 'Recommended for utility savings.'
        },
        { 
            id: 'sira_renewal', 
            icon: Camera, 
            name: 'CCTV / SIRA Maintenance', 
            desc: 'SIRA-approved preventive care and renewals.', 
            price: 1800, 
            mandatory: propertyData?.sira || false,
            showIf: propertyData?.sira || false,
            reason: 'SIRA regulatory requirement.'
        },
        { 
            id: 'grease_trap', 
            icon: Trash2, 
            name: 'Grease Trap Service', 
            desc: 'Monthly grease trap cleaning to Dubai Municipality standards.', 
            price: 900, 
            mandatory: false,
            showIf: propertyData?.propertyType === 'Commercial' || (['Hotel / Resort', 'Retail Mall / Shop'] as string[]).includes(propertyData?.subType || ''),
            reason: 'Required for F&B / commercial kitchen tenancies.'
        },
        { 
            id: 'pca_audit', 
            icon: Activity, 
            name: 'PCA Asset Audit', 
            desc: 'Professional engineering condition report.', 
            price: 5000, 
            mandatory: propertyData?.propertyType === 'Commercial' || (propertyData?.age || 0) > 15,
            showIf: true,
            reason: 'Institutional asset requirement.'
        },
        // ── MAJLIS ADD-ONS ────────────────────────────────────────────────
        {
            id: 'majlis_deep_care',
            icon: ShieldAlert,
            name: 'Majlis Deep Care Programme',
            desc: 'Monthly deep cleaning, joinery care, upholstery protection & guest-wear restoration.',
            price: 8400,
            mandatory: propertyData?.propertyType === 'GOVERNMENT_MAJLIS',
            showIf: propertyData?.propertyType === 'GOVERNMENT_MAJLIS' || propertyData?.majlis || false,
            reason: 'Required for high-footfall Government Majlis reception assets.'
        },
        {
            id: 'majlis_landscaping',
            icon: Waves,
            name: 'Majlis Landscaping & Grounds AMC',
            desc: 'Fortnightly garden maintenance, irrigation systems, palm care & decorative lighting.',
            price: 6000,
            mandatory: propertyData?.propertyType === 'GOVERNMENT_MAJLIS' && propertyData?.majlisGarden,
            showIf: (propertyData?.propertyType === 'GOVERNMENT_MAJLIS' || propertyData?.majlis || false) && propertyData?.majlisGarden,
            reason: 'Mandatory for properties with landscaped grounds.'
        },
        {
            id: 'majlis_exterior_wash',
            icon: Droplets,
            name: 'Majlis Exterior & Facade Wash',
            desc: 'Pressure washing, window cleaning, entrance gate & perimeter care.',
            price: 2800,
            mandatory: false,
            showIf: propertyData?.propertyType === 'GOVERNMENT_MAJLIS' || propertyData?.majlis || false,
            reason: 'Recommended for premium Majlis estates.'
        },
        {
            id: 'majlis_hvac',
            icon: Wind,
            name: 'Majlis Premium HVAC Service',
            desc: 'Enhanced cooling load management, filter care, seasonal balancing for large Majlis reception areas.',
            price: 4500,
            mandatory: propertyData?.propertyType === 'GOVERNMENT_MAJLIS',
            showIf: propertyData?.propertyType === 'GOVERNMENT_MAJLIS' || propertyData?.majlis || false,
            reason: 'Majlis cooling loads exceed standard residential specs.'
        },
        {
            id: 'majlis_hospitality',
            icon: Activity,
            name: 'Hospitality Readiness Maintenance',
            desc: 'Pre-event deep inspection, on-call response, VIP guest standards compliance.',
            price: 3600,
            mandatory: propertyData?.propertyType === 'GOVERNMENT_MAJLIS',
            showIf: propertyData?.propertyType === 'GOVERNMENT_MAJLIS' || propertyData?.majlis || false,
            reason: 'Sovereign Majlis VIP hosting standard.'
        },
        // ── INSTITUTIONAL SECTOR ADD-ONS ──────────────────────────────────
        {
            id: 'hotel_guest_safety',
            icon: ShieldAlert,
            name: 'Hotel Guest Safety Audit',
            desc: 'Monthly DHA/Municipality compliance audits for guest-facing systems.',
            price: 12500,
            mandatory: propertyData?.propertyType === 'HOTEL',
            showIf: propertyData?.propertyType === 'HOTEL',
            reason: 'Mandatory guest-facing health & safety compliance.'
        },
        {
            id: 'gov_compliance_pack',
            icon: Activity,
            name: 'Gov Property Compliance Pack',
            desc: 'Consolidated multi-departmental audit readiness and reporting.',
            price: 9500,
            mandatory: propertyData?.propertyType === 'GOVERNMENT_PROPERTY',
            showIf: propertyData?.propertyType === 'GOVERNMENT_PROPERTY',
            reason: 'Departmental asset criticality and compliance stack.'
        }
    ];

    const currentAddOns = allAddOns.filter(a => a.showIf === undefined || a.showIf);
    const safeSelectedAddOns = Array.isArray(selectedAddOns) ? selectedAddOns : [];

    return (
        <Box>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 1, color: binThemeTokens.gold }}>SELECT ADD-ON SERVICES</Typography>
            <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 6, maxWidth: 600 }}>
                Our intelligence engine has identified the following mandatory and recommended mission-critical services based on your asset profile.
            </Typography>

            <Grid container spacing={4}>
                <Grid item xs={12} md={8}>
                    <Grid container spacing={2}>
                        {(Array.isArray(currentAddOns) ? currentAddOns : []).map((addon) => {
                            const isSelected = safeSelectedAddOns.includes(addon.id) || addon.mandatory;
                            const Icon = addon.icon as LucideIcon;
                            
                            return (
                                <Grid item xs={12} key={addon.id}>
                                    <Paper 
                                        onClick={() => !addon.mandatory && toggleAddOn(addon.id)}
                                        sx={{ 
                                            p: 3, borderRadius: 6, cursor: addon.mandatory ? 'default' : 'pointer',
                                            bgcolor: isSelected ? 'rgba(198, 167, 94, 0.05)' : 'rgba(22, 22, 24, 0.6)',
                                            border: '1px solid',
                                            borderColor: isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                            transition: 'all 0.3s ease',
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between',
                                            '&:hover': {
                                                borderColor: binThemeTokens.gold,
                                                bgcolor: isSelected ? 'rgba(198, 167, 94, 0.08)' : 'rgba(198, 167, 94, 0.03)',
                                                transform: 'translateY(-2px)'
                                            }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Box sx={{ 
                                                p: 1.5, borderRadius: 3, 
                                                bgcolor: isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                                color: isSelected ? binThemeTokens.black : binThemeTokens.textSecondary,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <Icon size={24} />
                                            </Box>
                                            <Box>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                    <Typography variant="h6" sx={{ fontWeight: 900, color: binThemeTokens.textPrimary }}>{addon.name}</Typography>
                                                    {addon.mandatory && (
                                                        <Chip 
                                                            label="MANDATORY" size="small" 
                                                            sx={{ 
                                                                fontSize: 9, fontWeight: 900, 
                                                                bgcolor: 'rgba(255, 77, 77, 0.1)', color: '#ff4d4d',
                                                                border: '1px solid rgba(255, 77, 77, 0.2)'
                                                            }} 
                                                        />
                                                    )}
                                                </Box>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, display: 'block' }}>{addon.desc}</Typography>
                                                <Typography variant="caption" sx={{ color: addon.mandatory ? '#ff4d4d' : binThemeTokens.gold, fontWeight: 900 }}>
                                                    REASON: {addon.reason}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 2, minWidth: 140, justifyContent: 'flex-end' }}>
                                            <Box>
                                                <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, whiteSpace: 'nowrap' }}>AED {formatAED(addon.price)}+</Typography>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, display: 'block' }}>ANNUAL</Typography>
                                            </Box>
                                            {isSelected ? (
                                                <Check color={binThemeTokens.gold} size={24} />
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

                <Grid item xs={12} md={4}>
                    <Paper sx={{ 
                        p: 4, 
                        borderRadius: 6, 
                        bgcolor: '#161618', 
                        border: '1px solid rgba(198, 167, 94, 0.1)', 
                        position: 'sticky', 
                        top: 180,
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
                    }}>
                        <Typography variant="h6" fontWeight="900" sx={{ mb: 4, color: binThemeTokens.gold, letterSpacing: 1 }}>SOVEREIGN TAILORING</Typography>
                        
                        <Stack spacing={2} divider={<Divider sx={{ borderColor: 'rgba(198, 167, 94, 0.1)' }} />}>
                            {(Array.isArray(currentAddOns) ? currentAddOns : []).filter(a => safeSelectedAddOns.includes(a.id) || a.mandatory).map((a) => (
                                <Box key={a.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>{a.name}</Typography>
                                    <Typography variant="body2" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>AED {formatAED(a.price)}</Typography>
                                </Box>
                            ))}
                            <Box sx={{ pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography fontWeight="900" sx={{ color: binThemeTokens.textPrimary, letterSpacing: 1 }}>TOTAL MISSIONS</Typography>
                                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>
                                    AED {formatAED((Array.isArray(currentAddOns) ? currentAddOns : [])
                                        .filter(a => safeSelectedAddOns.includes(a.id) || a.mandatory)
                                        .reduce((sum, a) => sum + a.price, 0))}
                                </Typography>
                            </Box>
                        </Stack>

                        <Box sx={{ mt: 6 }}>
                            <Button 
                                variant="contained" 
                                fullWidth 
                                size="large"
                                onClick={onNext}
                                endIcon={<ArrowRight />}
                                sx={{ 
                                    background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                                    color: '#0B0B0C', 
                                    py: 2, 
                                    fontWeight: 900, 
                                    borderRadius: 4,
                                    fontSize: '1.1rem'
                                }}
                            >
                                PROCEED TO SUMMARY
                            </Button>
                            <Button 
                                fullWidth 
                                variant="text" 
                                onClick={onBack}
                                sx={{ mt: 2, color: binThemeTokens.textSecondary, fontWeight: 900 }}
                            >
                                Back to Models
                            </Button>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default AddOnsStep;
