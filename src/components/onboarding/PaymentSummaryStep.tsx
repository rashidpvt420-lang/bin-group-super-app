import React, { useState } from 'react';
import {
    Box,
    Typography,
    Grid,
    Paper,
    Button,
    Stack,
    Divider,
    LinearProgress,
    Snackbar,
    Alert
} from '@mui/material';
import {
    Banknote,
    ReceiptText,
    ShieldCheck,
    Lock,
    CheckCircle2,
    TrendingUp,
    ChevronRight,
    ArrowLeft
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { formatAED } from '../../utils/formatters';
import { useLanguage } from '@bin/shared';

type PaymentMethod = 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'STRIPE';

const resolveMoney = (...values: unknown[]): number => {
    for (const value of values) {
        const n = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    return 0;
};

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.')) return fallback;
    return value;
};

const PaymentSummaryStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { t, isRTL } = useLanguage();
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
        setPaymentManifest
    } = useOnboardingStore();

    const [isGenerating, setIsGenerating] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const annualTotal = resolveMoney(
        valuationResult?.portfolioIntelligence?.finalAnnualPrice,
        portfolioSummary?.estimatedACV,
        selectedPlan?.annualPrice,
        selectedPlan?.price,
        selectedPlan?.total
    );
    const activationDeposit = annualTotal > 0 ? Math.round(annualTotal * 0.15) : 0;
    const totalProperties = portfolioSummary?.totalProperties || properties?.length || 0;
    const baseContractPrice = resolveMoney(selectedPlan?.annualPrice, selectedPlan?.price, annualTotal);
    const hasValidAmount = annualTotal > 0 && activationDeposit > 0;

    const handleGenerateManifest = async (method: PaymentMethod) => {
        if (!hasValidAmount) {
            setSnackbar({ open: true, message: 'Payment amount is missing. Go back and recalculate the quote before choosing a payment method.', severity: 'error' });
            return;
        }

        setIsGenerating(true);
        setPaymentMethod(method);

        try {
            const reference = `BIN-${properties?.[0]?.id || 'PORTFOLIO'}-${Date.now()}`;
            const manifest = {
                payableTo: 'BIN GROUP / BIN Construction',
                officeLocation: 'BIN GROUP UAE Operations Office',
                amount: activationDeposit,
                annualContractValue: annualTotal,
                activationDeposit,
                method,
                reference,
                currency: 'AED'
            };

            setContractId(`${method}-ONBOARDING-${Date.now()}`);
            setPaymentManifest(manifest);
            setPaymentRequested(true);

            if (method === 'STRIPE') {
                onNext();
                return;
            }

            setSnackbar({ open: true, message: `${readable(t('onboarding.payment.manifest_prefix'), 'Manifest generated')}: ${method}`, severity: 'success' });
        } catch (error: any) {
            console.error('Manifest Error:', error);
            setSnackbar({ open: true, message: readable(t('onboarding.payment.initiation_error'), 'Unable to generate payment manifest.'), severity: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleContinueAfterManualManifest = () => {
        setPaymentVerified(false);
        setPaymentRequested(true);
        onNext();
    };

    const renderManifest = () => {
        if (!paymentManifest) return null;

        const method = paymentMethod;
        return (
            <Box sx={{ mt: 2, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                    {readable(t('onboarding.payment.instructions'), 'Payment instructions')}
                </Typography>

                <Box sx={{ mt: 2, p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, textTransform: 'uppercase' }}>
                                {method === 'CHEQUE' ? readable(t('onboarding.payment.cheque'), 'Cheque') : readable(t('onboarding.payment.cash'), 'Cash')}
                            </Typography>
                            <Typography variant="body1" fontWeight={700} sx={{ color: binThemeTokens.textPrimary }}>
                                {method === 'CHEQUE' ? paymentManifest.payableTo : paymentManifest.officeLocation}
                            </Typography>
                        </Box>

                        <Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, textTransform: 'uppercase' }}>Due now</Typography>
                            <Typography variant="h5" fontWeight={900} sx={{ color: binThemeTokens.goldLight }}>
                                AED {formatAED(paymentManifest.amount || activationDeposit)}
                            </Typography>
                        </Box>

                        <Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, textTransform: 'uppercase' }}>Reference</Typography>
                            <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, wordBreak: 'break-all' }}>
                                {paymentManifest.reference}
                            </Typography>
                        </Box>

                        {method === 'CHEQUE' && (
                            <Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, textTransform: 'uppercase' }}>{readable(t('onboarding.payment.verification_note'), 'Verification note')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary }}>
                                    {readable(t('onboarding.payment.cheque_desc'), 'Upload the cheque proof in the next step. Admin will verify before activation.')}
                                </Typography>
                            </Box>
                        )}

                        {method === 'CASH' && (
                            <Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, textTransform: 'uppercase' }}>{readable(t('onboarding.payment.contact_instruction'), 'Cash instruction')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary }}>
                                    {readable(t('onboarding.payment.cash_desc'), 'Upload the cash payment proof in the next step. Admin will verify before activation.')}
                                </Typography>
                            </Box>
                        )}
                    </Stack>
                </Box>
            </Box>
        );
    };

    return (
        <Box>
            <Stack direction="row" justifyContent={isRTL ? 'flex-end' : 'flex-start'} sx={{ mb: 2 }}>
                <Button
                    variant="outlined"
                    onClick={onBack}
                    startIcon={!isRTL ? <ArrowLeft size={18} /> : undefined}
                    sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.25)', borderRadius: 100, fontWeight: 900 }}
                >
                    {readable(t('onboarding.back'), 'Back')}
                </Button>
            </Stack>

            {!hasValidAmount && (
                <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
                    Payment value is AED 0 because the agreement step is reading an empty pricing source. Go back one step, recalculate the quote, then return here.
                </Alert>
            )}

            <Grid container spacing={4} sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
                <Grid item xs={12} md={7}>
                    <Typography variant="h4" fontWeight="900" sx={{ mb: 1, color: binThemeTokens.gold }}>{readable(t('onboarding.payment.title'), 'Payment Options')}</Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>{readable(t('onboarding.payment.portfolio_agreement', { count: totalProperties }), 'Portfolio Agreement')}</Typography>

                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(198,167,94,0.1)', backdropFilter: 'blur(10px)', mb: 4 }}>
                        <Typography variant="h6" fontWeight="900" sx={{ mb: 4, letterSpacing: 1, color: binThemeTokens.gold }}>{readable(t('onboarding.payment.agreement_summary'), 'Agreement Summary')}</Typography>

                        <Stack spacing={3} divider={<Divider sx={{ borderColor: 'rgba(198,167,94,0.1)' }} />}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{selectedPlan?.packageName || selectedPlan?.name || 'Asset AMC'}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{readable(t('onboarding.payment.base_amc'), 'Base AMC')}</Typography>
                                </Box>
                                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>AED {formatAED(baseContractPrice)}</Typography>
                            </Box>

                            <Box sx={{ py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{readable(t('onboarding.payment.total_amc'), 'Total AMC')}</Typography>
                                <Box sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>AED {formatAED(annualTotal)}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>{readable(t('onboarding.payment.vat_excl'), 'VAT excl')}</Typography>
                                </Box>
                            </Box>
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(198, 167, 94, 0.05)', border: '1px solid rgba(198, 167, 94, 0.1)' }}>
                        <Typography variant="h6" fontWeight="900" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, color: binThemeTokens.gold, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <TrendingUp color={binThemeTokens.gold} size={24} /> {readable(t('onboarding.payment.appreciation_title'), 'Onboarding Notice')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.8, textAlign: isRTL ? 'right' : 'left' }}>
                            {readable(t('onboarding.payment.appreciation_desc'), 'Your portfolio is being onboarded into the Sovereign Engine.')}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Paper sx={{
                        p: 4, borderRadius: 8, bgcolor: '#161618',
                        border: '1px solid rgba(198, 167, 94, 0.2)',
                        position: 'sticky', top: 180,
                        boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
                        textAlign: 'center'
                    }}>
                        <Box sx={{ mb: 4 }}>
                            <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{readable(t('onboarding.payment.official_settlement'), 'Official Settlement')}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 1 }}>{readable(t('onboarding.payment.due_now'), 'Due Now')}</Typography>
                            <Typography variant="h2" fontWeight="900" sx={{ color: binThemeTokens.goldLight, mt: 1 }}>
                                AED {formatAED(activationDeposit)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>
                                15% mobilization against AED {formatAED(annualTotal)} annual value
                            </Typography>
                        </Box>

                        {!paymentVerified ? (
                            <>
                                {!paymentManifest ? (
                                    <Stack spacing={2}>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 1 }}>
                                            {readable(t('onboarding.payment.generate_manifest'), 'Generate Manifest')}
                                        </Typography>

                                        <Button
                                            variant="outlined"
                                            fullWidth
                                            onClick={() => handleGenerateManifest('CHEQUE')}
                                            disabled={isGenerating || !hasValidAmount}
                                            sx={{
                                                py: 2, borderRadius: 4, borderColor: 'rgba(198,167,94,0.3)',
                                                color: binThemeTokens.textPrimary, display: 'flex', justifyContent: 'space-between',
                                                flexDirection: isRTL ? 'row-reverse' : 'row',
                                                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' }
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                <ReceiptText size={24} color={binThemeTokens.gold} />
                                                <Typography fontWeight={700}>{readable(t('onboarding.payment.cheque'), 'Cheque')}</Typography>
                                            </Box>
                                            <ChevronRight size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                        </Button>

                                        <Button
                                            variant="outlined"
                                            fullWidth
                                            onClick={() => handleGenerateManifest('CASH')}
                                            disabled={isGenerating || !hasValidAmount}
                                            sx={{
                                                py: 2, borderRadius: 4, borderColor: 'rgba(198,167,94,0.3)',
                                                color: binThemeTokens.textPrimary, display: 'flex', justifyContent: 'space-between',
                                                flexDirection: isRTL ? 'row-reverse' : 'row',
                                                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' }
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                <Banknote size={24} color={binThemeTokens.gold} />
                                                <Typography fontWeight={700}>{readable(t('onboarding.payment.cash'), 'Cash')}</Typography>
                                            </Box>
                                            <ChevronRight size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                        </Button>

                                        <Button
                                            variant="outlined"
                                            fullWidth
                                            onClick={() => handleGenerateManifest('STRIPE')}
                                            disabled={isGenerating || !hasValidAmount}
                                            sx={{
                                                py: 2, borderRadius: 4, borderColor: 'rgba(198,167,94,0.3)',
                                                color: binThemeTokens.textPrimary, display: 'flex', justifyContent: 'space-between',
                                                flexDirection: isRTL ? 'row-reverse' : 'row',
                                                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' }
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                <ShieldCheck size={24} color={binThemeTokens.gold} />
                                                <Typography fontWeight={700}>{readable(t('onboarding.payment.stripe'), 'Stripe')}</Typography>
                                            </Box>
                                            <ChevronRight size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                        </Button>

                                        {isGenerating && (
                                            <Box sx={{ mt: 2 }}>
                                                <LinearProgress sx={{ borderRadius: 6, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { background: binThemeTokens.gold } }} />
                                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, mt: 1, display: 'block' }}>{readable(t('onboarding.payment.generating_manifest'), 'Generating manifest')}</Typography>
                                            </Box>
                                        )}
                                    </Stack>
                                ) : (
                                    <Box>
                                        <Paper sx={{ p: 1, bgcolor: 'rgba(198,167,94,0.05)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.2)', mb: 3 }}>
                                            <Typography variant="caption" fontWeight={950} color={binThemeTokens.gold}>{readable(t('onboarding.payment.manifest_prefix'), 'Manifest')} {paymentMethod}</Typography>
                                        </Paper>

                                        {renderManifest()}

                                        <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2 }}>
                                            {readable(t('onboarding.payment.initiation_desc'), 'Continue to upload proof and submit the package for admin verification.')}
                                        </Typography>

                                        {(paymentMethod === 'CASH' || paymentMethod === 'CHEQUE') && (
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                onClick={handleContinueAfterManualManifest}
                                                sx={{
                                                    background: 'linear-gradient(135deg, #C6A75E, #E6C77A)',
                                                    color: '#0B0B0C', py: 2, fontWeight: 950, borderRadius: 4,
                                                    boxShadow: '0 10px 20px rgba(198, 167, 94, 0.2)', mb: 2
                                                }}
                                            >
                                                {readable(t('onboarding.payment.proceed_manual_btn'), 'Continue to Submission')}
                                            </Button>
                                        )}

                                        <Button
                                            fullWidth
                                            variant="text"
                                            size="small"
                                            onClick={() => {
                                                setPaymentManifest(null);
                                                setPaymentMethod(null);
                                            }}
                                            sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}
                                        >
                                            {readable(t('onboarding.payment.change_method'), 'Change Method')}
                                        </Button>
                                    </Box>
                                )}
                            </>
                        ) : (
                            <Box sx={{ p: 4, bgcolor: 'rgba(74,222,128,0.1)', borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)' }}>
                                <CheckCircle2 color="#4ADE80" size={48} style={{ margin: '0 auto 16px' }} />
                                <Typography variant="h5" fontWeight="900" sx={{ color: '#4ADE80', mb: 1 }}>{readable(t('onboarding.payment.verified_title'), 'Payment Verified')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>
                                    {readable(t('onboarding.payment.verified_desc'), 'Payment has been verified. Continue to submission.')}
                                </Typography>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    onClick={onNext}
                                    sx={{
                                        background: '#4ADE80', color: '#0B0B0C', py: 2, fontWeight: 950, borderRadius: 3,
                                        '&:hover': { background: '#22c55e' }
                                    }}
                                >
                                    {readable(t('onboarding.payment.proceed_btn'), 'Proceed')}
                                </Button>
                            </Box>
                        )}

                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={onBack}
                            disabled={isGenerating}
                            sx={{ mt: 3, color: '#FFF', borderColor: 'rgba(255,255,255,0.25)', py: 1.5, borderRadius: 4, fontWeight: 950 }}
                        >
                            {readable(t('onboarding.back'), 'Back')}
                        </Button>

                        <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, opacity: 0.6 }}>
                            <Lock size={16} color={binThemeTokens.gold} />
                            <Typography variant="caption" sx={{ fontWeight: 900, letterSpacing: 2, color: binThemeTokens.goldLight }}>{readable(t('onboarding.payment.secure_note'), 'Secure Note')}</Typography>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} sx={{ width: '100%', borderRadius: 3, fontWeight: 700 }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default PaymentSummaryStep;
