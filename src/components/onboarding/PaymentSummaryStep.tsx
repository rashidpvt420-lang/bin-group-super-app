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
    Alert,
    Card,
    CardContent,
    Chip
} from '@mui/material';
import { 
    Banknote, 
    Building2, 
    ReceiptText, 
    ShieldCheck, 
    Lock, 
    CheckCircle2, 
    TrendingUp,
    Info,
    ChevronRight,
    Copy
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { createPaymentIntent, verifyPaymentStatus } from '../../lib/paymentService';
import { auth } from '../../lib/firebase';
import { formatAED } from '../../utils/formatters';
import { useLanguage } from '@bin/shared';

const PaymentSummaryStep: React.FC<{ onNext: () => void, onBack: () => void }> = ({ onNext, onBack }) => {
    const { t, isRTL } = useLanguage();
    const { 
        properties,
        valuationResult,
        propertyData, 
        selectedPlan, 
        setPaymentVerified, 
        setPaymentRequested, 
        paymentVerified,
        contractId,
        setContractId,
        paymentMethod,
        setPaymentMethod,
        paymentManifest,
        setPaymentManifest
    } = useOnboardingStore();

    const [isGenerating, setIsGenerating] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const annualTotal = valuationResult?.portfolioIntelligence?.finalAnnualPrice || selectedPlan?.annualPrice || 0;
    const activationDeposit = Math.round(annualTotal * 0.15);
    const totalProperties = properties?.length || 0;
    const baseContractPrice = selectedPlan?.annualPrice || 0;

    const handleGenerateManifest = async (method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER') => {
        setIsGenerating(true);
        setPaymentMethod(method);
        
        try {
            const ownerId = auth.currentUser?.uid || 'anonymous';
            const propertyId = properties?.[0]?.id || 'P-PROT-1';
            
            const result = await createPaymentIntent(method, activationDeposit, propertyId, ownerId);
            
            setContractId(result.contractId);
            setPaymentManifest(result.paymentManifest);
            setPaymentRequested(true);
            
            setSnackbar({ open: true, message: `${t('onboarding.payment.manifest_prefix')} ${method}`, severity: 'success' });
        } catch (error: any) {
            console.error("Manifest Error:", error);
            setSnackbar({ open: true, message: t('onboarding.payment.initiation_error'), severity: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCheckStatus = async () => {
        if (!contractId) return;
        setCheckingStatus(true);

        try {
            const isConfirmed = await verifyPaymentStatus(contractId);
            if (isConfirmed) {
                setPaymentVerified(true);
                setSnackbar({ open: true, message: t('onboarding.payment.verified_success'), severity: 'success' });
            } else {
                setSnackbar({ open: true, message: t('onboarding.payment.awaiting_verification'), severity: 'info' });
            }
        } catch (error) {
            console.error("Verification Breach:", error);
        } finally {
            setCheckingStatus(false);
        }
    };

    const renderManifest = () => {
        if (!paymentManifest) return null;

        const method = paymentMethod;
        return (
            <Box sx={{ mt: 2, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                    {t('onboarding.payment.instructions')}
                </Typography>
                
                <Box sx={{ mt: 2, p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, textTransform: 'uppercase' }}>
                                {method === 'CHEQUE' ? t('onboarding.payment.cheque') : t('onboarding.payment.cash')}
                            </Typography>
                            <Typography variant="body1" fontWeight={700} sx={{ color: binThemeTokens.textPrimary }}>
                                {method === 'CHEQUE' ? paymentManifest.payableTo : paymentManifest.officeLocation}
                            </Typography>
                        </Box>

                        {method === 'CHEQUE' && (
                            <Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, textTransform: 'uppercase' }}>{t('onboarding.payment.verification_note')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary }}>
                                    {t('onboarding.payment.cheque_desc')}
                                </Typography>
                            </Box>
                        )}

                        {method === 'CASH' && (
                            <Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, textTransform: 'uppercase' }}>{t('onboarding.payment.contact_instruction')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary }}>
                                    {t('onboarding.payment.cash_desc')}
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
            <Grid container spacing={4} sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Grid item xs={12} md={7}>
                <Typography variant="h4" fontWeight="900" sx={{ mb: 1, color: binThemeTokens.gold }}>{t('onboarding.payment.title')}</Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>{t('onboarding.payment.portfolio_agreement', { count: totalProperties })}</Typography>
                
                <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(198,167,94,0.1)', backdropFilter: 'blur(10px)', mb: 4 }}>
                    <Typography variant="h6" fontWeight="900" sx={{ mb: 4, letterSpacing: 1, color: binThemeTokens.gold }}>{t('onboarding.payment.agreement_summary')}</Typography>
                    
                    <Stack spacing={3} divider={<Divider sx={{ borderColor: 'rgba(198,167,94,0.1)' }} />}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{selectedPlan?.packageName || 'Asset AMC'}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{t('onboarding.payment.base_amc')}</Typography>
                            </Box>
                            <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>AED {formatAED(baseContractPrice)}</Typography>
                        </Box>

                        <Box sx={{ py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{t('onboarding.payment.total_amc')}</Typography>
                            <Box sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                                <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>AED {formatAED(annualTotal)}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>{t('onboarding.payment.vat_excl')}</Typography>
                            </Box>
                        </Box>
                    </Stack>
                </Paper>

                <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(198, 167, 94, 0.05)', border: '1px solid rgba(198, 167, 94, 0.1)' }}>
                    <Typography variant="h6" fontWeight="900" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, color: binThemeTokens.gold, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <TrendingUp color={binThemeTokens.gold} size={24} /> {t('onboarding.payment.appreciation_title')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.8, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('onboarding.payment.appreciation_desc')}
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
                        <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{t('onboarding.payment.official_settlement')}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 1 }}>{t('onboarding.payment.due_now')}</Typography>
                        <Typography variant="h2" fontWeight="900" sx={{ color: binThemeTokens.goldLight, mt: 1 }}>
                            AED {formatAED(activationDeposit)}
                        </Typography>
                    </Box>

                    {!paymentVerified ? (
                        <>
                            {!paymentManifest ? (
                                <Stack spacing={2}>
                                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 1 }}>
                                        {t('onboarding.payment.generate_manifest')}
                                    </Typography>
                                    

                                    <Button 
                                        variant="outlined" 
                                        fullWidth 
                                        onClick={() => handleGenerateManifest('CHEQUE')}
                                        disabled={isGenerating}
                                        sx={{ 
                                            py: 2, borderRadius: 4, borderColor: 'rgba(198,167,94,0.3)', 
                                            color: binThemeTokens.textPrimary, display: 'flex', justifyContent: 'space-between',
                                            flexDirection: isRTL ? 'row-reverse' : 'row',
                                            '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <ReceiptText size={24} color={binThemeTokens.gold} />
                                            <Typography fontWeight={700}>{t('onboarding.payment.cheque')}</Typography>
                                        </Box>
                                        <ChevronRight size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                    </Button>

                                    <Button 
                                        variant="outlined" 
                                        fullWidth 
                                        onClick={() => handleGenerateManifest('CASH')}
                                        disabled={isGenerating}
                                        sx={{ 
                                            py: 2, borderRadius: 4, borderColor: 'rgba(198,167,94,0.3)', 
                                            color: binThemeTokens.textPrimary, display: 'flex', justifyContent: 'space-between',
                                            flexDirection: isRTL ? 'row-reverse' : 'row',
                                            '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Banknote size={24} color={binThemeTokens.gold} />
                                            <Typography fontWeight={700}>{t('onboarding.payment.cash')}</Typography>
                                        </Box>
                                        <ChevronRight size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                    </Button>

                                    <Button 
                                        variant="outlined" 
                                        fullWidth 
                                        disabled
                                        sx={{ 
                                            py: 2, borderRadius: 4, borderColor: 'rgba(255,255,255,0.05)', 
                                            color: 'rgba(255,255,255,0.3)', display: 'flex', justifyContent: 'space-between',
                                            flexDirection: isRTL ? 'row-reverse' : 'row',
                                            '&.Mui-disabled': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <TrendingUp size={24} color="rgba(255,255,255,0.2)" />
                                            <Typography fontWeight={700}>{t('onboarding.payment.bank_transfer')}</Typography>
                                        </Box>
                                        <Chip label={t('onboarding.payment.coming_soon')} size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }} />
                                    </Button>

                                    {isGenerating && (
                                        <Box sx={{ mt: 2 }}>
                                            <LinearProgress sx={{ borderRadius: 6, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { background: binThemeTokens.gold } }} />
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, mt: 1, display: 'block' }}>{t('onboarding.payment.generating_manifest')}</Typography>
                                        </Box>
                                    )}
                                </Stack>
                            ) : (
                                <Box>
                                    <Paper sx={{ p: 1, bgcolor: 'rgba(198,167,94,0.05)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.2)', mb: 3 }}>
                                        <Typography variant="caption" fontWeight={950} color={binThemeTokens.gold}>{t('onboarding.payment.manifest_prefix')} {paymentMethod}</Typography>
                                    </Paper>
                                    
                                    {renderManifest()}

                                    <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2 }}>
                                        {t('onboarding.payment.initiation_desc')}
                                    </Typography>

                                    <Button 
                                        fullWidth 
                                        variant="contained" 
                                        onClick={handleCheckStatus}
                                        disabled={checkingStatus}
                                        sx={{ 
                                            background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                                            color: '#0B0B0C', py: 2, fontWeight: 950, borderRadius: 4,
                                            boxShadow: '0 10px 20px rgba(198, 167, 94, 0.2)', mb: 2
                                        }}
                                    >
                                        {checkingStatus ? t('onboarding.payment.verifying') : t('onboarding.payment.verify_btn')}
                                    </Button>

                                    {(paymentMethod === 'CASH' || paymentMethod === 'CHEQUE') && (
                                        <Button 
                                            fullWidth 
                                            variant="outlined" 
                                            onClick={onNext}
                                            sx={{ 
                                                py: 2, borderRadius: 4, borderColor: binThemeTokens.gold, 
                                                color: binThemeTokens.gold, fontWeight: 950, mb: 2
                                            }}
                                        >
                                            {t('onboarding.payment.proceed_manual_btn')}
                                        </Button>
                                    )}

                                    <Button 
                                        fullWidth 
                                        variant="text" 
                                        size="small"
                                        onClick={() => setPaymentManifest(null)}
                                        sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}
                                    >
                                        {t('onboarding.payment.change_method')}
                                    </Button>
                                </Box>
                            )}
                        </>
                    ) : (
                        <Box sx={{ p: 4, bgcolor: 'rgba(74,222,128,0.1)', borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)' }}>
                            <CheckCircle2 color="#4ADE80" size={48} style={{ margin: '0 auto 16px' }} />
                            <Typography variant="h5" fontWeight="900" sx={{ color: '#4ADE80', mb: 1 }}>{t('onboarding.payment.verified_title')}</Typography>
                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>
                                {t('onboarding.payment.verified_desc')}
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
                                {t('onboarding.payment.proceed_btn')}
                            </Button>
                        </Box>
                    )}

                    <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, opacity: 0.6 }}>
                        <Lock size={16} color={binThemeTokens.gold} />
                        <Typography variant="caption" sx={{ fontWeight: 900, letterSpacing: 2, color: binThemeTokens.goldLight }}>{t('onboarding.payment.secure_note')}</Typography>
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
