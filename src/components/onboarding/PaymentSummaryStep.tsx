import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Divider,
    Grid,
    Paper,
    Snackbar,
    Stack,
    Typography,
} from '@mui/material';
import {
    ArrowLeft,
    Banknote,
    CheckCircle2,
    ChevronRight,
    Lock,
    ReceiptText,
    ShieldCheck,
    TrendingUp,
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { formatAED } from '../../utils/formatters';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

type PaymentMethod = 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'STRIPE';

type PaymentConfiguration = {
    version: string;
    effectiveAtMs: number;
    legalBeneficiary: string;
    bankName: string;
    accountNumber: string;
    iban: string;
    swiftBic: string;
    currency: 'AED';
    officeLocation: string;
    approvedMethods: PaymentMethod[];
    configHash: string;
};

const methodDefinitions: Array<{
    method: PaymentMethod;
    icon: React.ReactNode;
    en: string;
    ar: string;
    detailEn?: string;
    detailAr?: string;
}> = [
    { method: 'CHEQUE', icon: <ReceiptText size={24} />, en: 'Cheque', ar: 'شيك' },
    { method: 'CASH', icon: <Banknote size={24} />, en: 'Cash', ar: 'نقداً' },
    {
        method: 'BANK_TRANSFER',
        icon: <Banknote size={24} />,
        en: 'Bank Transfer',
        ar: 'تحويل بنكي',
        detailEn: 'Manual verification',
        detailAr: 'تحقق يدوي',
    },
    { method: 'STRIPE', icon: <ShieldCheck size={24} />, en: 'Secure Card Payment', ar: 'دفع آمن بالبطاقة' },
];

const resolveMoney = (...values: unknown[]): number => {
    for (const value of values) {
        const amount = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(amount) && amount > 0) return Math.round(amount);
    }
    return 0;
};

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.')) return fallback;
    return value;
};

const errorMessage = (error: unknown, fallback: string) => {
    const value = error as { message?: string; details?: string };
    return String(value?.details || value?.message || fallback);
};

const PaymentSummaryStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { t, isRTL } = useLanguage();
    const copy = (en: string, ar: string) => (isRTL ? ar : en);
    const {
        properties,
        valuationResult,
        selectedPlan,
        portfolioSummary,
        setPaymentVerified,
        setPaymentRequested,
        paymentVerified,
        setContractId,
        paymentMethod,
        setPaymentMethod,
        paymentManifest,
        setPaymentManifest,
        calculateSummary,
    } = useOnboardingStore();

    const [isGenerating, setIsGenerating] = useState(false);
    const [configuration, setConfiguration] = useState<PaymentConfiguration | null>(null);
    const [configurationLoading, setConfigurationLoading] = useState(true);
    const [configurationError, setConfigurationError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info';
    }>({ open: false, message: '', severity: 'info' });

    useEffect(() => {
        calculateSummary();
    }, [calculateSummary, properties]);

    useEffect(() => {
        let active = true;
        const loadConfiguration = async () => {
            setConfigurationLoading(true);
            setConfigurationError(null);
            try {
                const callable = httpsCallable(functions, 'getOwnerPaymentConfiguration');
                const result = await callable({});
                const nextConfiguration = result.data as PaymentConfiguration;
                if (
                    !nextConfiguration?.version ||
                    !nextConfiguration?.configHash ||
                    nextConfiguration.currency !== 'AED' ||
                    !Array.isArray(nextConfiguration.approvedMethods)
                ) {
                    throw new Error('The server returned an invalid corporate payment configuration.');
                }
                if (active) setConfiguration(nextConfiguration);
            } catch (error) {
                if (active) {
                    setConfiguration(null);
                    setPaymentManifest(null);
                    setPaymentMethod(null);
                    setConfigurationError(errorMessage(
                        error,
                        copy(
                            'Corporate payment instructions are unavailable. Payment initiation is disabled.',
                            'تعليمات الدفع المؤسسية غير متاحة. تم تعطيل بدء الدفع.',
                        ),
                    ));
                }
            } finally {
                if (active) setConfigurationLoading(false);
            }
        };
        void loadConfiguration();
        return () => { active = false; };
    }, [isRTL, setPaymentManifest, setPaymentMethod]);

    const quote = portfolioSummary?.quoteResults?.[properties?.[0]?.id]
        || Object.values(portfolioSummary?.quoteResults || {})[0];
    const annualTotal = resolveMoney(
        quote?.annualTotal,
        valuationResult?.portfolioIntelligence?.finalAnnualPrice,
        portfolioSummary?.estimatedACV,
        selectedPlan?.annualPrice,
        selectedPlan?.price,
        selectedPlan?.total,
    );
    const activationDeposit = annualTotal > 0 ? Math.round(annualTotal * 0.15) : 0;
    const totalProperties = portfolioSummary?.totalProperties || properties?.length || 0;
    const baseContractPrice = resolveMoney(selectedPlan?.annualPrice, selectedPlan?.price, annualTotal);
    const hasValidAmount = annualTotal > 0 && activationDeposit > 0;
    const approvedMethods = useMemo(
        () => new Set<PaymentMethod>(configuration?.approvedMethods || []),
        [configuration?.approvedMethods],
    );

    const handleGenerateManifest = async (method: PaymentMethod) => {
        if (!hasValidAmount) {
            setSnackbar({
                open: true,
                message: copy(
                    'Payment amount is missing. Recalculate the server quote first.',
                    'مبلغ الدفع غير موجود. أعد احتساب عرض الخادم أولاً.',
                ),
                severity: 'error',
            });
            return;
        }
        if (!configuration || !approvedMethods.has(method)) {
            setSnackbar({
                open: true,
                message: copy(
                    'This payment method is not enabled by the active corporate configuration.',
                    'طريقة الدفع هذه غير مفعلة في الإعداد المؤسسي النشط.',
                ),
                severity: 'error',
            });
            return;
        }

        setIsGenerating(true);
        try {
            const reference = `BIN-${properties?.[0]?.id || 'PORTFOLIO'}-${Date.now()}`;
            const manifest = {
                payableTo: configuration.legalBeneficiary,
                legalBeneficiary: configuration.legalBeneficiary,
                bankName: configuration.bankName,
                accountNumber: configuration.accountNumber,
                iban: configuration.iban,
                swiftBic: configuration.swiftBic,
                officeLocation: configuration.officeLocation,
                amount: activationDeposit,
                annualContractValue: annualTotal,
                activationDeposit,
                method,
                reference,
                currency: configuration.currency,
                configVersion: configuration.version,
                configHash: configuration.configHash,
                configEffectiveAtMs: configuration.effectiveAtMs,
            };

            setPaymentMethod(method);
            setContractId(`${method}-ONBOARDING-${Date.now()}`);
            setPaymentManifest(manifest);
            setPaymentRequested(true);

            if (method === 'STRIPE') {
                onNext();
                return;
            }

            setSnackbar({
                open: true,
                message: copy('Verified payment instructions generated.', 'تم إنشاء تعليمات دفع موثقة.'),
                severity: 'success',
            });
        } catch (error) {
            setSnackbar({
                open: true,
                message: errorMessage(error, copy('Unable to generate payment instructions.', 'تعذر إنشاء تعليمات الدفع.')),
                severity: 'error',
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleContinueAfterManualManifest = () => {
        setPaymentVerified(false);
        setPaymentRequested(true);
        onNext();
    };

    const renderPaymentInstructions = () => {
        if (!paymentManifest || !paymentMethod) return null;
        return (
            <Box sx={{ mt: 2, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                    {copy('Verified payment instructions', 'تعليمات دفع موثقة')}
                </Typography>
                <Paper sx={{ mt: 2, p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Stack spacing={2} divider={<Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />}>
                        <Box>
                            <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Legal beneficiary', 'المستفيد القانوني')}</Typography>
                            <Typography fontWeight={800} color={binThemeTokens.textPrimary}>{paymentManifest.legalBeneficiary}</Typography>
                        </Box>

                        {paymentMethod === 'BANK_TRANSFER' && (
                            <>
                                <Box>
                                    <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Bank', 'البنك')}</Typography>
                                    <Typography fontWeight={800} color={binThemeTokens.textPrimary}>{paymentManifest.bankName}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Account number', 'رقم الحساب')}</Typography>
                                    <Typography fontWeight={800} color={binThemeTokens.textPrimary} sx={{ wordBreak: 'break-all' }}>{paymentManifest.accountNumber}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color={binThemeTokens.textSecondary}>IBAN</Typography>
                                    <Typography fontWeight={800} color={binThemeTokens.textPrimary} sx={{ wordBreak: 'break-all' }}>{paymentManifest.iban}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color={binThemeTokens.textSecondary}>SWIFT / BIC</Typography>
                                    <Typography fontWeight={800} color={binThemeTokens.textPrimary}>{paymentManifest.swiftBic}</Typography>
                                </Box>
                            </>
                        )}

                        {paymentMethod === 'CASH' && (
                            <Box>
                                <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Approved office', 'المكتب المعتمد')}</Typography>
                                <Typography fontWeight={800} color={binThemeTokens.textPrimary}>
                                    {paymentManifest.officeLocation || copy('Contact BIN GROUP before making a cash payment.', 'تواصل مع BIN GROUP قبل الدفع النقدي.')}
                                </Typography>
                            </Box>
                        )}

                        <Box>
                            <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Due now', 'المستحق الآن')}</Typography>
                            <Typography variant="h5" fontWeight={950} color={binThemeTokens.goldLight}>AED {formatAED(paymentManifest.amount || activationDeposit)}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Mandatory reference', 'المرجع الإلزامي')}</Typography>
                            <Typography fontWeight={800} color={binThemeTokens.textPrimary} sx={{ wordBreak: 'break-all' }}>{paymentManifest.reference}</Typography>
                        </Box>
                        <Typography variant="caption" color={binThemeTokens.textSecondary}>
                            {copy('Configuration', 'إصدار الإعداد')}: {paymentManifest.configVersion}
                        </Typography>
                    </Stack>
                </Paper>
            </Box>
        );
    };

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'}>
            <Button
                variant="outlined"
                onClick={onBack}
                startIcon={!isRTL ? <ArrowLeft size={18} /> : undefined}
                sx={{ mb: 3, color: '#FFF', borderColor: 'rgba(255,255,255,0.25)', borderRadius: 100, fontWeight: 900 }}
            >
                {readable(t('onboarding.back'), copy('Back', 'رجوع'))}
            </Button>

            {!hasValidAmount && (
                <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
                    {copy(
                        'Payment value is AED 0. Return to the agreement step and refresh the server quotation.',
                        'قيمة الدفع صفر درهم. ارجع إلى خطوة الاتفاقية وحدّث عرض السعر من الخادم.',
                    )}
                </Alert>
            )}
            {configurationError && <Alert severity="error" sx={{ mb: 3 }}>{configurationError}</Alert>}

            <Grid container spacing={4}>
                <Grid item xs={12} md={7}>
                    <Typography variant="h4" fontWeight={950} sx={{ mb: 1, color: binThemeTokens.gold }}>
                        {readable(t('onboarding.payment.title'), copy('Payment Options', 'خيارات الدفع'))}
                    </Typography>
                    <Typography color={binThemeTokens.textSecondary} sx={{ mb: 4 }}>
                        {copy(`Portfolio agreement for ${totalProperties} propert${totalProperties === 1 ? 'y' : 'ies'}.`, `اتفاقية محفظة لعدد ${totalProperties} من العقارات.`)}
                    </Typography>

                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.6)', border: '1px solid rgba(198,167,94,0.1)', mb: 4 }}>
                        <Typography variant="h6" fontWeight={950} color={binThemeTokens.gold} sx={{ mb: 3 }}>
                            {copy('Agreement Summary', 'ملخص الاتفاقية')}
                        </Typography>
                        <Stack spacing={3} divider={<Divider sx={{ borderColor: 'rgba(198,167,94,0.1)' }} />}>
                            <Box display="flex" justifyContent="space-between" gap={2}>
                                <Box>
                                    <Typography fontWeight={900} color={binThemeTokens.textPrimary}>{selectedPlan?.packageName || selectedPlan?.name || 'Asset AMC'}</Typography>
                                    <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Base annual contract', 'العقد السنوي الأساسي')}</Typography>
                                </Box>
                                <Typography fontWeight={900} color={binThemeTokens.textPrimary}>AED {formatAED(baseContractPrice)}</Typography>
                            </Box>
                            <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
                                <Typography variant="h5" fontWeight={950} color={binThemeTokens.textPrimary}>{copy('Annual value', 'القيمة السنوية')}</Typography>
                                <Typography variant="h3" fontWeight={950} color={binThemeTokens.goldLight}>AED {formatAED(annualTotal)}</Typography>
                            </Box>
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(198,167,94,0.05)', border: '1px solid rgba(198,167,94,0.1)' }}>
                        <Typography variant="h6" fontWeight={950} color={binThemeTokens.gold} display="flex" alignItems="center" gap={1.5}>
                            <TrendingUp size={24} /> {copy('Mandatory Mobilisation Deposit', 'دفعة التجهيز الإلزامية')}
                        </Typography>
                        <Typography color={binThemeTokens.textSecondary} sx={{ mt: 2, lineHeight: 1.8 }}>
                            {copy(
                                'A 15% mobilisation deposit is due upfront for every monthly, quarterly and annual payment plan. The remaining 85% follows the selected schedule.',
                                'تستحق دفعة تجهيز مقدماً بنسبة 15٪ لجميع خطط الدفع الشهرية والربع سنوية والسنوية. ويتم سداد نسبة 85٪ المتبقية وفق الجدول المختار.',
                            )}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 4, borderRadius: 8, bgcolor: '#161618', border: '1px solid rgba(198,167,94,0.2)', position: { md: 'sticky' }, top: 180, textAlign: 'center' }}>
                        <Typography variant="h5" fontWeight={950} color={binThemeTokens.gold}>{copy('Official Settlement', 'التسوية الرسمية')}</Typography>
                        <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Due now', 'المستحق الآن')}</Typography>
                        <Typography variant="h2" fontWeight={950} color={binThemeTokens.goldLight} sx={{ mt: 1 }}>AED {formatAED(activationDeposit)}</Typography>
                        <Typography variant="caption" color={binThemeTokens.textSecondary}>
                            {copy(`15% of AED ${formatAED(annualTotal)} annual value`, `15٪ من القيمة السنوية البالغة ${formatAED(annualTotal)} درهم`)}
                        </Typography>

                        <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.08)' }} />

                        {configurationLoading ? (
                            <Stack alignItems="center" spacing={2} py={3}>
                                <CircularProgress size={28} />
                                <Typography color={binThemeTokens.textSecondary}>{copy('Loading verified payment configuration…', 'جارٍ تحميل إعداد الدفع الموثق…')}</Typography>
                            </Stack>
                        ) : !paymentVerified ? (
                            !paymentManifest ? (
                                <Stack spacing={2}>
                                    {methodDefinitions.map((definition) => {
                                        const allowed = approvedMethods.has(definition.method);
                                        return (
                                            <Button
                                                key={definition.method}
                                                variant="outlined"
                                                fullWidth
                                                onClick={() => void handleGenerateManifest(definition.method)}
                                                disabled={isGenerating || !hasValidAmount || !configuration || !allowed}
                                                sx={{
                                                    py: 2,
                                                    borderRadius: 4,
                                                    borderColor: 'rgba(198,167,94,0.3)',
                                                    color: binThemeTokens.textPrimary,
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' },
                                                }}
                                            >
                                                <Box display="flex" alignItems="center" gap={2} textAlign={isRTL ? 'right' : 'left'}>
                                                    <Box color={binThemeTokens.gold} display="flex">{definition.icon}</Box>
                                                    <Box>
                                                        <Typography fontWeight={800}>{copy(definition.en, definition.ar)}</Typography>
                                                        {definition.detailEn && <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy(definition.detailEn, definition.detailAr || '')}</Typography>}
                                                    </Box>
                                                </Box>
                                                <ChevronRight size={20} style={{ transform: isRTL ? 'rotate(180deg)' : undefined }} />
                                            </Button>
                                        );
                                    })}
                                </Stack>
                            ) : (
                                <Box>
                                    {renderPaymentInstructions()}
                                    {(paymentMethod === 'CASH' || paymentMethod === 'CHEQUE' || paymentMethod === 'BANK_TRANSFER') && (
                                        <Button
                                            fullWidth
                                            variant="contained"
                                            onClick={handleContinueAfterManualManifest}
                                            sx={{ mt: 3, background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', color: '#0B0B0C', py: 2, fontWeight: 950, borderRadius: 4 }}
                                        >
                                            {copy('Continue to Submission', 'متابعة الإرسال')}
                                        </Button>
                                    )}
                                    <Button
                                        fullWidth
                                        variant="text"
                                        onClick={() => { setPaymentManifest(null); setPaymentMethod(null); }}
                                        sx={{ mt: 1, color: binThemeTokens.textSecondary, fontWeight: 900 }}
                                    >
                                        {copy('Change Method', 'تغيير الطريقة')}
                                    </Button>
                                </Box>
                            )
                        ) : (
                            <Box sx={{ p: 4, bgcolor: 'rgba(74,222,128,0.1)', borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)' }}>
                                <CheckCircle2 color="#4ADE80" size={48} />
                                <Typography variant="h5" fontWeight={950} color="#4ADE80" sx={{ mt: 2 }}>{copy('Payment Verified', 'تم التحقق من الدفع')}</Typography>
                                <Button fullWidth variant="contained" onClick={onNext} sx={{ mt: 3, bgcolor: '#4ADE80', color: '#0B0B0C', py: 2, fontWeight: 950 }}>
                                    {copy('Proceed', 'متابعة')}
                                </Button>
                            </Box>
                        )}

                        {isGenerating && <CircularProgress size={22} sx={{ mt: 3 }} />}
                        <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, opacity: 0.7 }}>
                            <Lock size={16} color={binThemeTokens.gold} />
                            <Typography variant="caption" fontWeight={900} color={binThemeTokens.goldLight}>
                                {configuration ? `${copy('Config', 'الإعداد')} ${configuration.version}` : copy('Payments locked', 'المدفوعات مقفلة')}
                            </Typography>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar((current) => ({ ...current, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} sx={{ width: '100%', borderRadius: 3, fontWeight: 700 }}>{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
};

export default PaymentSummaryStep;
