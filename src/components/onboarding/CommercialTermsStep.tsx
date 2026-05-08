import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Button, Divider, Chip, Container, RadioGroup, FormControlLabel, Radio 
} from '@mui/material';
import { Wrench, UserCheck, ShieldCheck, ArrowRight, CheckCircle2, XCircle, Info, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { formatAED } from '../../utils/formatters';

const CommercialTermsStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { setSelectedPlan, selectedPlan, properties, updateProperty, calculateSummary, portfolioSummary } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    
    const activePropertyIndex = 0;
    const property = properties[activePropertyIndex];

    useEffect(() => {
        calculateSummary();
    }, [properties]);

    const plans = [
        {
            id: 'FM_ONLY',
            name: t('onboarding.plan.amc'),
            icon: <Wrench size={24} />,
            features: ['MEP coordination', 'Emergency SOS dispatch', 'SLA tracking', 'Completion photos'],
            desc: t('onboarding.plan.amc_desc')
        },
        {
            id: 'PM_ONLY',
            name: t('onboarding.plan.pm'),
            icon: <UserCheck size={24} />,
            features: ['Tenant onboarding', 'Rent/payment tracking', 'Complaint management', 'Owner reporting'],
            desc: t('onboarding.plan.pm_desc')
        },
        {
            id: 'BOTH',
            name: t('onboarding.plan.ifm'),
            icon: <ShieldCheck size={24} />,
            features: ['Maintenance + PM features', 'Priority response', 'Preventive calendar', 'Portfolio Passport'],
            desc: t('onboarding.plan.ifm_desc')
        }
    ];

    const isMajlis = property.majlis || property.propertyType?.toLowerCase() === 'majlis' || property.useType === 'Government';

    // If it's a Majlis, force FM_ONLY and filter out PM/BOTH.
    const availablePlans = isMajlis ? plans.filter(p => p.id === 'FM_ONLY') : plans;

    // Auto-select FM_ONLY for Majlis if not already set or set incorrectly
    useEffect(() => {
        if (isMajlis && property.strategy !== 'fm_only') {
            handleUpdate({ strategy: 'fm_only' });
        }
    }, [isMajlis, property.strategy]);

    const slaTiers = [
        { 
            id: 'standard', 
            label: isMajlis ? 'Majlis Basic Maintenance' : t('onboarding.sla.standard'), 
            desc: isMajlis ? 'Core maintenance for government/private majlis' : t('onboarding.sla.standard_desc') 
        },
        { 
            id: 'premium', 
            label: isMajlis ? 'Majlis Premium Maintenance' : t('onboarding.sla.premium'), 
            desc: isMajlis ? 'Enhanced priority with VIP support' : t('onboarding.sla.premium_desc') 
        },
        { 
            id: 'elite', 
            label: isMajlis ? 'Majlis Elite / Standby Maintenance' : t('onboarding.sla.elite'), 
            desc: isMajlis ? 'Event standby technician, 24/7 dedicated response' : t('onboarding.sla.elite_desc') 
        }
    ];

    const paymentPlans = [
        { id: 'annual', label: t('onboarding.payment.annual'), desc: t('onboarding.payment.annual_desc') },
        { id: 'quarterly', label: t('onboarding.payment.quarterly'), desc: t('onboarding.payment.quarterly_desc') },
        { id: 'monthly', label: t('onboarding.payment.monthly'), desc: t('onboarding.payment.monthly_desc') }
    ];

    const handleUpdate = (data: any) => {
        updateProperty(activePropertyIndex, data);
    };

    const quote = portfolioSummary.quoteResults?.[property?.id];

    return (
        <Box sx={{ py: 2 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.commercial_title')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {t('onboarding.commercial_desc')}
                </Typography>
            </Box>

            <Container maxWidth="xl">
                <Grid container spacing={4}>
                    <Grid item xs={12} lg={8}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', mb: 4 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                1. {t('onboarding.plan_select')}
                            </Typography>
                            <Grid container spacing={2}>
                                {availablePlans.map((plan) => (
                                    <Grid item xs={12} sm={isMajlis ? 12 : 4} key={plan.id}>
                                        <Paper 
                                            onClick={() => handleUpdate({ strategy: plan.id === 'FM_ONLY' ? 'fm_only' : (plan.id === 'PM_ONLY' ? 'pm_only' : 'both') })}
                                            sx={{ 
                                                p: 3, height: '100%', cursor: 'pointer',
                                                bgcolor: (property.strategy === (plan.id === 'FM_ONLY' ? 'fm_only' : (plan.id === 'PM_ONLY' ? 'pm_only' : 'both'))) ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.02)',
                                                border: `2px solid ${(property.strategy === (plan.id === 'FM_ONLY' ? 'fm_only' : (plan.id === 'PM_ONLY' ? 'pm_only' : 'both'))) ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                                                borderRadius: 4, transition: 'all 0.2s ease',
                                                textAlign: 'center'
                                            }}
                                        >
                                            <Box sx={{ color: binThemeTokens.gold, mb: 2, display: 'flex', justifyContent: 'center' }}>{plan.icon}</Box>
                                            <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{isMajlis ? 'MAJLIS MAINTENANCE PROTOCOL' : plan.name}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.58)', display: 'block', mb: 2 }}>{isMajlis ? 'Specialized maintenance, VIP standby & rapid response infrastructure.' : plan.desc}</Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        </Paper>

                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                        2. {t('onboarding.sla_title')}
                                    </Typography>
                                    <RadioGroup value={property.slaTier} onChange={(e) => handleUpdate({ slaTier: e.target.value })}>
                                        {slaTiers.map(tier => (
                                            <FormControlLabel 
                                                key={tier.id} value={tier.id} 
                                                control={<Radio sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />}
                                                label={
                                                    <Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left' }}>
                                                        <Typography variant="subtitle2" fontWeight="900" color="#FFF">{tier.label}</Typography>
                                                        <Typography variant="caption" color="rgba(255,255,255,0.5)">{tier.desc}</Typography>
                                                    </Box>
                                                }
                                                sx={{ 
                                                    mb: 2, p: 1, borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', mr: 0,
                                                    flexDirection: isRTL ? 'row-reverse' : 'row'
                                                }}
                                            />
                                        ))}
                                    </RadioGroup>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                        3. {t('onboarding.payment_title')}
                                    </Typography>
                                    <RadioGroup value={property.paymentPlan} onChange={(e) => handleUpdate({ paymentPlan: e.target.value })}>
                                        {paymentPlans.map(plan => (
                                            <FormControlLabel 
                                                key={plan.id} value={plan.id} 
                                                control={<Radio sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />}
                                                label={
                                                    <Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left' }}>
                                                        <Typography variant="subtitle2" fontWeight="900" color="#FFF">{plan.label}</Typography>
                                                        <Typography variant="caption" color="rgba(255,255,255,0.5)">{plan.desc}</Typography>
                                                    </Box>
                                                }
                                                sx={{ 
                                                    mb: 2, p: 1, borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', mr: 0,
                                                    flexDirection: isRTL ? 'row-reverse' : 'row'
                                                }}
                                            />
                                        ))}
                                    </RadioGroup>
                                </Paper>
                            </Grid>
                        </Grid>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.8)', border: `2px solid ${binThemeTokens.gold}`, position: 'sticky', top: 24 }}>
                            <Box sx={{ textAlign: 'center', mb: 3 }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>{t('onboarding.quote_est')}</Typography>
                                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>
                                    AED {formatAED(quote?.annualTotal || 0)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{t('onboarding.vat_excl')}</Typography>
                            </Box>
                            
                            <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />
                            
                            <Stack spacing={2} sx={{ mb: 4 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Typography variant="body2" color="rgba(255,255,255,0.6)">{t('onboarding.mobilization')}</Typography>
                                    <Typography variant="body2" fontWeight="900" color="#FFF">AED {formatAED(quote?.mobilizationFee || 0)}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Typography variant="body2" color="rgba(255,255,255,0.6)">{t(`onboarding.payment.${property.paymentPlan}`)}</Typography>
                                    <Typography variant="body2" fontWeight="900" color={binThemeTokens.gold}>
                                        AED {formatAED(property.paymentPlan === 'monthly' ? quote?.monthlyPayment || 0 : (property.paymentPlan === 'quarterly' ? quote?.quarterlyPayment || 0 : quote?.annualTotal || 0))}
                                    </Typography>
                                </Box>
                            </Stack>

                            <Button 
                                variant="contained" fullWidth size="large" 
                                onClick={onNext}
                                endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                                sx={{ 
                                    borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2,
                                    boxShadow: '0 10px 20px rgba(198, 167, 94, 0.3)',
                                    '&:hover': { bgcolor: '#E6C77A' }
                                }}
                            >
                                {t('onboarding.confirm_btn')}
                            </Button>
                            <Button variant="text" fullWidth onClick={onBack} sx={{ mt: 1, color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
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
