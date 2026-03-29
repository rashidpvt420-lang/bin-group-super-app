import { 
    Box, 
    Typography, 
    Button, 
    Stack, 
    Chip, 
    Card, 
    CardContent, 
    Divider, 
    useTheme, 
    Grid, 
    useMediaQuery,
    alpha
} from '@mui/material';
import { CheckCircle, ArrowRight, ArrowLeft, Star, Crown, Shield, Landmark, Gem } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { formatAED } from '../../utils/formatters';

export default function ContractSelectionStep({ onNext, onBack }: { onNext: () => void, onBack: () => void }) {
    const { valuationResult, setSelectedPlan, properties, portfolioSummary } = useOnboardingStore();
    const { t } = useLanguage();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    if (!valuationResult) {
        return (
            <Box sx={{ p: 10, textAlign: 'center' }}>
                <Typography color="error">{t('quote.no_result')}</Typography>
                <Button onClick={onBack}>{t('btn.back')}</Button>
            </Box>
        );
    }

    const { packages, contractRecommendation, portfolioIntelligence } = valuationResult;

    const handleSelect = (pkg: any) => {
        setSelectedPlan(pkg);
        onNext();
    };

    return (
        <Box sx={{ maxWidth: 1300, mx: 'auto' }}>
            <Box sx={{ textAlign: 'center', mb: isMobile ? 4 : 8 }}>
                <Typography variant={isMobile ? "h4" : "h3"} fontWeight="950" sx={{ mb: 2, textTransform: 'uppercase' }}>
                    {t('contract.select_tier')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    {t('contract.subtitle', { count: properties.length })}
                </Typography>
            </Box>

            {/* RECOMMENDATION BANNER */}
            <Box sx={{
                mb: isMobile ? 4 : 8, p: isMobile ? 3 : 4,
                bgcolor: alpha(binThemeTokens.gold, 0.06),
                borderRadius: 8,
                border: `1px solid ${binThemeTokens.gold}44`,
                display: 'flex', gap: isMobile ? 2 : 4, 
                alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                position: 'relative', overflow: 'hidden'
            }}>
                <Box sx={{ p: 2, bgcolor: `${binThemeTokens.gold}22`, borderRadius: 4 }}>
                    <Crown color={binThemeTokens.gold} size={40} />
                </Box>
                <Box flexGrow={1}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block' }}>{t('contract.portfolio_recommendation')}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ mb: 1 }}>{contractRecommendation.recommendedTier}</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                        {(contractRecommendation.recommendedReason || []).map((r: string, i: number) => (
                            <Chip key={i} label={r} size="small" sx={{ bgcolor: alpha('#fff', 0.05), border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }} />
                        ))}
                    </Stack>
                </Box>
                <Box sx={{ textAlign: isMobile ? 'left' : 'right' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mb: 1 }}>{t('contract.analysis_score')}</Typography>
                    <Typography variant={isMobile ? "h4" : "h3"} fontWeight="950" sx={{ color: binThemeTokens.gold }}>{contractRecommendation.score}/100</Typography>
                </Box>
            </Box>

            <Grid container spacing={4} justifyContent="center">
                {packages.map((pkg: any, i: number) => {
                    const isRecommended = pkg.recommended;
                    return (
                        <Grid item xs={12} md={4} key={i}>
                            <Card sx={{ 
                                height: '100%', 
                                position: 'relative', 
                                border: isRecommended ? `2px solid ${binThemeTokens.gold}` : '1px solid rgba(255,255,255,0.05)',
                                bgcolor: isRecommended ? alpha(binThemeTokens.gold, 0.02) : 'background.paper',
                                borderRadius: 10,
                                p: 2,
                                transition: 'all 0.4s',
                                '&:hover': { transform: 'translateY(-10px)', borderColor: binThemeTokens.gold }
                            }}>
                                {isRecommended && (
                                    <Chip label={t('contract.optimal_fit')} size="small" sx={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 2 }} />
                                )}
                                <CardContent sx={{ p: 5 }}>
                                    <Typography variant="h6" sx={{ color: binThemeTokens.gold, mb: 1, fontWeight: 950, letterSpacing: 2 }}>{t(`tier.${pkg.packageName.toLowerCase()}`)}</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, mb: 4, display: 'block' }}>{t('contract.full_portfolio_acv')}</Typography>
                                    
                                    <Box sx={{ mb: 6 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                            <Typography variant="h3" fontWeight="950">
                                                AED {formatAED(pkg.annualPrice)}
                                            </Typography>
                                            <Typography variant="body1" color="text.secondary">/{t('common.yr')}</Typography>
                                        </Box>
                                        <Typography variant="subtitle1" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                                            AED {formatAED(pkg.monthlyPrice)} /{t('common.mo')} ({t('contract.quarterly')})
                                        </Typography>
                                    </Box>

                                    <Divider sx={{ mb: 6 }} />

                                    <Stack spacing={2.5} sx={{ mb: 8 }}>
                                        {pkg.features.map((f: string, j: number) => (
                                            <Box key={j} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                                                <CheckCircle size={20} color={binThemeTokens.gold} style={{ marginTop: 2 }} />
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{f}</Typography>
                                            </Box>
                                        ))}
                                    </Stack>

                                    <Button 
                                        fullWidth variant="contained" 
                                        onClick={() => handleSelect(pkg)}
                                        sx={{ borderRadius: 5, py: 2.5, fontWeight: 950, fontSize: '1.1rem', background: isRecommended ? binThemeTokens.goldGradient : alpha('#fff', 0.05), color: isRecommended ? '#000' : '#fff' }}
                                    >
                                        {t('btn.engage_tier', { tier: t(`tier.${pkg.packageName.toLowerCase()}`) })}
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            {portfolioIntelligence.portfolioDiscount > 0 && (
                <Box sx={{ mt: 6, p: 3, textAlign: 'center', bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 4, border: `1px dashed ${binThemeTokens.gold}` }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <Gem size={16} /> {t('contract.portfolio_savings', { amount: formatAED(portfolioIntelligence.portfolioDiscountAmount) })}
                    </Typography>
                </Box>
            )}

            <Box sx={{ mt: 10, textAlign: 'center' }}>
                <Button variant="text" onClick={onBack} size="large" sx={{ color: 'text.secondary', fontWeight: 700 }}>{t('btn.back_analysis')}</Button>
            </Box>
        </Box>
    );
}
