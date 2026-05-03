import React from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Container,
    Divider,
    Grid,
    Paper,
    Stack,
    Typography,
    alpha
} from '@mui/material';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, ShieldCheck, Info, AlertTriangle } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';

const ReviewBeforeSubmitStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const {
        companyProfile,
        properties,
        portfolioSummary,
        ownerAccount,
        proofDocuments
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const primaryProperty = properties[0];
    const quote = portfolioSummary.quoteResults?.[primaryProperty?.id];
    
    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.review_title')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.56)' }}>
                    {t('onboarding.review_desc')}
                </Typography>
            </Box>

            <Alert icon={<ShieldCheck size={18} />} severity="info" sx={{ mb: 3, bgcolor: 'rgba(198,167,94,0.08)', color: binThemeTokens.gold, border: '1px solid rgba(198,167,94,0.24)' }}>
                {t('onboarding.review_info')}
            </Alert>

            <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('onboarding.owner_company')}</Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{companyProfile.name || 'Private Owner'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{ownerAccount?.fullName || companyProfile.contactPerson}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{ownerAccount?.email || companyProfile.email}</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('onboarding.property_identity')}</Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{t(`onboarding.type.${primaryProperty?.propertyType?.toLowerCase()}`)} · {t('onboarding.zone')} {primaryProperty?.zone}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{primaryProperty?.address || t(`onboarding.emirate.${primaryProperty?.emirate?.toLowerCase()}`)}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>
                            {primaryProperty?.units} {t('onboarding.units')} · {primaryProperty?.sqft} {t('onboarding.sqft')} · {primaryProperty?.age} {t('onboarding.age')}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('onboarding.contract_perf')}</Typography>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{t(`onboarding.plan.${primaryProperty?.strategy === 'fm' ? 'amc' : (primaryProperty?.strategy === 'rent' ? 'pm' : 'ifm')}`)}</Typography>
                            <Chip label={t(`onboarding.sla.${primaryProperty?.slaTier}`)} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.44)', fontWeight: 900, display: 'block', mb: 2 }}>{t('onboarding.pricing_explanation') || 'PRICING EXPLANATION'}</Typography>
                        <Stack spacing={1}>
                            {quote?.pricingExplanation.map((exp, i) => (
                                <Stack key={i} direction="row" spacing={1} alignItems="flex-start" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <CheckCircle2 size={12} color={binThemeTokens.gold} style={{ marginTop: 2 }} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', textAlign: isRTL ? 'right' : 'left' }}>{exp}</Typography>
                                </Stack>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.07), border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('onboarding.financial_recap')}</Typography>
                        <Stack spacing={2} sx={{ mt: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography variant="body2" color="rgba(255,255,255,0.6)">{t('onboarding.annual_val')}</Typography>
                                <Typography variant="body2" fontWeight="950" color="#FFF">AED {formatAED(quote?.annualTotal || 0)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography variant="body2" color="rgba(255,255,255,0.6)">{t(`onboarding.payment.${primaryProperty?.paymentPlan}`)} {t('onboarding.installment')}</Typography>
                                <Typography variant="body2" fontWeight="950" color={binThemeTokens.gold}>
                                    AED {formatAED(primaryProperty?.paymentPlan === 'monthly' ? quote?.monthlyPayment || 0 : (primaryProperty?.paymentPlan === 'quarterly' ? quote?.quarterlyPayment || 0 : quote?.annualTotal || 0))}
                                </Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2 }}>
                                <Typography variant="caption" display="block" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1 }}>{t('onboarding.mobilization_due')}</Typography>
                                <Typography variant="h4" fontWeight="950" color={binThemeTokens.gold}>AED {formatAED(quote?.mobilizationFee || 0)}</Typography>
                            </Box>
                        </Stack>
                    </Paper>
                </Grid>

                {quote?.riskFlags && quote.riskFlags.length > 0 && (
                    <Grid item xs={12}>
                        <Paper sx={{ p: 2, bgcolor: alpha('#EF4444', 0.05), border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 4 }}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <AlertTriangle size={18} color="#EF4444" />
                                <Typography variant="body2" fontWeight="900" color="#EF4444">{t('onboarding.risk_advisory')}: {quote.riskFlags.join(', ')}</Typography>
                            </Stack>
                        </Paper>
                    </Grid>
                )}
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Button variant="outlined" size="large" onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : null} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} sx={{ borderRadius: 100, px: 4, color: '#FFF', borderColor: 'rgba(255,255,255,0.16)' }}>
                    {t('onboarding.back')}
                </Button>
                <Button variant="contained" size="large" onClick={onNext} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                    {t('onboarding.finalize_btn')}
                </Button>
            </Box>
        </Container>
    );
};

export default ReviewBeforeSubmitStep;
