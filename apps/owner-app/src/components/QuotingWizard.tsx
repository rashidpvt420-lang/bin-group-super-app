import React, { useState } from 'react';
import {
    Box, Button, Card, CardContent, Chip, CircularProgress,
    Divider, FormControl, Grid, InputLabel, MenuItem,
    Select, TextField, Typography, Slider,
    Stack, useTheme
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import { calculateUAEValuation } from '../utils/uaePricingEngine';
import { db, collection, addDoc, serverTimestamp } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { generateTenderScopePdf } from '../utils/tenderExportEngine';
import { ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useOnboardingStore } from '../store/onboardingStore';
import { formatAED, formatNumber } from '../utils/formatters';

// ─────────────── Types ───────────────────────────────────────────────────────

interface QuoteInput {
    emirate: string;
    community: string;
    floorPlateSqFt: number;
    exposure: string;
    verticalLevel: number;
    configuration: string;
    compliance: string;
    furnished: boolean;
    assetType: string;
    buildingGrade: string;
    conditionScore: number;
    buildingAge: number;
    liftsCount: number;
    strategy: 'sale' | 'rent' | 'fm';
}

// ─────────────── Predictive Risk Panel ───────────────────────────────────────

const PredictiveRiskPanel = ({ input }: { input: QuoteInput }) => {
    const risks = [
        { label: 'Elevator Compliance Service', days: 63, status: 'URGENT' },
        { label: 'Water Tank Sterilization', days: 120, status: 'SCHEDULED' },
        { label: 'Fire Alarm System Renewal', days: 15, status: 'EXPIRING' },
        { label: 'SIRA CCTV Audit', days: 45, status: 'SCHEDULED' },
        { label: 'DC Heat Exchanger Flush', days: 180, status: 'PLANNED' }
    ];

    return (
        <Box sx={{ 
            mt: 4, 
            p: 3, 
            bgcolor: 'rgba(198, 167, 94, 0.05)', 
            borderRadius: 4, 
            border: '1px solid rgba(198, 167, 94, 0.1)' 
        }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <WarningAmberIcon sx={{ color: binThemeTokens.gold, fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>PREDICTIVE MAINTENANCE TIMELINE (2026)</Typography>
            </Stack>
            <Stack spacing={2}>
                {risks.map((risk, i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Typography variant="body2" fontWeight="700" sx={{ color: binThemeTokens.textPrimary }}>{risk.label}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>Required in {risk.days} days</Typography>
                        </Box>
                        <Chip 
                            label={risk.status} 
                            size="small" 
                            sx={{ 
                                fontWeight: 900, 
                                fontSize: 10, 
                                bgcolor: risk.status === 'URGENT' ? 'rgba(255, 77, 77, 0.1)' : 'rgba(198, 167, 94, 0.1)',
                                color: risk.status === 'URGENT' ? '#ff4d4d' : binThemeTokens.gold,
                                border: `1px solid ${risk.status === 'URGENT' ? 'rgba(255, 77, 77, 0.2)' : 'rgba(198, 167, 94, 0.2)'}`
                            }} 
                        />
                    </Box>
                ))}
            </Stack>
        </Box>
    );
};

// ─────────────── Live Savings Simulation Panel ──────────────────────────────

const LiveSavingsPanel = ({ savings }: { savings: any }) => {
    if (!savings) return null;
    return (
        <Box sx={{
            mt: 4, p: 4,
            background: 'linear-gradient(135deg, rgba(11,11,12,0.98) 0%, rgba(22,22,24,0.95) 100%)',
            borderRadius: 6,
            border: `2px solid ${binThemeTokens.gold}`,
            boxShadow: `0 20px 60px rgba(198,167,94,0.15)`,
            position: 'relative', overflow: 'hidden'
        }}>
            <Box sx={{ position: 'absolute', top: -30, right: -30, width: 180, height: 180,
                background: `radial-gradient(circle, ${binThemeTokens.gold}18 0%, transparent 70%)` }} />
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3 }}>
                LIVE SAVINGS SIMULATION — UAE MARKET BENCHMARK
            </Typography>
            <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} md={4}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1, display: 'block', mb: 0.5 }}>MARKET AVERAGE (REACTIVE)</Typography>
                    <Typography variant="h4" fontWeight="900" sx={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'line-through' }}>
                        AED {formatAED(savings.marketAverageAnnual)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>per year (unmanaged)</Typography>
                </Grid>
                <Grid item xs={12} md={4} sx={{ textAlign: 'center' }}>
                    <Box sx={{ p: 2, bgcolor: 'rgba(198,167,94,0.08)', borderRadius: 4, border: `1px solid ${binThemeTokens.gold}44` }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5, display: 'block' }}>YOU SAVE ANNUALLY</Typography>
                        <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>
                            AED {formatAED(savings.savingsAmount)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#4ADE80', fontWeight: 900 }}>
                            {savings.efficiencyGain} efficiency · {savings.complianceCoverageBoost} compliance coverage
                        </Typography>
                    </Box>
                </Grid>
                <Grid item xs={12} md={4} sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1, display: 'block', mb: 0.5 }}>BIN-GROUP TOTAL</Typography>
                    <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.gold }}>
                        AED {formatAED(savings.binGroupAnnual)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>per year (fully managed)</Typography>
                </Grid>
            </Grid>
        </Box>
    );
};

