import React from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Container, Divider, Grid, Paper,
    Stack, TextField, Typography, alpha
} from '@mui/material';
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { auth, functions, httpsCallable } from '../../lib/firebase';

const badCopy = (value?: string) => {
    const text = String(value || '').trim();
    return !text || text.includes('.') || /\b(Title|Desc|Btn|Val|Perf)\b/i.test(text);
};
const formatQuoteAED = (amount: number) => amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

const ReviewBeforeSubmitStep: React.FC<{
    onNext: () => void;
    onBack: () => void;
    onEditLocation: () => void;
    onEditProperty: () => void;
    onEditTerms: () => void;
}> = ({ onNext, onBack, onEditLocation, onEditProperty, onEditTerms }) => {
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
    const [ownerPassword, setOwnerPassword] = React.useState('');
    const [restoringSession, setRestoringSession] = React.useState(false);
    const [retryKey, setRetryKey] = React.useState(0);
    const [verifiedQuoteKey, setVerifiedQuoteKey] = React.useState<string | null>(null);

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
        () => JSON.stringify({ ownerUid: ownerAccount?.uid, properties, selectedAddOns: selectedAddOns || [] }),
        [ownerAccount?.uid, properties, selectedAddOns],
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
                    setVerifiedQuoteKey(null);
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
                setVerifiedQuoteKey(`${quoteRequestKey}:${nextQuote.quoteHash}`);
            } catch (error: any) {
                if (!active) return;
                setVerifiedQuoteKey(null);
                setValuationResult({ ...(valuationResult || {}), serverQuote: null, serverQuoteRequestKey: null });
                const code = String(error?.code || '').toLowerCase();
                if (code.includes('unauthenticated')) {
                    setQuoteNeedsSignIn(true);
                    setQuoteError(secureSessionMessage());
                } else if (code.includes('permission-denied')) {
                    setQuoteNeedsSignIn(false);
                    setQuoteError(lang === 'ar'
                        ? 'تعذر التحقق من الحساب كمالك نشط مع بريد إلكتروني مؤكد. تأكد من البريد والدور ثم أعد المحاولة.'
                        : 'The server could not verify an active Owner account with a confirmed email. Check your email verification and Owner access, then retry.');
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

        void issueQuote();
        return () => { active = false; };
    }, [authReady, copy, ownerAccount?.uid, properties, quoteRequestKey, selectedAddOns, secureSessionMessage, signedInUid, retryKey]);

    const restoreOwnerSession = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ownerAccount?.email || !ownerPassword || restoringSession) return;
        setRestoringSession(true);
        setQuoteError('');
        try {
            const credential = await signInWithEmailAndPassword(auth, ownerAccount.email.trim().toLowerCase(), ownerPassword);
            if (credential.user.uid !== ownerAccount.uid) {
                setQuoteError(lang === 'ar' ? 'هذا الحساب لا يطابق المالك المسجل في الطلب.' : 'This account does not match the Owner on this application.');
                return;
            }
            await credential.user.getIdToken(true);
            setSignedInUid(credential.user.uid);
            setQuoteNeedsSignIn(false);
            setRetryKey((value) => value + 1);
        } catch (error: any) {
            setQuoteNeedsSignIn(true);
            setQuoteError(String(error?.code || '').includes('network')
                ? (lang === 'ar' ? 'تعذر الاتصال. تحقق من الشبكة وحاول مجددًا.' : 'Connection failed. Check your network and try again.')
                : (lang === 'ar' ? 'تعذر تسجيل الدخول. تحقق من كلمة مرور المالك وحاول مجددًا.' : 'Sign-in failed. Check the Owner password and try again.'));
        } finally {
            setOwnerPassword('');
            setRestoringSession(false);
        }
    };

    const primaryProperty = properties[0];
    const propertyPin = primaryProperty?.geo;
    const hasPropertyPin = propertyPin?.lat != null && propertyPin?.lng != null
        && Number.isFinite(Number(propertyPin.lat)) && Number.isFinite(Number(propertyPin.lng))
        && Math.abs(Number(propertyPin?.lat)) <= 90 && Math.abs(Number(propertyPin?.lng)) <= 180;
    const allPropertyPinsSaved = properties.length > 0 && properties.every((property) =>
        property.geo?.lat != null && property.geo?.lng != null &&
        Number.isFinite(Number(property.geo.lat)) && Number.isFinite(Number(property.geo.lng)) &&
        Math.abs(Number(property.geo.lat)) <= 90 && Math.abs(Number(property.geo.lng)) <= 180);
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
    const verifiedQuote = authReady && !quoteLoading && !quoteExpired && !quoteError && signedInUid === ownerAccount?.uid
        && valuationResult?.serverQuoteRequestKey === quoteRequestKey
        && verifiedQuoteKey === `${quoteRequestKey}:${serverQuote?.quoteHash}` ? serverQuote : null;
    const preliminaryAnnual = Object.values(portfolioSummary.quoteResults || {}).reduce(
        (total, quote) => total + Number(quote?.annualTotal || 0), 0,
    ) || Number(portfolioSummary.estimatedACV || 0);
    const preliminaryDeposit = Math.round(preliminaryAnnual * 15) / 100;
    const displayedAnnual = verifiedQuote?.annualContractValue ?? preliminaryAnnual;
    const displayedDeposit = verifiedQuote?.activationDeposit ?? preliminaryDeposit;

    const handleNext = () => {
        if (!verifiedQuote) {
            setQuoteError(copy('onboarding.server_quote_expired', 'The server quotation expired. Generate a new quotation before continuing.'));
            return;
        }
        if (!allPropertyPinsSaved) {
            onEditLocation();
            return;
        }
        onNext();
    };

    const handleSignInAgain = () => {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?intendedRole=owner&ownerEmail=${encodeURIComponent(ownerAccount?.email || '')}&returnTo=${encodeURIComponent(returnTo)}`);
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
                {verifiedQuote
                    ? (lang === 'ar'
                        ? `عرض الخادم محمي حتى ${new Date(serverQuote.expiresAtMs).toLocaleTimeString()}. لا يتم تحصيل الدفع الآن؛ تستحق دفعة 15٪ بعد زيارة العقار.`
                        : `Protected server quotation valid until ${new Date(serverQuote.expiresAtMs).toLocaleTimeString()}. No payment is collected now; the 15% mobilisation is due after the property visit.`)
                    : copy('onboarding.review_info', 'Admin will verify the documents and property location during the site-visit workflow.')}
            </Alert>
            {quoteError && <Alert severity="error" sx={{ mb: 3 }} action={!quoteNeedsSignIn ? <Button color="inherit" size="small" onClick={() => setRetryKey((value) => value + 1)}>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry quote'}</Button> : undefined}>{quoteError}</Alert>}
            {quoteNeedsSignIn && ownerAccount?.email && <Box component="form" onSubmit={restoreOwnerSession} sx={{ mb: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                    <TextField type="password" autoComplete="current-password" label={lang === 'ar' ? 'كلمة مرور المالك' : 'Owner password'} value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} size="small" fullWidth />
                    <Button type="submit" variant="contained" disabled={!ownerPassword || restoringSession} sx={{ minWidth: 180 }}>{lang === 'ar' ? 'استعادة الجلسة' : 'Restore session'}</Button>
                    <Button onClick={handleSignInAgain} sx={{ minWidth: 130 }}>{lang === 'ar' ? 'تسجيل الدخول' : 'Sign in again'}</Button>
                </Stack>
            </Box>}
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
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{primaryProperty?.propertyType || 'Property'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{primaryProperty?.address || primaryProperty?.emirate || 'UAE'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{primaryProperty?.area || primaryProperty?.emirate} · {lang === 'ar' ? 'منطقة التسعير' : 'Pricing zone'} {primaryProperty?.zone || '—'}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{primaryProperty?.units} {copy('onboarding.units', 'Units')} · {primaryProperty?.sqft} {copy('onboarding.sqft', 'Sq Ft')}</Typography>
                        <Typography variant="caption" display="block" sx={{ color: hasPropertyPin ? '#4ADE80' : '#FCA5A5' }}>{hasPropertyPin
                            ? (lang === 'ar' ? '✓ تم حفظ علامة العقار، وتنتظر تحقق المسؤول خلال الزيارة' : '✓ Property pin saved; Admin will verify it during the visit')
                            : (lang === 'ar' ? 'علامة موقع العقار مفقودة' : 'Property location pin missing')}</Typography>
                        {!hasPropertyPin && <Button size="small" onClick={onEditLocation} sx={{ mt: 1 }}>{lang === 'ar' ? 'تحديد موقع العقار' : 'Set property location'}</Button>}
                        {properties.length > 1 && <Typography variant="caption" display="block" sx={{ color: allPropertyPinsSaved ? '#4ADE80' : '#FCA5A5' }}>
                            {lang === 'ar' ? `تم حفظ مواقع ${properties.filter((property) => property.geo?.lat != null && property.geo?.lng != null).length} من ${properties.length} عقارات` : `Pins saved for ${properties.filter((property) => property.geo?.lat != null && property.geo?.lng != null).length} of ${properties.length} properties`}
                        </Typography>}
                        {properties.slice(1).map((property, index) => <Typography key={property.id || index} variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.7)' }}>
                            {lang === 'ar' ? `العقار ${index + 2}` : `Property ${index + 2}`}: {property.propertyType} · {property.address || property.emirate} · {property.geo?.lat != null && property.geo?.lng != null ? (lang === 'ar' ? 'العلامة محفوظة' : 'pin saved') : (lang === 'ar' ? 'العلامة مفقودة' : 'pin missing')}
                        </Typography>)}
                        {!allPropertyPinsSaved && hasPropertyPin && <Button size="small" onClick={onEditLocation}>{lang === 'ar' ? 'إكمال مواقع العقارات' : 'Complete property locations'}</Button>}
                        <Button size="small" onClick={onEditProperty} sx={{ mt: 1 }}>{lang === 'ar' ? 'تعديل بيانات العقار' : 'Edit property details'}</Button>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: 'rgba(22,22,24,0.66)', border: '1px solid rgba(255,255,255,0.07)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{lang === 'ar' ? 'نطاق الخدمة المختار' : 'SELECTED SERVICE SCOPE'}</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={1} sx={{ mb: 1, flexDirection: isRTL ? 'row-reverse' : undefined }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{copy(`onboarding.plan.${planKey}`, planFallback)}</Typography>
                            <Chip label={`${lang === 'ar' ? 'مستوى الخدمة' : 'Service level'}: ${copy(`onboarding.sla.${primaryProperty?.slaTier}`, primaryProperty?.slaTier || 'Standard')}`} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                        </Stack>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{lang === 'ar' ? 'الدفع' : 'Billing'}: {copy(`onboarding.payment.${primaryProperty?.paymentPlan}`, primaryProperty?.paymentPlan || 'Annual')}</Typography>
                        {properties.slice(1).map((property, index) => <Typography key={property.id || index} variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.7)' }}>
                            {lang === 'ar' ? `العقار ${index + 2}` : `Property ${index + 2}`}: {copy(`onboarding.plan.${reviewPlanKeyForStrategy(property.strategy)}`, property.strategy || 'Service')} · {copy(`onboarding.sla.${property.slaTier}`, property.slaTier || 'Standard')} · {copy(`onboarding.payment.${property.paymentPlan}`, property.paymentPlan || 'Annual')}
                        </Typography>)}
                        <Button size="small" onClick={onEditTerms} sx={{ mt: 1 }}>{lang === 'ar' ? 'تعديل الخدمة والشروط' : 'Edit service and terms'}</Button>
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
                            {!verifiedQuote && <Alert severity="info">{lang === 'ar' ? 'المبالغ أدناه تقديرية حتى تتم استعادة الجلسة والتحقق من عرض الخادم. لا يمكن التوقيع قبل ذلك.' : 'These amounts are preliminary. Restore your session to verify the server quote before signing.'}</Alert>}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="body2" color="rgba(255,255,255,0.6)">{properties.length > 1 ? (lang === 'ar' ? 'القيمة السنوية للمحفظة' : 'Portfolio annual value') : copy('onboarding.annual_val', 'Annual Value')}</Typography><Typography variant="body2" fontWeight="950" color="#FFF">{displayedAnnual > 0 ? `AED ${formatQuoteAED(displayedAnnual)}` : '—'}</Typography></Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Typography variant="body2" color="rgba(255,255,255,0.6)">{properties.length > 1 ? (lang === 'ar' ? 'الدفعة المختارة للعقار ١' : 'Property 1 schedule') : copy(`onboarding.payment.${primaryProperty?.paymentPlan}`, 'Selected Schedule')}</Typography><Typography variant="body2" fontWeight="950" color={binThemeTokens.gold}>{installmentValue > 0 ? `AED ${formatQuoteAED(installmentValue)}` : '—'}</Typography></Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2 }}><Typography variant="caption" display="block" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1 }}>{lang === 'ar' ? '15٪ مستحقة فقط بعد زيارة العقار' : '15% Due Only After Property Visit'}</Typography><Typography variant="h4" fontWeight="950" color={binThemeTokens.gold}>{displayedDeposit > 0 ? `AED ${formatQuoteAED(displayedDeposit)}` : '—'}</Typography></Box>
                        </Stack>
                    </Paper>
                </Grid>

                {localQuote?.riskFlags && localQuote.riskFlags.length > 0 && (
                    <Grid item xs={12}><Paper sx={{ p: 2, bgcolor: alpha('#EF4444', 0.05), border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4 }}><Stack direction="row" spacing={1} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}><AlertTriangle size={18} color="#EF4444" /><Typography variant="body2" fontWeight="900" color="#EF4444">{copy('onboarding.risk_advisory', 'Inspection Advisory')}: {localQuote.riskFlags.join(', ')}</Typography></Stack></Paper></Grid>
                )}
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Button variant="outlined" size="large" onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : null} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} sx={{ borderRadius: 100, px: 4, color: '#FFF', borderColor: 'rgba(255,255,255,0.16)' }}>{copy('onboarding.back', 'Back')}</Button>
                <Button variant="contained" size="large" onClick={handleNext} disabled={quoteLoading || !verifiedQuote || !allPropertyPinsSaved} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{lang === 'ar' ? 'المتابعة إلى التوقيع' : 'Continue to Signature'}</Button>
            </Box>
        </Container>
    );
};

export default ReviewBeforeSubmitStep;
