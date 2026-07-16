import React from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
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
import { functions, httpsCallable } from '../../lib/firebase';
import { ownerPortfolioQuoteRequest } from '../../utils/ownerPortfolioQuotePayload';

const badCopy = (value?: string) => {
    const text = String(value || '').trim();
    return !text || text.includes('.') || /\b(Title|Desc|Btn|Val|Perf)\b/i.test(text);
};

export const reviewPlanKeyForStrategy = (strategy?: string) => {
    if (strategy === 'fm_only' || strategy === 'fm') return 'amc';
    if (strategy === 'pm_only' || strategy === 'rent') return 'pm';
    return 'ifm';
};

type ServerQuote = {
    quoteId: string;
    quoteHash: string;
    inputHash: string;
    quoteSchemaVersion: string;
    pricingEngineVersion: string;
    issuedAtMs: number;
    expiresAtMs: number;
    currency: 'AED';
    portfolioAnnualTotal: number;
    mobilisationDeposit: number;
    propertyQuotes: Array<{ propertyId: string; output: any }>;
};

const ReviewBeforeSubmitStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const {
        companyProfile,
        properties,
        portfolioSummary,
        ownerAccount,
        selectedAddOns,
        valuationResult,
        setValuationResult,
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const [quoteLoading, setQuoteLoading] = React.useState(false);
    const [quoteError, setQuoteError] = React.useState('');
    const [validating, setValidating] = React.useState(false);

    const copy = (key: string, fallback: string, variables?: Record<string, any>) => {
        const value = t(key, variables);
        return badCopy(value) ? fallback : value;
    };

    const quoteRequest = React.useMemo(
        () => ownerPortfolioQuoteRequest(properties, selectedAddOns || []),
        [properties, selectedAddOns],
    );
    const quoteRequestKey = React.useMemo(() => JSON.stringify(quoteRequest), [quoteRequest]);
    const serverQuote = valuationResult?.serverQuote as ServerQuote | undefined;

    React.useEffect(() => {
        let active = true;
        const issueQuote = async () => {
            if (!ownerAccount?.uid || quoteRequest.properties.length === 0) {
                if (active) setQuoteError(copy(
                    'onboarding.server_quote_account_required',
                    'A verified owner account and at least one property are required before pricing.',
                ));
                return;
            }
            setQuoteLoading(true);
            setQuoteError('');
            try {
                const callable = httpsCallable(functions, 'issueOwnerPortfolioQuote');
                const result = await callable(quoteRequest);
                if (!active) return;
                const nextQuote = result.data as ServerQuote;
                if (!nextQuote?.quoteId || !nextQuote?.quoteHash || !nextQuote?.inputHash || nextQuote.currency !== 'AED') {
                    throw new Error('The server returned an invalid portfolio quote.');
                }
                setValuationResult({ ...(valuationResult || {}), serverQuote: nextQuote, serverQuoteRequestKey: quoteRequestKey });
            } catch (error: any) {
                if (!active) return;
                setValuationResult({ ...(valuationResult || {}), serverQuote: null, serverQuoteRequestKey: null });
                setQuoteError(String(error?.details || error?.message || copy(
                    'onboarding.server_quote_failed',
                    'The server quote could not be generated. Review cannot continue.',
                )));
            } finally {
                if (active) setQuoteLoading(false);
            }
        };

        if (valuationResult?.serverQuoteRequestKey !== quoteRequestKey || !serverQuote || serverQuote.expiresAtMs <= Date.now()) {
            void issueQuote();
        }
        return () => { active = false; };
    }, [ownerAccount?.uid, quoteRequestKey]);

    const primaryProperty = properties[0];
    const serverPropertyQuote = serverQuote?.propertyQuotes?.find((item) => item.propertyId === primaryProperty?.id)?.output;
    const quote = serverPropertyQuote || portfolioSummary.quoteResults?.[primaryProperty?.id];
    const planKey = reviewPlanKeyForStrategy(primaryProperty?.strategy);
    const planFallback = planKey === 'amc'
        ? 'Maintenance Only'
        : planKey === 'pm'
            ? 'Property Management Only'
            : 'Maintenance + Property Management';
    const installmentValue = primaryProperty?.paymentPlan === 'monthly'
        ? quote?.monthlyPayment || 0
        : (primaryProperty?.paymentPlan === 'quarterly' ? quote?.quarterlyPayment || 0 : quote?.annualTotal || 0);
    const quoteExpired = !serverQuote || serverQuote.expiresAtMs <= Date.now();

    const handleNext = async () => {
        if (!serverQuote || quoteExpired) {
            setQuoteError(copy('onboarding.server_quote_expired', 'The server quote expired. Generate a new quote before continuing.'));
            return;
        }
        setValidating(true);
        setQuoteError('');
        try {
            const callable = httpsCallable(functions, 'validateOwnerPortfolioQuote');
            await callable({
                quoteId: serverQuote.quoteId,
                quoteHash: serverQuote.quoteHash,
                inputHash: serverQuote.inputHash,
                portfolioAnnualTotal: serverQuote.portfolioAnnualTotal,
                mobilisationDeposit: serverQuote.mobilisationDeposit,
            });
            onNext();
        } catch (error: any) {
            setQuoteError(String(error?.details || error?.message || copy(
                'onboarding.server_quote_validation_failed',
                'Server quote validation failed. Generate a new quote before continuing.',
            )));
        } finally {
            setValidating(false);
        }
    };

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
                {serverQuote && !quoteExpired
                    ? copy('onboarding.server_quote_verified', `Server quote verified · Expires ${new Date(serverQuote.expiresAtMs).toLocaleTimeString()}`)
                    : copy('onboarding.review_info', 'Review all details carefully. Admin will verify documents, location and payment before dashboard activation.')}
            </Alert>
            {quoteError && <Alert severity="error" sx={{ mb: 3 }}>{quoteError}</Alert>}
            {quoteLoading && <Alert severity="warning" icon={<CircularProgress size={18} />} sx={{ mb: 3 }}>{copy('onboarding.server_quote_loading', 'Generating the protected server quote…')}</Alert>}

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
                            {primaryProperty?.units} {copy('onboarding.units', 'Units')} · {primaryProperty?.sqft} {copy('onboarding.sqft', 'Sq Ft')} · {primaryProperty?.age} {copy('onboarding.age', 'Age')}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{copy('onboarding.contract_perf', 'Contract Performance')}</Typography>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{copy(`onboarding.plan.${planKey}`, planFallback)}</Typography>
                            <Chip label={copy(`onboarding.sla.${primaryProperty?.slaTier}`, primaryProperty?.slaTier || 'Standard')} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.44)', fontWeight: 900, display: 'block', mb: 2 }}>{copy('onboarding.pricing_explanation', 'Pricing Explanation')}</Typography>
                        <Stack spacing={1}>
                            {quote?.pricingExplanation?.map((exp: string, i: number) => (
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
                                <Typography variant="body2" color="rgba(255,255,255,0.6)">{copy('onboarding.annual_val', 'Portfolio Annual Value')}</Typography>
                                <Typography variant="body2" fontWeight="950" color="#FFF">AED {formatAED(serverQuote?.portfolioAnnualTotal || 0)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography variant="body2" color="rgba(255,255,255,0.6)">{copy(`onboarding.payment.${primaryProperty?.paymentPlan}`, 'Annual')} {copy('onboarding.installment', 'Installment')}</Typography>
                                <Typography variant="body2" fontWeight="950" color={binThemeTokens.gold}>AED {formatAED(installmentValue)}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2 }}>
                                <Typography variant="caption" display="block" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1 }}>{copy('onboarding.mobilization_due', '15% Mobilisation Due')}</Typography>
                                <Typography variant="h4" fontWeight="950" color={binThemeTokens.gold}>AED {formatAED(serverQuote?.mobilisationDeposit || 0)}</Typography>
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
                <Button
                    variant="contained"
                    size="large"
                    onClick={() => void handleNext()}
                    disabled={quoteLoading || validating || quoteExpired || Boolean(quoteError)}
                    endIcon={validating ? <CircularProgress size={18} /> : (isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />)}
                    sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                >
                    {copy('onboarding.finalize_btn', 'Continue to Contract')}
                </Button>
            </Box>
        </Container>
    );
};

export default ReviewBeforeSubmitStep;