// ─────────────── Contract Recommendation Banner ───────────────────────────────

const ContractRecommendationBanner = ({ recommendation }: { recommendation: any }) => {
    if (!recommendation) return null;
    return (
        <Box sx={{
            mt: 4, mb: 2, p: 3,
            bgcolor: 'rgba(198,167,94,0.04)',
            borderRadius: 4,
            border: `1px solid ${binThemeTokens.gold}44`,
            display: 'flex', gap: 3, alignItems: 'flex-start'
        }}>
            <Box sx={{ p: 1.5, bgcolor: `${binThemeTokens.gold}22`, borderRadius: 3, flexShrink: 0 }}>
                <AutoAwesomeIcon sx={{ color: binThemeTokens.gold, fontSize: 28 }} />
            </Box>
            <Box>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, display: 'block' }}>AI CONTRACT RECOMMENDATION</Typography>
                <Typography variant="h6" fontWeight="900" sx={{ color: '#FFFFFF', mb: 1 }}>
                    {recommendation.recommendedTier}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {(recommendation.recommendedReason || []).map((r: string, i: number) => (
                        <Chip key={i} label={r} size="small" sx={{
                            bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.textPrimary,
                            border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, fontWeight: 600
                        }} />
                    ))}
                </Stack>
            </Box>
            <Chip label={`Score: ${recommendation.score}/100`} size="small" sx={{
                ml: 'auto', bgcolor: `${binThemeTokens.gold}22`, color: binThemeTokens.gold,
                border: `1px solid ${binThemeTokens.gold}44`, fontWeight: 900, flexShrink: 0
            }} />
        </Box>
    );
};

// ─────────────── UAE Market Alignment Card ───────────────────────────────────

