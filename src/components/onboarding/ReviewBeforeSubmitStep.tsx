import React from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Container, Divider, Grid, Paper,
    Stack, Typography, alpha
} from '@mui/material';
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { auth, functions, httpsCallable } from '../../lib/firebase';

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
    quoteHash: string;
    version: string;
    currency: 'AED';
    quotedAtMs: number;
    expiresAtMs: number;
    annualContractValue: number;
    activationDeposit: number;
    remainingAmount: number;
    propertyQuotes: Array<{ propertyId: string; annualTotal: number }>;
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
    const { t, isRTL, lang } = useLanguage();
    const [quoteLoading, setQuoteLoading] = React.useState(false);
    const [quoteError, setQuoteError] = React.useState('');
    const [quoteNeedsSignIn, setQuoteNeedsSignIn] = React.useState(false);
    const [authReady, setAuthReady] = React.useState(false);
    const [signedInUid, setSignedInUid] = React.useState<string | null>(auth.currentUser?.uid || null);

    const copy = React.useCallback((key: string, fallback: string, variables?: Record<string, any>) => {
        const value = t(key, variables);
        return badCopy(value) ? fallback : value;
    }, [t]);

    const secureSessionMessage = React.useCallback(() => (
        lang === 'ar'
            ? 'انتهت جلسة المالك الآمنة أو لم تكتمل استعادتها. سجّل الدخول مرة أخرى للمتابعة من هذه الصفحة.'
            : 'Your secure Owner session has expired or could not be restored. Sign in again to continue from this page.'
    ), [lang]);

    React.useEffect(() => onAuthStateChanged(auth, (user) => {
        setSignedInUid(user?.uid || null);
        setAuthReady(true);
    }), []);

    const quoteRequestKey = React.useMemo(
        () => JSON.stringify({ properties, selectedAddOns: selectedAddOns || [] }),
        [properties, selectedAddOns],
    );
    const serverQuote = valuationResult?.serverQuote as ServerQuote | undefined;

    React.useEffect(() => {
        let active = true;
        const issueQuote = async () => {
            if (!ownerAccount?.uid || properties.length === 0) {
                if (active) {
                    setQuoteNeedsSignIn(false);
                    setQuoteLoading(false);
                    setQuoteError(copy(
                        'onboarding.server_quote_account_required',
                        'A verified Owner account and at least one property are required before Review.',
                    ));
                }
                return;
            }
            if (!authReady) {
                if (active) {
                    setQuoteError('');
                    setQuoteNeedsSignIn(false);
                    setQuoteLoading(true);
                }
                return;
            }
            if (!signedInUid || signedInUid !== ownerAccount.uid || !auth.currentUser) {
                if (active) {
                    setValuationResult({ ...(valuationResult || {}), serverQuote: null, serverQuoteRequestKey: null });
                    setQuoteNeedsSignIn(true);
                    setQuoteLoading(false);
                    setQuoteError(secureSessionMessage());
                }
                return;
            }
            setQuoteLoading(true);
            setQuoteNeedsSignIn(false);
            setQuoteError('');
            try {
                await auth.currentUser.getIdToken(true);
                const callable = httpsCallable(functions, 'previewOwnerInspectionQuote');
                const result = await callable({ properties, selectedAddOns: selectedAddOns || [] });
                if (!active) return;
                const nextQuote = result.data as ServerQuote;
                if (
                    !nextQuote?.quoteHash ||
                    !/^[a-f0-9]{64}$/.test(nextQuote.quoteHash) ||
                    nextQuote.currency !== 'AED' ||
                    nextQuote.annualContractValue <= 0 ||
                    nextQuote.activationDeposit <= 0 ||
                    !nextQuote.quotedAtMs
                ) throw new Error('The server returned an invalid property application quotation.');
                setValuationResult({
                    ...(valuationResult || {}),
                    serverQuote: {
                        ...nextQuote,
                        portfolioAnnualTotal: nextQuote.annualContractValue,
                        mobilisationDeposit: nextQuote.activationDeposit,
                    },
                    serverQuoteRequestKey: quoteRequestKey,
                });
            } catch (error: any) {
                if (!active) return;
                setValuationResult({ ...(valuationResult || {}), serverQuote: null, serverQuoteRequestKey: null });
                const code = String(error?.code || '').toLowerCase();
                if (code.includes('unauthenticated') || code.includes('permission-denied')) {
                    setQuoteNeedsSignIn(true);
                    setQuoteError(secureSessionMessage());
                } else {
                    setQuoteNeedsSignIn(false);
                    setQuoteError(String(error?.details || error?.message || copy(
                        'onboarding.server_quote_failed',
                        'The protected property quotation could not be generated. Review cannot continue.',
                    )));
                }
            } finally {
                if (active) setQuoteLoading(false);
            }
        };

        if (!authReady || valuationResult?.serverQuoteRequestKey !== quoteRequestKey || !serverQuote || serverQuote.expiresAtMs <= Date.now()) void issueQuote();
        return () => { active = false; };
    }, [authReady, copy, ownerAccount?.uid, properties, quoteRequestKey, selectedAddOns, secureSessionMessage, signedInUid]);

    const primaryProperty = properties[0];
    const localQuote = portfolioSummary.quoteResults?.[primaryProperty?.id];
    const serverPropertyAnnual = serverQuote?.propertyQuotes?.find((item) => item.propertyId === primaryProperty?.id)?.annualTotal;
    const planKey = reviewPlanKeyForStrategy(primaryProperty?.strategy);
    const planFallback = planKey === 'amc'
        ? 'Maintenance Only'
        : planKey === 'pm'
            ? 'Property Management Only'
            : 'Maintenance + Property Management';
    const installmentValue = primaryProperty?.paymentPlan === 'monthly'
        ? localQuote?.monthlyPayment || 0
        : (primaryProperty?.paymentPlan === 'quarterly' ? localQuote?.quarterlyPayment || 0 : serverPropertyAnnual || localQuote?.annualTotal || 0);
    const quoteExpired = !serverQuote || serverQuote.expiresAtMs <= Date.now();

    const handleNext = () => {
        if (!serverQuote || quoteExpired) {
            setQuoteError(copy('onboarding.server_quote_expired', 'The server quotation expired. Generate a new quotation before continuing.'));
            return;
        }
        onNext();
    };

    const handleSignInAgain = () => {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?intendedRole=owner&returnTo=${encodeURIComponent(returnTo)}`);
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {copy('onboarding.review_title', 'Review the Five-Page Application')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.56)' }}>
                    {lang === 'ar'
                        ? 'راجع بيانات المالك والعقار والخدمة والمستندات قبل التوقيع والإرسال لزيارة العقار.'
                        : 'Review the Owner, property, service and document details before signing and submitting for the property visit.'}
                </Typography>
            </Box>

            <Alert icon={<ShieldCheck size={18} />} severity="info" sx={{ mb: 3, bgcolor: 'rgba(198,167,94,0.08)', color: binThemeTokens.gold, border: '1px solid rgba(198,167,94,0.24)' }}>
                {serverQuote && !quoteExpired
                    ? (lang === 'ar'
                        ? `عرض الخادم محمي حتى ${new Date(serverQuote.expiresAtMs).toLocaleTimeString()}. لا يتم تحصيل الدفع الآن؛ تستحق دفعة 15٪ بعد زيارة العقار.`
                        : `Protected server quotation valid until ${new Date(serverQuote.expiresAtMs).toLocaleTimeString()}. No payment is collected now; the 15% mobilisation is due after the property visit.`)
                    : copy('onboarding.review_info', 'Admin will verify the documents and property location during the site-visit workflow.')}
            </Alert>
            {quoteError && <Alert severity="error" sx={{ mb: 3 }} action={quoteNeedsSignIn ? <Button color="inherit" size="small" onClick={handleSignInAgain}>{lang === 'ar' ? 'تسجيل الدخول' : 'Sign in again'}</Button> : undefined}>{quoteError}</Alert>}
            {quoteLoading && <Alert severity="warning" icon={<CircularProgress size={18} />} sx={{ mb: 3 }}>{authReady ? copy('onboarding.server_quote_loading', 'Generating the protected server quotation…') : (lang === 'ar' ? 'جارٍ استعادة جلسة المالك الآمنة…' : 'Restoring your secure Owner session…')}</Alert>}

            <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{copy('onboarding.owner_company', 'Owner')}</Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{companyProfile.name || (lang === 'ar' ? 'مالك فردي' : 'Private Owner')}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{ownerAccount?.fullName || companyProfile.contactPerson}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{ownerAccount?.email || companyProfile.email}</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{copy('onboarding.property_identity', 'Property')}</Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{primaryProperty?.propertyType || 'Property'} · {copy('onboarding.zone', 'Zone')} {primaryProperty?.zone}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{primaryProperty?.address || primaryProperty?.emirate || 'UAE'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{primaryProperty?.units} {copy('onboarding.units', 'Units')} · {primaryProperty?.sqft} {copy('onboarding.sqft', 'Sq Ft')}</Typography>
                        <Typography variant="caption" sx={{ color: primaryProperty?.geo?.lat && primaryProperty?.geo?.lng ? '#4ADE80' : '#FCA5A5' }}>{primaryProperty?.geo?.lat && primaryProperty?.geo?.lng ? '✓ GPS captured for Admin verification' : 'GPS location missing'}</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{copy('onboarding.contract_perf', 'Service Scope')}</Typography>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{copy(`onboarding.plan.${planKey}`, planFallback)}</Typography>
                            <Chip label={copy(`onboarding.sla.${primaryProperty?.slaTier}`, primaryProperty?.slaTier || 'Standard')} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                        </Stack>
                        <Stack spacing={1} sx={{ mt: 2 }}>
                            {(localQuote?.pricingExplanation || [
                                lang === 'ar' ? 'تم احتساب العرض من بيانات العقار المقدمة.' : 'Quotation calculated from the submitted property facts.',
                                lang === 'ar' ? 'سيتم التحقق من الموقع والنطاق خلال زيارة العقار.' : 'Location and scope will be verified during the property visit.',
                            ]).map((explanation: string, index: number) => (
                                <Stack key={index} direction="row" spacing={1} alignItems="flex-start" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <CheckCircle2 size={12} color={binThemeTokens.gold} style={{ marginTop: 2 }} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', textAlign: isRTL ? 'right' : 'left' }}>{explanation}</Typography>
                                </Stack>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.07), border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{copy('onboarding.financial_recap', 'Pre-Inspection Quotation')}</Typography>
                        <Stack spacing={2} sx={{ mt: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="body2" color="rgba(255,255,255,0.6)">{copy('onboarding.annual_val', 'Annual Value')}</Typography><Typography variant="body2" fontWeight="950" color="#FFF">AED {formatAED(serverQuote?.annualContractValue || 0)}</Typography></Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="body2" color="rgba(255,255,255,0.6)">{copy(`onboarding.payment.${primaryProperty?.paymentPlan}`, 'Selected Schedule')}</Typography><Typography variant="body2" fontWeight="950" color={binThemeTokens.gold}>AED {formatAED(installmentValue)}</Typography></Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2 }}><Typography variant="caption" display="block" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1 }}>{lang === 'ar' ? '15٪ مستحقة فقط بعد زيارة العقار' : '15% Due Only After Property Visit'}</Typography><Typography variant="h4" fontWeight="950" color={binThemeTokens.gold}>AED {formatAED(serverQuote?.activationDeposit || 0)}</Typography></Box>
                        </Stack>
                    </Paper>
                </Grid>

                {localQuote?.riskFlags && localQuote.riskFlags.length > 0 && (
                    <Grid item xs={12}><Paper sx={{ p: 2, bgcolor: alpha('#EF4444', 0.05), border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4 }}><Stack direction="row" spacing={1} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}><AlertTriangle size={18} color="#EF4444" /><Typography variant="body2" fontWeight="900" color="#EF4444">{copy('onboarding.risk_advisory', 'Inspection Advisory')}: {localQuote.riskFlags.join(', ')}</Typography></Stack></Paper></Grid>
                )}
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Button variant="outlined" size="large" onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : null} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} sx={{ borderRadius: 100, px: 4, color: '#FFF', borderColor: 'rgba(255,255,255,0.16)' }}>{copy('onboarding.back', 'Back')}</Button>
                <Button variant="contained" size="large" onClick={handleNext} disabled={quoteLoading || quoteExpired || Boolean(quoteError)} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{lang === 'ar' ? 'المتابعة إلى التوقيع' : 'Continue to Signature'}</Button>
            </Box>
        </Container>
    );
};

export default ReviewBeforeSubmitStep;