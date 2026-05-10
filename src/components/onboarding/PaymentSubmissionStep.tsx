import React, { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Divider,
    Grid,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { ArrowLeft, CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    auth,
    functions,
    getDownloadURL,
    httpsCallable,
    ref,
    storage,
    uploadBytes
} from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor } from '../../utils/geoAnchor';

const PaymentSubmissionStep: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const navigate = useNavigate();
    const {
        properties,
        selectedPlan,
        selectedAddOns,
        portfolioSummary,
        companyProfile,
        ownerAccount,
        onboardingSessionId,
        proofDocuments,
        paymentMethod,
        setPaymentMethod,
        setIntakeId,
        reset
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submissionResult, setSubmissionResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const estimatedAnnualValue = portfolioSummary?.estimatedACV || (portfolioSummary?.totalUnits || 1) * 2500;
    const mobilizationAmount = Math.round(estimatedAnnualValue * 0.15);
    
    const handleSubmit = async () => {
        if (!ownerAccount?.uid) {
            setError(t('onboarding.error.acc_required') || 'Account creation is required before payment submission.');
            return;
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            setError(t('onboarding.error.session_expired') || 'Your session expired. Please sign in again.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const submissionId = `${currentUser.uid}_${onboardingSessionId}`;
            const submitOwnerOnboarding = httpsCallable(functions, 'submitOwnerOnboarding');
            
            const submissionPayload = JSON.parse(JSON.stringify({
                idempotencyKey: submissionId,
                onboardingSessionId,
                ownerAccount,
                companyProfile,
                properties,
                selectedPlan,
                selectedAddOns,
                portfolioSummary,
                pricing: {
                    annualContractValue: estimatedAnnualValue,
                    mobilizationAmount,
                    currency: 'AED'
                },
                payment: {
                    method: paymentMethod,
                    amount: mobilizationAmount,
                    currency: 'AED'
                }
            }));

            const result = await submitOwnerOnboarding(submissionPayload);
            const response = result.data as any;
            setSubmissionResult(response);
            setIntakeId(response?.intakeId || submissionId);
            setSubmitted(true);
        } catch (err: any) {
            setError(err?.message || 'Onboarding submission failed.');
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
                <CheckCircle2 size={88} color="#10b981" style={{ marginBottom: 24 }} />
                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                    {t('onboarding.submission_secured')}
                </Typography>
                <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.62)', mb: 4 }}>
                    {t('onboarding.dashboard_locked_info')}
                </Typography>
                <Button
                    variant="contained"
                    onClick={() => {
                        reset();
                        navigate('/owner/dashboard');
                    }}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 5, py: 1.5 }}
                >
                    {t('onboarding.go_dashboard')}
                </Button>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.payment_submission')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {t('onboarding.payment_confirm_desc')}
                </Typography>
            </Box>

            <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.62)', border: '1px solid rgba(255,255,255,0.06)', textAlign: isRTL ? 'right' : 'left' }}>
                        <Stack spacing={3}>
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('onboarding.selected_contract')}</Typography>
                                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{selectedPlan?.name || 'Institutional Package'}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('onboarding.portfolio_addons')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF' }}>{t('onboarding.total_assets')}: {properties.length}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">{t('onboarding.annual_val')}</Typography>
                                    <Typography variant="h6" fontWeight="950" color="#FFF">{formatAED(estimatedAnnualValue)}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">{t('onboarding.mobilization_due')}</Typography>
                                    <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{formatAED(mobilizationAmount)}</Typography>
                                </Grid>
                            </Grid>
                            <TextField select fullWidth label={t('onboarding.payment_method')} value={paymentMethod || ''} onChange={(e) => setPaymentMethod(e.target.value as any)} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                <MenuItem value="BANK_TRANSFER">{t('onboarding.bank_transfer')}</MenuItem>
                                <MenuItem value="CHEQUE">{t('onboarding.corp_cheque')}</MenuItem>
                                <MenuItem value="CASH">{t('onboarding.cash_payment')}</MenuItem>
                            </TextField>
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(198,167,94,0.06)', border: `1px solid ${binThemeTokens.gold}`, textAlign: isRTL ? 'right' : 'left' }}>
                        <Stack spacing={2}>
                            <ShieldCheck color={binThemeTokens.gold} size={32} />
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{t('onboarding.admin_lock_title')}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                                {t('onboarding.admin_lock_desc')}
                            </Typography>
                            {error && <Alert severity="error">{error}</Alert>}
                            <Button
                                variant="contained"
                                fullWidth
                                disabled={submitting}
                                onClick={handleSubmit}
                                sx={{ mt: 2, py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                            >
                                {submitting ? t('onboarding.submitting') : t('onboarding.submit_btn')}
                            </Button>
                            <Button onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : null} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} sx={{ color: 'rgba(255,255,255,0.52)', fontWeight: 800 }}>
                                {t('onboarding.back')}
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
};

export default PaymentSubmissionStep;