const UAEMarketAlignmentCard = ({ benchmark }: { benchmark: any }) => {
    if (!benchmark) return null;

    const getAlignmentColor = (status: string) => {
        switch (status) {
            case 'ALIGNED': return binThemeTokens.gold;
            case 'BELOW_MARKET': return '#4ADE80'; // Emerald Green for savings/value
            case 'PREMIUM': return '#E6C77A';
            case 'CRITICAL_LOW': return '#F87171';
            default: return binThemeTokens.gold;
        }
    };

    return (
        <Box sx={{ 
            mt: 4, 
            p: 4, 
            bgcolor: 'rgba(11, 11, 12, 0.95)', 
            borderRadius: 6, 
            border: `1px solid ${binThemeTokens.goldLight}33`,
            boxShadow: `0 20px 40px rgba(0,0,0,0.5)`,
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Background Accent */}
            <Box sx={{ 
                position: 'absolute', top: -50, right: -50, width: 200, height: 200, 
                background: `radial-gradient(circle, ${binThemeTokens.gold}11 0%, transparent 70%)`,
                zIndex: 0
            }} />

            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3, position: 'relative', zIndex: 1 }}>
                <Box sx={{ p: 1, bgcolor: `${binThemeTokens.gold}22`, borderRadius: 2 }}>
                    <ShieldCheck size={24} color={binThemeTokens.gold} />
                </Box>
                <Box>
                    <Typography variant="h6" sx={{ color: '#FFFFFF', fontWeight: 900, letterSpacing: 1 }}>UAE MARKET ALIGNMENT</Typography>
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 700, letterSpacing: 1.5 }}>{benchmark.benchmarkSource.toUpperCase()}</Typography>
                </Box>
                <Box sx={{ flexGrow: 1 }} />
                <Chip 
                    label={benchmark.alignmentStatus} 
                    sx={{ 
                        bgcolor: `${getAlignmentColor(benchmark.alignmentStatus)}11`, 
                        color: getAlignmentColor(benchmark.alignmentStatus),
                        border: `1px solid ${getAlignmentColor(benchmark.alignmentStatus)}33`,
                        fontWeight: 900,
                        px: 1
                    }} 
                />
            </Stack>

            <Grid container spacing={4} sx={{ position: 'relative', zIndex: 1 }}>
                <Grid item xs={12} md={6}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, display: 'block', mb: 1, fontWeight: 900, letterSpacing: 1 }}>MARKET BENCHMARK RANGE ({benchmark.benchmarkRegion})</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <Typography variant="h4" sx={{ color: '#FFFFFF', fontWeight: 900 }}>
                            AED {formatAED(benchmark?.marketBenchmarkMin)} - {formatAED(benchmark?.marketBenchmarkMax)}
                        </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 2, fontStyle: 'italic', maxWidth: 400 }}>
                        "{benchmark.benchmarkJustification}"
                    </Typography>

                    {/* Inclusion Details */}
                    <Box sx={{ mt: 4 }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5 }}>INSTITUTIONAL COMPLIANCE MISSIONS (MANDATORY)</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                            {['SIRA Audit', 'Civil Defense', 'Water Sterilization', 'HVAC Hygiene'].map(m => (
                                <Chip key={m} label={m} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.textPrimary, border: '1px solid rgba(255,255,255,0.1)', fontSize: 10, fontWeight: 700 }} />
                            ))}
                        </Stack>
                    </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, position: 'relative', mb: 2 }}>
                            <Box sx={{ 
                                position: 'absolute', 
                                left: '15%', right: '15%', top: 0, bottom: 0, 
                                bgcolor: `${binThemeTokens.gold}33`, 
                                borderRadius: 2,
                                border: `1px solid ${binThemeTokens.gold}44`
                            }} />
                            <Box sx={{ 
                                position: 'absolute', 
                                left: '45%', top: -6, width: 16, height: 16, 
                                bgcolor: binThemeTokens.gold, 
                                borderRadius: '50%',
                                boxShadow: `0 0 15px ${binThemeTokens.gold}`
                            }} />
                        </Box>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, textAlign: 'center', fontWeight: 900 }}>
                            BIN-GROUP QUOTE POSITIONED WITHIN TOP-TIER FM BAND
                        </Typography>

                        <Box sx={{ mt: 4, p: 2, bgcolor: 'rgba(198, 167, 94, 0.05)', borderRadius: 2, border: `1px dashed ${binThemeTokens.gold}44` }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ACTIVE VALUE ADD-ONS</Typography>
                            <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 600, mt: 0.5 }}>✓ 24/7 Majlis-Ready Concierge Support</Typography>
                            <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 600 }}>✓ Integrated Energy Management Layer</Typography>
                        </Box>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

// ─────────────── Comparison Table ──────────────────────────────────────────

