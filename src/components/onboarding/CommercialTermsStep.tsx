import React, { useEffect } from 'react';
import {
    Box, Typography, Grid, Paper, alpha, Stack, Button, Divider, Container, RadioGroup, FormControlLabel, Radio
} from '@mui/material';
import { Wrench, UserCheck, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { formatAED } from '../../utils/formatters';

const CommercialTermsStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty, calculateSummary, portfolioSummary } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const activePropertyIndex = 0;
    const property = properties[activePropertyIndex] || ({} as any);

    useEffect(() => {
        calculateSummary();
    }, [properties, calculateSummary]);

    const plans = [
        {
            id: 'FM_ONLY',
            strategy: 'fm_only',
            name: t('onboarding.plan.amc'),
            icon: <Wrench size={24} />,
            desc: t('onboarding.plan.amc_desc')
        },
        {
            id: 'PM_ONLY',
            strategy: 'pm_only',
            name: t('onboarding.plan.pm'),
            icon: <UserCheck size={24} />,
            desc: t('onboarding.plan.pm_desc')
        },
        {
            id: 'BOTH',
            strategy: 'both',
            name: t('onboarding.plan.ifm'),
            icon: <ShieldCheck size={24} />,
            desc: t('onboarding.plan.ifm_desc')
        }
    ];

    const propertyType = String(property.propertyType || '').toLowerCase();
    const isMajlis = Boolean(property.majlis || propertyType.includes('majlis') || property.useType === 'Government');
    const availablePlans = isMajlis ? plans.filter(p => p.id === 'FM_ONLY') : plans;

    useEffect(() => {
        if (isMajlis && property.strategy !== 'fm_only') {
            updateProperty(activePropertyIndex, { strategy: 'fm_only' });
        }
    }, [isMajlis, property.strategy, updateProperty]);

    const slaTiers = [
        {
            id: 'standard',
            label: isMajlis ? t('onboarding.sla.majlis_basic') : t('onboarding.sla.standard'),
            desc: isMajlis ? t('onboarding.sla.majlis_basic_desc') : t('onboarding.sla.standard_desc')
        },
        {
            id: 'premium',
            label: isMajlis ? t('onboarding.sla.majlis_premium') : t('onboarding.sla.premium'),
            desc: isMajlis ? t('onboarding.sla.majlis_premium_desc') : t('onboarding.sla.premium_desc')
        },
        {
            id: 'elite',
            label: isMajlis ? t('onboarding.sla.majlis_elite') : t('onboarding.sla.elite'),
            desc: isMajlis ? t('onboarding.sla.majlis_elite_desc') : t('onboarding.sla.elite_desc')
        }
    ];

    const paymentPlans = [
        { id: 'annual', label: t('onboarding.payment.annual'), desc: t('onboarding.payment.annual_desc') },
        { id: 'quarterly', label: t('onboarding.payment.quarterly'), desc: t('onboarding.payment.quarterly_desc') },
        { id: 'monthly', label: t('onboarding.payment.monthly'), desc: t('onboarding.payment.monthly_desc') }
    ];

    const handleUpdate = (data: any) => updateProperty(activePropertyIndex, data);
    const quote = portfolioSummary.quoteResults?.[property?.id] || Object.values(portfolioSummary.quoteResults || {})[0];
    const selectedStrategy = property.strategy || 'fm_only';
    const selectedPaymentPlan = property.paymentPlan || 'annual';
    const isAnnualPayment = selectedPaymentPlan === 'annual';
    const selectedPaymentAmount = selectedPaymentPlan === 'monthly'
        ? quote?.monthlyPayment || 0
        : selectedPaymentPlan === 'quarterly'
            ? quote?.quarterlyPayment || 0
            : quote?.annualTotal || 0;
    const selectedPaymentLabel = isAnnualPayment ? 'Full annual payment' : t(`onboarding.payment.${selectedPaymentPlan}`);

    return (
        <Box sx={{ py: 2 }} dir={isRTL ? 'rtl' : 'ltr'}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.commercial_title')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 820, mx: 'auto' }}>
                    {t('onboarding.commercial_desc')}
                </Typography>
            </Box>

            <Container maxWidth="xl">
                <Grid container spacing={4}>
                    <Grid item xs={12} lg={8}>
                        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', mb: 4 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>
                                1. {t('onboarding.plan_select')}
                            </Typography>
                            <Grid container spacing={2}>
                                {availablePlans.map((plan) => {
                                    const isSelected = selectedStrategy === plan.strategy;
                                    return (
                                        <Grid item xs={12} sm={isMajlis ? 12 : 4} key={plan.id}>
                                            <Paper
                                                onClick={() => handleUpdate({ strategy: plan.strategy })}
                                                sx={{
                                                    p: 3,
                                                    height: '100%',
                                                    cursor: 'pointer',
                                                    bgcolor: isSelected ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.02)',
                                                    border: `2px solid ${isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                                                    borderRadius: 4,
                                                    transition: 'all 0.2s ease',
                                                    textAlign: 'center'
                                                }}
                                            >
                                                <Box sx={{ color: binThemeTokens.gold, mb: 2, display: 'flex', justifyContent: 'center' }}>{plan.icon}</Box>
                                                <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                                                    {isMajlis ? t('onboarding.plan.majlis') : plan.name}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)', display: 'block', lineHeight: 1.7 }}>
                                                    {isMajlis ? t('onboarding.plan.majlis_desc') : plan.desc}
                                                </Typography>
                                            </Paper>
                                        </Grid>
                                    );
                                })}
                            </Grid>
                        </Paper>

                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>
                                        2. {t('onboarding.sla_title')}
                                    </Typography>
                                    <RadioGroup value={property.slaTier || 'standard'} onChange={(e) => handleUpdate({ slaTier: e.target.value })}>
                                        {slaTiers.map(tier => (
                                            <FormControlLabel
                                                key={tier.id} value={tier.id}
                                                control={<Radio sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />}
                                                label={
                                                    <Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left' }}>
                                                        <Typography variant="subtitle2" fontWeight="900" color="#FFF">{tier.label}</Typography>
                                                        <Typography variant="caption" color="rgba(255,255,255,0.58)" sx={{ lineHeight: 1.65 }}>{tier.desc}</Typography>
                                                    </Box>
                                                }
                                                sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', mr: 0, flexDirection: isRTL ? 'row-reverse' : 'row' }}
                                            />
                                        ))}
                                    </RadioGroup>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>
                                        3. {t('onboarding.payment_title')}
                                    </Typography>
                                    <RadioGroup value={selectedPaymentPlan} onChange={(e) => handleUpdate({ paymentPlan: e.target.value })}>
                                        {paymentPlans.map(plan => (
                                            <FormControlLabel
                                                key={plan.id} value={plan.id}
                                                control={<Radio sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />}
                                                label={
                                                    <Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left' }}>
                                                        <Typography variant="subtitle2" fontWeight="900" color="#FFF">{plan.label}</Typography>
                                                        <Typography variant="caption" color="rgba(255,255,255,0.58)" sx={{ lineHeight: 1.65 }}>{plan.desc}</Typography>
                                                    </Box>
                                                }
                                                sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', mr: 0, flexDirection: isRTL ? 'row-reverse' : 'row' }}
                                            />
                                        ))}
                                    </RadioGroup>
                                </Paper>
                            </Grid>
                        </Grid>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.8)', border: `2px solid ${binThemeTokens.gold}`, position: { lg: 'sticky' }, top: 24 }}>
                            <Box sx={{ textAlign: 'center', mb: 3 }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>{t('onboarding.quote_est')}</Typography>
                                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>
                                    AED {formatAED(quote?.annualTotal || 0)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{t('onboarding.vat_excl')}</Typography>
                            </Box>

                            <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />

                            <Stack spacing={2} sx={{ mb: 4 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2 }}>
                                    <Typography variant="body2" color="rgba(255,255,255,0.6)">{selectedPaymentLabel}</Typography>
                                    <Typography variant="body2" fontWeight="900" color={binThemeTokens.gold}>AED {formatAED(selectedPaymentAmount)}</Typography>
                                </Box>

                                {isAnnualPayment ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2 }}>
                                        <Typography variant="body2" color="rgba(255,255,255,0.6)">{t('onboarding.mobilization')}</Typography>
                                        <Typography variant="body2" fontWeight="900" color="rgba(255,255,255,0.72)">Included</Typography>
                                    </Box>
                                ) : (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2 }}>
                                        <Typography variant="body2" color="rgba(255,255,255,0.6)">{t('onboarding.mobilization')}</Typography>
                                        <Typography variant="body2" fontWeight="900" color="#FFF">AED {formatAED(quote?.mobilizationFee || 0)}</Typography>
                                    </Box>
                                )}
                            </Stack>

                            <Button
                                variant="contained" fullWidth size="large"
                                onClick={onNext}
                                endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                                sx={{ borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, boxShadow: '0 10px 20px rgba(198, 167, 94, 0.3)', '&:hover': { bgcolor: '#E6C77A' } }}
                            >
                                {t('onboarding.confirm_btn')}
                            </Button>
                            <Button variant="text" fullWidth onClick={onBack} sx={{ mt: 1, color: 'rgba(255,255,255,0.45)', fontWeight: 800 }}>
                                {t('onboarding.revise_btn')}
                            </Button>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default CommercialTermsStep;
