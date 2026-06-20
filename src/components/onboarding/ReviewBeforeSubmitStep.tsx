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
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';

const badCopy = (value?: string) => {
    const text = String(value || '').trim();
    return !text || text.includes('.') || /\b(Title|Desc|Btn|Val|Perf)\b/i.test(text);
};

const ReviewBeforeSubmitStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const {
        companyProfile,
        properties,
        portfolioSummary,
        ownerAccount
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const copy = (key: string, fallback: string, variables?: Record<string, any>) => {
        const value = t(key, variables);
        return badCopy(value) ? fallback : value;
    };

    const primaryProperty = properties[0];
    const quote = portfolioSummary.quoteResults?.[primaryProperty?.id];
    const planKey = primaryProperty?.strategy === 'fm' ? 'amc' : (primaryProperty?.strategy === 'rent' ? 'pm' : 'ifm');
    const installmentValue = primaryProperty?.paymentPlan === 'monthly'
        ? quote?.monthlyPayment || 0
        : (primaryProperty?.paymentPlan === 'quarterly' ? quote?.quarterlyPayment || 0 : quote?.annualTotal || 0);

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {copy('onboarding.review_title', 'Review & Confirm')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.56)' }}>
                    {copy('onboarding.review_desc', 'Review the owner profile, property identity, contract scope and financial recap before final payment submission.')}
                </Typography>
            </Box>

            <Alert icon={<ShieldCheck size={18} />} severity="info" sx={{ mb: 3, bgcolor: 'rgba(198,167,94,0.08)', color: binThemeTokens.gold, border: '1px solid rgba(198,167,94,0.24)' }}>
                {copy('onboarding.review_info', 'Review all details carefully. Admin will verify documents, location and payment before dashboard activation.')}
            </Alert>

            <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{copy('onboarding.owner_company', 'Owner Company')}</Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{companyProfile.name || 'Private Owner'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{ownerAccount?.fullName || companyProfile.contactPerson}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{ownerAccount?.email || companyProfile.email}</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{copy('onboarding.property_identity', 'Property Identity')}</Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{copy(`onboarding.type.${primaryProperty?.propertyType?.toLowerCase()}`, primaryProperty?.propertyType || 'Property')} · {copy('onboarding.zone', 'Zone / Area')} {primaryProperty?.zone}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{primaryProperty?.address || primaryProperty?.emirate || 'UAE'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>
                            {primaryProperty?.propertyType === 'Hotel' || primaryProperty?.propertyType === 'Resort'
                                ? `${(primaryProperty as any)?.hotelProfile?.roomsCount || primaryProperty?.rooms || 0} rooms · ${(primaryProperty as any)?.hotelProfile?.starRating || 3}★`
                                : primaryProperty?.propertyType === 'School'
                                ? `${(primaryProperty as any)?.schoolProfile?.classroomsCount || primaryProperty?.units || 0} classrooms · ${(primaryProperty as any)?.schoolProfile?.studentCapacity || 0} students`
                                : primaryProperty?.propertyType === 'Hospital' || primaryProperty?.propertyType === 'Clinic'
                                ? `${(primaryProperty as any)?.hospitalProfile?.bedsCount || (primaryProperty as any)?.beds || 0} beds · ${(primaryProperty as any)?.hospitalProfile?.icuBeds || 0} ICU`
                                : primaryProperty?.propertyType === 'Mosque / Masjid'
                                ? `${(primaryProperty as any)?.mosqueProfile?.maxWorshipperCapacity || primaryProperty?.rooms || 0} capacity · ${(primaryProperty as any)?.mosqueProfile?.wuduAreasCount || primaryProperty?.units || 0} wudu areas`
                                : primaryProperty?.propertyType && ['Stadium', 'Sports Complex', 'Event Venue'].includes(primaryProperty.propertyType)
                                ? `${(primaryProperty as any)?.stadiumProfile?.seatingCapacity?.toLocaleString() || 0} seats`
                                : `${primaryProperty?.units} ${copy('onboarding.units', 'Units')}`
                            } · {primaryProperty?.sqft} {copy('onboarding.sqft', 'Sq Ft')} · {primaryProperty?.age} {copy('onboarding.age', 'Age')}
                        </Typography>
                        {(primaryProperty as any)?.missions?.length > 0 && (
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', mt: 0.5, display: 'block' }}>
                                {((primaryProperty as any)?.missions || []).slice(0, 3).join(' · ')}
                            </Typography>
                        )}
                    </Paper>
                </Grid>

                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{copy('onboarding.contract_perf', 'Contract Performance')}</Typography>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{copy(`onboarding.plan.${planKey}`, planKey === 'ifm' ? 'Maintenance + Property Management' : 'Maintenance Only')}</Typography>
                            <Chip label={copy(`onboarding.sla.${primaryProperty?.slaTier}`, primaryProperty?.slaTier || 'Standard')} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.44)', fontWeight: 900, display: 'block', mb: 2 }}>{copy('onboarding.pricing_explanation', 'Pricing Explanation')}</Typography>
                        <Stack spacing={1}>
                            {quote?.pricingExplanation?.map((exp, i) => (
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
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{copy('onboarding.financial_recap', 'Financial Recap')}</Typography>
                        <Stack spacing={2} sx={{ mt: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography variant="body2" color="rgba(255,255,255,0.6)">{copy('onboarding.annual_val', 'Annual Value')}</Typography>
                                <Typography variant="body2" fontWeight="950" color="#FFF">AED {formatAED(quote?.annualTotal || 0)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography variant="body2" color="rgba(255,255,255,0.6)">{copy(`onboarding.payment.${primaryProperty?.paymentPlan}`, 'Annual')} {copy('onboarding.installment', 'Installment')}</Typography>
                                <Typography variant="body2" fontWeight="950" color={binThemeTokens.gold}>AED {formatAED(installmentValue)}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2 }}>
                                <Typography variant="caption" display="block" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1 }}>{copy('onboarding.mobilization_due', 'Mobilization Due')}</Typography>
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
                                <Typography variant="body2" fontWeight="900" color="#EF4444">{copy('onboarding.risk_advisory', 'Risk Advisory')}: {quote.riskFlags.join(', ')}</Typography>
                            </Stack>
                        </Paper>
                    </Grid>
                )}
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Button variant="outlined" size="large" onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : null} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} sx={{ borderRadius: 100, px: 4, color: '#FFF', borderColor: 'rgba(255,255,255,0.16)' }}>
                    {copy('onboarding.back', 'Back')}
                </Button>
                <Button variant="contained" size="large" onClick={onNext} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                    {copy('onboarding.finalize_btn', 'Finalize Payment')}
                </Button>
            </Box>
        </Container>
    );
};

export default ReviewBeforeSubmitStep;