const PlanComparisonTable = ({ valuation, onSelect }: any) => {
    const packages = valuation.packages || [];

    return (
        <Box sx={{ mt: 4 }}>
            <Grid container spacing={3}>
                {packages.map((pkg: any, i: number) => {
                    const isHybrid = pkg.packageName === 'Hybrid Bundle' || pkg.packageName === 'Premium Gold';
                    return (
                        <Grid item xs={12} md={4} key={i}>
                            <Card sx={{ 
                                height: '100%', 
                                position: 'relative', 
                                border: isHybrid ? `2px solid ${binThemeTokens.gold}` : '1px solid rgba(255,255,255,0.05)',
                                bgcolor: isHybrid ? 'rgba(198,167,94,0.03)' : 'rgba(22, 22, 24, 0.6)',
                                borderRadius: 6,
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                    transform: 'translateY(-10px)',
                                    boxShadow: isHybrid ? `0 20px 40px rgba(198, 167, 94, 0.15)` : '0 20px 40px rgba(0,0,0,0.4)',
                                    borderColor: binThemeTokens.gold
                                }
                            }}>
                                {isHybrid && (
                                    <Chip 
                                        label="MOST POPULAR" size="small" 
                                        sx={{ 
                                            position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', 
                                            background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                                            color: '#0B0B0C', fontWeight: 900, letterSpacing: 1, px: 1
                                        }}
                                    />
                                )}
                                <CardContent sx={{ p: 4 }}>
                                    <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, mb: 2, fontWeight: 900, letterSpacing: 2 }}>{pkg.packageName.toUpperCase()}</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                                        <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF' }}>
                                            AED {formatAED(pkg.annualPrice)}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>/year</Typography>
                                    </Box>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 'bold', display: 'block', mb: 3 }}>
                                        EST. MONTHLY: AED {formatAED(pkg.monthlyPrice)}
                                    </Typography>

                                    <Stack spacing={2} sx={{ mb: 4 }}>
                                        {pkg.features.map((f: string, j: number) => (
                                            <Box key={j} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                                <CheckCircleIcon sx={{ fontSize: 18, color: binThemeTokens.gold }} />
                                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 600 }}>{f}</Typography>
                                            </Box>
                                        ))}
                                    </Stack>

                                    <Button 
                                        fullWidth variant="contained" 
                                        onClick={() => onSelect({ package: pkg })}
                                        sx={{ 
                                            borderRadius: 3, 
                                            py: 1.5,
                                            fontWeight: 900,
                                            background: isHybrid ? 'linear-gradient(135deg, #C6A75E, #E6C77A)' : 'rgba(255,255,255,0.05)',
                                            color: isHybrid ? '#0B0B0C' : '#FFFFFF',
                                            '&:hover': {
                                                background: isHybrid ? '#E6C77A' : 'rgba(255,255,255,0.1)',
                                                transform: 'scale(1.02)'
                                            }
                                        }}
                                    >
                                        Select {pkg.packageName}
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>
        </Box>
    );
};

// ─────────────── Main Wizard ─────────────────────────────────────────────────

interface Props {
    prefillSqft?: number;
    prefillType?: string;
    onPlanSelected?: (tier: any) => void;
    embeddedMode?: boolean;
}

