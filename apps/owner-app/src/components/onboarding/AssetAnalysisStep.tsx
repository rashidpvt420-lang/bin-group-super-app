import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Stack, Chip, Divider, LinearProgress, Grid, alpha } from '@mui/material';
import { ArrowRight, ShieldCheck, Database, Zap, Binary, Landmark, Building2, Workflow } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useOnboardingStore } from '../../store/onboardingStore';
import { calculatePortfolioValuation } from '../../utils/uaePricingEngine';
import { useLanguage } from '../../context/LanguageContext';

import { db, collection, addDoc, serverTimestamp } from '../../lib/firebase';

export default function AssetAnalysisStep({ onNext }: { onNext: () => void }) {
    const { properties, setValuationResult, portfolioSummary, intakeId, setIntakeId, companyProfile } = useOnboardingStore();
    const [analyzing, setAnalyzing] = useState(true);
    const [progress, setProgress] = useState(0);
    const [analysisLog, setAnalysisLog] = useState<string[]>([]);
    const { t } = useLanguage();

    const logs = [
        t('analysis.log_init'),
        t('analysis.log_batch', { count: properties.length }),
        t('analysis.log_benchmarks'),
        t('analysis.log_mixed'),
        t('analysis.log_compliance'),
        t('analysis.log_volume'),
        t('analysis.log_vault'),
        t('analysis.log_complete')
    ];

    useEffect(() => {
        let current = 0;
        const interval = setInterval(() => {
            if (current < logs.length) {
                setAnalysisLog(prev => [...prev, logs[current]]);
                setProgress(((current + 1) / logs.length) * 100);
                current++;
            } else {
                clearInterval(interval);
                handleCompute();
            }
        }, 800);
        return () => clearInterval(interval);
    }, []);

    const handleCompute = async () => {
        try {
            const res = await calculatePortfolioValuation(properties);
            setValuationResult(res);
            setAnalyzing(false);
        } catch (e) {
            console.error(e);
            setAnalyzing(false);
        }
    };

    if (analyzing) {
        return (
            <Box sx={{ maxWidth: 800, mx: 'auto', py: 8 }}>
                <Box sx={{ textAlign: 'center', mb: 6 }}>
                    <Binary color={binThemeTokens.gold} size={48} className="animate-pulse" />
                    <Typography variant="h3" fontWeight="900" sx={{ mt: 2, mb: 1, color: binThemeTokens.gold, textTransform: 'uppercase' }}>
                        {t('onboarding.analysis')}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                        {t('analysis.synthesizing', { count: properties.length })}
                    </Typography>
                </Box>

                <LinearProgress 
                    variant="determinate" 
                    value={progress} 
                    sx={{ height: 10, borderRadius: 5, mb: 4, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { background: binThemeTokens.goldGradient } }} 
                />

                <Box sx={{ bgcolor: 'rgba(0,0,0,0.4)', p: 4, borderRadius: 4, border: '1px solid rgba(198,167,94,0.1)', fontFamily: 'monospace', minHeight: 300 }}>
                    <Stack spacing={1}>
                        {analysisLog.map((log, i) => (
                            <Typography key={i} variant="body2" sx={{ color: i === analysisLog.length - 1 ? binThemeTokens.gold : 'rgba(255,255,255,0.6)' }}>
                                <Box component="span" sx={{ mr: 2, color: binThemeTokens.gold }}>[{t('common.system')}]</Box>{log}
                            </Typography>
                        ))}
                    </Stack>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
            <Box sx={{ textAlign: 'center', mb: 8 }}>
                <ShieldCheck color="#4ADE80" size={64} style={{ marginBottom: 16 }} />
                <Typography variant="h3" fontWeight="900" sx={{ mb: 2, textTransform: 'uppercase' }}>
                    {t('analysis.classified')}
                </Typography>
                <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 700, letterSpacing: 1.5 }}>
                    {t('analysis.grade_assets', { tier: portfolioSummary.recommendedTier })}
                </Typography>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12} md={4}>
                    <PaperWithLabel label={t('analysis.scale')} icon={<Building2 size={24} />}>
                        <MetricRow label={t('summary.total_props')} value={properties.length} />
                        <MetricRow label={t('summary.total_units')} value={portfolioSummary.totalUnits} />
                        <MetricRow label={t('analysis.managed_area')} value={`${portfolioSummary.totalSqFt.toLocaleString()} ${t('common.sqft')}`} />
                    </PaperWithLabel>
                </Grid>
                
                <Grid item xs={12} md={4}>
                    <PaperWithLabel label={t('analysis.composition')} icon={<Workflow size={24} />}>
                        <MetricRow label={t('type.residential')} value={properties.filter(p => p.propertyType === 'Residential').length} />
                        <MetricRow label={t('type.commercial')} value={properties.filter(p => p.propertyType === 'Commercial' || p.propertyType === 'Mixed-Use').length} />
                        <MetricRow label={t('type.majlis')} value={properties.filter(p => p.propertyType === 'GOVERNMENT_MAJLIS').length} />
                        <MetricRow label={t('type.govt_property')} value={properties.filter(p => p.propertyType === 'GOVERNMENT_PROPERTY').length} />
                        <MetricRow label={t('type.hotel')} value={properties.filter(p => p.propertyType === 'HOTEL').length} />
                    </PaperWithLabel>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Box sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 6, border: `2px solid ${binThemeTokens.gold}`, height: '100%' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Zap size={18} /> {t('analysis.efficiency')}
                        </Typography>
                        <Typography variant="h2" fontWeight="900" sx={{ mb: 2 }}>
                            {properties.length >= 20 ? '15%' : properties.length >= 7 ? '10%' : properties.length >= 3 ? '5%' : '0%'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {t('analysis.efficiency_desc')}
                        </Typography>
                        {portfolioSummary.isSovereignPortfolio && (
                            <Chip 
                                icon={<Landmark size={14} />} 
                                label={t('onboarding.sovereign_protocol')} 
                                sx={{ mt: 3, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} 
                            />
                        )}
                    </Box>
                </Grid>
            </Grid>

            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <Button 
                    variant="contained" 
                    onClick={onNext}
                    size="large"
                    endIcon={<ArrowRight />}
                    sx={{ px: 8, py: 2.5, fontWeight: 900, fontSize: '1.2rem', borderRadius: 4, background: binThemeTokens.goldGradient, color: '#000' }}
                >
                    {t('btn.quote')}
                </Button>
            </Box>
        </Box>
    );
}

const PaperWithLabel: React.FC<{ label: string, icon: any, children: any }> = ({ label, icon, children }) => (
    <Box sx={{ p: 4, bgcolor: 'background.paper', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', height: '100%' }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon} {String(label)}
        </Typography>
        <Stack spacing={2}>{children}</Stack>
    </Box>
);

const MetricRow: React.FC<{ label: string, value: string | number }> = ({ label, value }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: 'text.secondary' }}>{label}</Typography>
        <Typography fontWeight="700">{value}</Typography>
    </Box>
);
