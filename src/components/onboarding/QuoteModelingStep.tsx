import React from 'react';
import { Box, Typography, Button, Stack, Chip, Divider, useTheme, useMediaQuery } from '@mui/material';
import { ArrowRight, ArrowLeft, TrendingUp, ShieldCheck, Sparkles } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../../utils/formatters';

interface Props {
    onNext: () => void;
    onBack: () => void;
}

export default function QuoteModelingStep({ onNext, onBack }: Props) {
    const { valuationResult, propertyData } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    if (!valuationResult) {
        return (
            <Box sx={{ p: 10, textAlign: 'center', direction: isRTL ? 'rtl' : 'ltr' }}>
                <Typography color="error">{t('quote.no_result')}</Typography>
                <Button onClick={onBack}>{t('btn.back')}</Button>
            </Box>
        );
    }

    const { packages, savingsSimulation, benchmark, contractRecommendation } = valuationResult;

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Sparkles color={binThemeTokens.gold} size={28} />
                <Typography variant={isMobile ? "h5" : "h4"} fontWeight="900" sx={{ color: '#FFFFFF', textAlign: isRTL ? 'right' : 'left' }}>
                    {t('quote.summary_title')}
                </Typography>
            </Box>
            <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 6, textAlign: isRTL ? 'right' : 'left' }}>
                {t('quote.subtitle')}
            </Typography>

            {/* EXECUTIVE SUMMARY KPI BAR */}
            <Box sx={{ 
                mb: 6, p: isMobile ? 3 : 4, 
                bgcolor: '#0B0B0C', 
                borderRadius: 8, 
                border: `1px solid ${binThemeTokens.gold}33`,
                display: 'flex', 
                flexDirection: isMobile ? 'column' : (isRTL ? 'row-reverse' : 'row'),
                gap: isMobile ? 4 : 6, 
                justifyContent: 'space-around',
                boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
                background: 'linear-gradient(135deg, #161618 0%, #0B0B0C 100%)'
            }}>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, mb: 1, display: 'block' }}>{t('quote.annual_valuation')}</Typography>
                    <Typography variant={isMobile ? "h4" : "h3"} fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>
                        AED {formatAED(packages?.[1]?.annualPrice)}
                    </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, mb: 1, display: 'block' }}>{t('analysis.efficiency')}</Typography>
                    <Stack direction={isRTL ? "row-reverse" : "row"} alignItems="center" spacing={1} justifyContent="center" sx={{ mt: 1 }}>
                        <TrendingUp color="#4ADE80" size={24} />
                        <Typography variant="h3" fontWeight="900" sx={{ color: '#4ADE80' }}>
                            {savingsSimulation?.efficiencyGain || '0%'}
                        </Typography>
                    </Stack>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, mb: 1, display: 'block' }}>{t('onboarding.payment.asset_class') || 'ASSET CLASS'}</Typography>
                    <Typography variant={isMobile ? "h4" : "h3"} fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>
                        {propertyData?.propertyType === 'GOVERNMENT_MAJLIS' ? t('majlis.government').toUpperCase() : (propertyData?.propertyType || 'ASSET').toUpperCase()}
                    </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, mb: 1, display: 'block' }}>{t('field.grade')}</Typography>
                    <Typography variant={isMobile ? "h4" : "h3"} fontWeight="900" sx={{ color: '#FFFFFF' }}>
                        {t(`grade.${(propertyData?.assetGrade || 'standard').toLowerCase()}`).toUpperCase()}
                    </Typography>
                </Box>
            </Box>

            {/* LIVE SAVINGS PANEL */}
            <Box sx={{
                mb: 6, p: 5,
                background: 'linear-gradient(135deg, rgba(11,11,12,0.98) 0%, rgba(22,22,24,0.95) 100%)',
                borderRadius: 8,
                border: `2px solid ${binThemeTokens.gold}`,
                boxShadow: `0 30px 60px rgba(198,167,94,0.1)`,
            }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 4, display: 'block', letterSpacing: 2, textAlign: isRTL ? 'right' : 'left' }}>
                    {t('quote.savings_simulation')}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isMobile ? 'column' : (isRTL ? 'row-reverse' : 'row'), gap: 4 }}>
                    <Box sx={{ width: isMobile ? '100%' : 'auto', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>{t('quote.market_average')}</Typography>
                        <Typography variant={isMobile ? "h5" : "h4"} sx={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through', fontWeight: 900 }}>
                            AED {formatAED(savingsSimulation?.marketAverageAnnual)}
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center', p: 3, bgcolor: 'rgba(198,167,94,0.05)', borderRadius: 5, border: '1px solid rgba(198,167,94,0.2)', flexGrow: 1, width: isMobile ? '100%' : 'auto' }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mb: 1 }}>{t('quote.estimated_savings')}</Typography>
                        <Typography variant={isMobile ? "h3" : "h2"} sx={{ color: binThemeTokens.goldLight, fontWeight: 950 }}>
                            AED {formatAED(savingsSimulation?.savingsAmount)}
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: isRTL ? 'left' : 'right', width: isMobile ? '100%' : 'auto' }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block' }}>{t('quote.bin_group_total')}</Typography>
                        <Typography variant={isMobile ? "h5" : "h4"} sx={{ color: '#FFFFFF', fontWeight: 900 }}>
                            AED {formatAED(savingsSimulation?.binGroupAnnual)}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* MARKET ALIGNMENT */}
            <Box sx={{ mb: 6, p: 5, bgcolor: 'rgba(11, 11, 12, 0.95)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <Stack direction={isRTL ? "row-reverse" : "row"} alignItems="center" spacing={2} sx={{ mb: 4 }}>
                    <ShieldCheck color={binThemeTokens.gold} size={28} />
                    <Typography variant="h5" fontWeight="900" sx={{ textAlign: isRTL ? 'right' : 'left' }}>{t('quote.market_alignment')}</Typography>
                    <Box flexGrow={1} />
                    <Chip label={benchmark?.alignmentStatus || 'ALIGNED'} sx={{ bgcolor: 'rgba(74,222,128,0.1)', color: '#4ADE80', fontWeight: 900, border: '1px solid rgba(74,222,128,0.3)' }} />
            </Stack>
            <Typography sx={{ color: binThemeTokens.textSecondary, mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
                {benchmark?.benchmarkJustification || 'Verified against institutional market data.'}
            </Typography>
            <Box sx={{ p: 3, bgcolor: 'rgba(0,0,0,0.4)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : (isRTL ? 'row-reverse' : 'row'), gap: 2 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('quote.benchmark_range')}</Typography>
                    <Typography variant="h5" fontWeight="700">AED {formatAED(benchmark?.marketBenchmarkMin)} - {formatAED(benchmark?.marketBenchmarkMax)}</Typography>
                </Box>
                    <Box sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('common.source')}</Typography>
                        <Typography variant="h5" fontWeight="700">{benchmark?.benchmarkSource || 'Sovereign Intelligence'}</Typography>
                    </Box>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mt: 10, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Button variant="text" onClick={onBack} size="large" sx={{ color: binThemeTokens.textSecondary, py: 2, px: 4, fontWeight: 700 }}>{t('btn.back_analysis')}</Button>
                <Box flexGrow={1} />
                <Button 
                    variant="contained" 
                    onClick={onNext}
                    size="large"
                    startIcon={isRTL ? <ArrowLeft /> : null}
                    endIcon={isRTL ? null : <ArrowRight />}
                    sx={{ 
                        background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                        color: binThemeTokens.black,
                        px: 8, py: 2.5, fontWeight: 950, fontSize: '1.2rem',
                        borderRadius: 4
                    }}
                >
                    {t('btn.select_tier')}
                </Button>
            </Box>
        </Box>
    );
}