export default function QuotingWizard({ prefillSqft, prefillType, onPlanSelected, embeddedMode = false }: Props) {
    const { t } = useLanguage();
    const theme = useTheme();
    const { propertyData, updatePropertyData } = useOnboardingStore();
    const { user } = useRole();
    
    // Internal state for non-embedded or override
    const [internalInput, setInternalInput] = useState<QuoteInput>({
        emirate: 'Dubai',
        community: 'Dubai Marina',
        floorPlateSqFt: prefillSqft || 1200,
        exposure: 'Sea',
        verticalLevel: 25,
        configuration: '2BR',
        compliance: 'low_risk',
        furnished: true,
        assetType: prefillType || 'Apartment',
        buildingGrade: 'Luxury',
        conditionScore: 9,
        buildingAge: 5,
        liftsCount: 4,
        strategy: 'rent',
    });

    // Map condition label → numeric score for the engine
    const conditionToScore = (c: string): number => {
        switch (c) {
            case 'Mint': return 10;
            case 'Good': return 8;
            case 'Fair': return 5;
            case 'Poor': return 2;
            default: return 7;
        }
    };

    // Effective input comes from store if embedded
    const input = embeddedMode ? {
        ...propertyData, // SPREAD FIRST — includes majlis, majlisType, majlisGarden, majlisOutdoorKitchen
        emirate: propertyData.emirate,
        propertyType: propertyData.propertyType, // explicit — needed for Majlis/Commercial engine branches
        community: propertyData.area || 'Dubai Marina',
        floorPlateSqFt: propertyData.sqft,
        exposure: propertyData.exposure || 'Community',
        verticalLevel: propertyData.floors,
        floors: propertyData.floors,
        configuration: `${propertyData.bedrooms}BR`,
        compliance: 'low_risk',
        furnished: true,
        assetType: propertyData.subType,
        buildingGrade: propertyData.assetGrade,
        buildingAge: propertyData.age,
        conditionScore: conditionToScore(propertyData.condition),
        liftsCount: propertyData.lifts,
        strategy: propertyData.strategy || 'fm',
    } : internalInput;

    const [isCalculating, setIsCalculating] = useState(false);
    const [valuationResult, setValuationResult] = useState<any>(null);
    const [activating, setActivating] = useState(false);

    const handleChange = (field: keyof QuoteInput) => (e: any) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (embeddedMode) {
            // Map fields back to store if needed, or just update local if it's transient
            if (field === 'strategy') updatePropertyData({ strategy: val as any });
        } else {
            setInternalInput(prev => ({ ...prev, [field]: val }));
        }
    };

    const handleExportTender = () => {
        if (!valuationResult) return;
        
        generateTenderScopePdf({
            emirate: input.emirate,
            propertyType: (input as any).propertyType || 'Residential',
            assetType: (input as any).propertyType === 'GOVERNMENT_MAJLIS' ? 'Government Majlis' : (input.assetType || 'Residential'),
            sqft: input.floorPlateSqFt || 0, // Use floorPlateSqFt from input
            annualYield: 7.12, // Default benchmark yield
            majlisType: (input as any).majlisType,
            heritageSensitivity: (input as any).heritageSensitivity,
            hasSolar: (input as any).solarIntegration === 'yes' || (input as any).solarIntegration === true,
            hasEV: (input as any).evReadiness === 'yes' || (input as any).evReadiness === true
        }, valuationResult);
    };

    const handleContractActivation = async () => {
        setActivating(true);
        try {
            // Simulate API call or contract generation
            await new Promise(resolve => setTimeout(resolve, 2000)); 

            // Save contract details to Firebase
            await addDoc(collection(db, 'contracts'), {
                inputData: input,
                valuationResult: valuationResult,
                activatedBy: user?.uid || 'anonymous',
                timestamp: serverTimestamp(),
            });

            console.log('Contract activated and saved to Firebase!');
            // Optionally, navigate or show a success message
        } catch (error) {
            console.error('Error activating contract:', error);
            // Show error message
        } finally {
            setActivating(false);
        }
    };

    const handleRunValuation = async () => {
        setIsCalculating(true);
        setTimeout(async () => {
            try {
                // Pass the effective input to the engine
                const res = await calculateUAEValuation(input as any);
                setValuationResult(res);
            } finally {
                setIsCalculating(false);
            }
        }, 1500);
    };

    if (valuationResult) {
        return (
            <Box>
                <Typography variant="h4" fontWeight="900" sx={{ mb: 1, color: binThemeTokens.gold }}>Institutional Quote Summary</Typography>
                
                {/* ── EXECUTIVE SUMMARY KPI BAR ── */}
                <Box sx={{ 
                    mb: 4, mt: 4, p: 3, 
                    bgcolor: '#0B0B0C', 
                    borderRadius: 6, 
                    border: `1px solid ${binThemeTokens.gold}33`,
                    display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'space-around',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                    background: 'linear-gradient(135deg, #161618 0%, #0B0B0C 100%)'
                }}>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>ANNUAL VALUATION</Typography>
                        <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>
                            AED {formatAED(valuationResult.packages?.[1]?.annualPrice)}
                        </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(198,167,94,0.1)' }} />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>EFFICIENCY GAIN</Typography>
                        <Stack direction="row" alignItems="center" spacing={1} justifyContent="center">
                            <TrendingUpIcon sx={{ color: '#4ADE80', fontSize: 20 }} />
                            <Typography variant="h4" fontWeight="900" sx={{ color: '#4ADE80' }}>
                                {valuationResult.savingsSimulation?.efficiencyGain}
                            </Typography>
                        </Stack>
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(198,167,94,0.1)' }} />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>ASSET CLASS</Typography>
                        <Typography variant="h4" fontWeight="900" sx={{ color: '#fff', fontSize: '1.2rem', mt: 1 }}>
                            {(input as any).propertyType === 'GOVERNMENT_MAJLIS' ? 'GOVERNMENT MAJLIS' : (input.assetType?.toUpperCase() || 'SOVEREIGN')}
                        </Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                            {valuationResult.geographyIntelligence?.districtTier || 'PRIME'} GRADE
                        </Typography>
                    </Box>
                </Box>

                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, flexGrow: 1 }}>
                        Calibration complete. {input.emirate} market benchmarks for {(input as any).propertyType === 'GOVERNMENT_MAJLIS' ? 'Government Majlis' : (input.assetType || (input as any).subType || 'asset')} in {valuationResult.geographyIntelligence?.districtTier || 'UAE'} district.
                    </Typography>
                    {((input as any).propertyType === 'GOVERNMENT_MAJLIS' || (input as any).propertyType === 'GOVERNMENT_PROPERTY' || (input as any).propertyType === 'HOTEL') && (
                         <Chip 
                            label="TENDER READY" 
                            size="small"
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 1 }}
                        />
                    )}
                    {valuationResult.portfolioIntelligence?.portfolioDiscount > 0 && (
                        <Chip 
                            label={`${valuationResult.portfolioIntelligence.portfolioTier} — ${(valuationResult.portfolioIntelligence.portfolioDiscount * 100).toFixed(0)}% OFF`}
                            sx={{ bgcolor: 'rgba(74,222,128,0.1)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 900 }}
                        />
                    )}
                </Stack>

                {/* Live Savings Simulation */}
                <LiveSavingsPanel savings={valuationResult.savingsSimulation} />
                
                <UAEMarketAlignmentCard benchmark={valuationResult.benchmark} />

                {/* Contract Recommendation */}
                <ContractRecommendationBanner recommendation={valuationResult.contractRecommendation} />
                
                <Box sx={{ mt: 4 }}>
                    <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, letterSpacing: 2 }}>SELECT CONTRACT TIER</Typography>
                    <PlanComparisonTable valuation={valuationResult} onSelect={onPlanSelected} />
                </Box>

                {/* Compliance Missions */}
                {valuationResult.complianceMissions?.length > 0 && (
                    <Box sx={{ mt: 4, p: 3, bgcolor: 'rgba(255,77,77,0.04)', borderRadius: 4, border: '1px solid rgba(255,77,77,0.15)' }}>
                        <Typography variant="overline" sx={{ color: '#ff4d4d', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 2 }}>
                            MANDATORY COMPLIANCE MISSIONS DETECTED ({valuationResult.complianceMissions.filter((m: any) => m.mandatory).length})
                        </Typography>
                        <Stack spacing={1.5}>
                            {valuationResult.complianceMissions.slice(0, 5).map((m: any, i: number) => (
                                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="body2" fontWeight="700" sx={{ color: '#FFFFFF' }}>{m.mission}</Typography>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{m.authority} · {m.frequency}</Typography>
                                    </Box>
                                    <Chip label={`${m.urgencyDays}d`} size="small" sx={{
                                        bgcolor: m.urgencyDays < 30 ? 'rgba(255,77,77,0.15)' : 'rgba(198,167,94,0.1)',
                                        color: m.urgencyDays < 30 ? '#ff4d4d' : binThemeTokens.gold,
                                        fontWeight: 900, minWidth: 52
                                    }} />
                                </Box>
                            ))}
                        </Stack>
                    </Box>
                )}

                <PredictiveRiskPanel input={input} />

                <Stack direction="row" spacing={3} sx={{ mt: 8 }}>
                    <Button 
                        fullWidth variant="outlined" 
                        onClick={handleExportTender}
                        sx={{ 
                            color: binThemeTokens.gold, 
                            borderColor: binThemeTokens.gold, 
                            fontWeight: 900, 
                            py: 2.5, 
                            borderRadius: 4,
                            fontSize: '1.2rem',
                            '&:hover': { bgcolor: 'rgba(198,167,94,0.05)', borderColor: binThemeTokens.goldLight }
                        }}>
                        EXPORT TENDER PACK →
                    </Button>
                    <Button 
                        fullWidth variant="contained" 
                        disabled={activating}
                        onClick={handleContractActivation}
                        sx={{ 
                            background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                            color: '#0B0B0C', 
                            fontWeight: 900, 
                            py: 2.5, 
                            borderRadius: 4,
                            fontSize: '1.2rem',
                            boxShadow: '0 20px 40px rgba(198, 167, 94, 0.3)',
                            '&:hover': { transform: 'scale(1.02)' }
                        }}>
                        {activating ? 'INITIALIZING PROTOCOL...' : 'ACTIVATE BIN-SERVICE CONTRACT →'}
                    </Button>
                </Stack>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <AutoAwesomeIcon sx={{ color: binThemeTokens.gold }} />
                <Typography variant="h6" fontWeight="900" sx={{ color: '#FFFFFF' }}>BIN-GENESIS™ Asset Intelligence Engine</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>
                Sovereign-grade predictive yield modeling for institutional UAE infrastructure.
            </Typography>

            <Grid container spacing={3}>
                <Grid item xs={12} sm={4}>
                    <FormControl fullWidth>
                        <InputLabel sx={{ color: binThemeTokens.textSecondary }}>Emirate</InputLabel>
                        <Select value={input.emirate} label="Emirate" onChange={handleChange('emirate')}>
                            <MenuItem value="Dubai">Dubai</MenuItem>
                            <MenuItem value="Abu Dhabi">Abu Dhabi</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <FormControl fullWidth>
                        <InputLabel sx={{ color: binThemeTokens.textSecondary }}>Community</InputLabel>
                        <Select value={input.community} label="Community" onChange={handleChange('community')}>
                            <MenuItem value="Dubai Marina">Dubai Marina</MenuItem>
                            <MenuItem value="Downtown Dubai">Downtown Dubai</MenuItem>
                            <MenuItem value="Palm Jumeirah">Palm Jumeirah</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <FormControl fullWidth>
                        <InputLabel sx={{ color: binThemeTokens.textSecondary }}>Building Grade</InputLabel>
                        <Select value={input.buildingGrade} label="Building Grade" onChange={handleChange('buildingGrade')}>
                            <MenuItem value="Ultra">Ultra-Luxury</MenuItem>
                            <MenuItem value="Luxury">Luxury</MenuItem>
                            <MenuItem value="Premium">Premium</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="Total SqFt" type="number" value={input.floorPlateSqFt} onChange={handleChange('floorPlateSqFt')} />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                        <InputLabel sx={{ color: binThemeTokens.textSecondary }}>Investment Strategy</InputLabel>
                        <Select value={input.strategy} label="Investment Strategy" onChange={handleChange('strategy')}>
                            <MenuItem value="rent">Rent Maximization</MenuItem>
                            <MenuItem value="sale">Liquidity Ready</MenuItem>
                            <MenuItem value="fm">Execution Only</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, display: 'block', mb: 1, fontWeight: 900 }}>Vertical Complexity: {input.verticalLevel} Floors</Typography>
                    <Slider 
                        value={input.verticalLevel} 
                        onChange={(_, v) => {
                            if (embeddedMode) updatePropertyData({ floors: v as number });
                            else setInternalInput(p => ({ ...p, verticalLevel: v as number }));
                        }}
                        min={1} max={160}
                        sx={{ color: binThemeTokens.gold }}
                    />
                </Grid>

                <Grid item xs={12}>
                    <Button 
                        fullWidth variant="contained" 
                        size="large"
                        disabled={isCalculating}
                        onClick={handleRunValuation}
                        sx={{ 
                            background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                            color: '#0B0B0C', py: 2, fontWeight: 900, borderRadius: 4,
                            fontSize: '1.2rem',
                            mt: 2
                        }}
                    >
                        {isCalculating ? <CircularProgress size={24} sx={{ color: '#0B0B0C' }} /> : 'GENERATE INSTITUTIONAL QUOTE'}
                    </Button>
                </Grid>
            </Grid>
        </Box>
    );
}
