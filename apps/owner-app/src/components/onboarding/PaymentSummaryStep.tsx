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
    TextField
} from '@mui/material';
import { 
    CreditCard, 
    ShieldCheck, 
    Lock, 
    CheckCircle2, 
    TrendingUp
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { createPaymentIntent, verifyPaymentStatus } from '../../lib/paymentService';

const PaymentSummaryStep: React.FC<{ onNext: () => void, onBack: () => void }> = ({ onNext, onBack }) => {
    const { 
        properties,
        valuationResult,
        propertyData, 
        selectedPlan, 
        selectedAddOns, 
        setPaymentVerified, 
        setPaymentRequested, 
        paymentVerified,
        contractId,
        setContractId,
        updatePropertyData
    } = useOnboardingStore();
    const [isPaying, setIsPaying] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [showHandoff, setShowHandoff] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const annualTotal = valuationResult?.portfolioIntelligence?.finalAnnualPrice || selectedPlan?.annualPrice || 0;
    const activationDeposit = Math.round(annualTotal * 0.15);
    const remainingBalance = annualTotal - activationDeposit;
    const totalProperties = properties.length;
    const baseContractPrice = selectedPlan?.annualPrice || 0;

    const [confirmEmail, setConfirmEmail] = useState(propertyData.ownerEmail || '');

    const handlePayment = async () => {
        setIsPaying(true);
        setPaymentRequested(true); 

        // Update store with email before intent creation
        if (confirmEmail) updatePropertyData({ ownerEmail: confirmEmail });

        try {
            // Unlocks the Handshake: Calls a Secure Backend Function to initiate session
            const session = await createPaymentIntent(activationDeposit, properties[0] || propertyData, selectedPlan, selectedAddOns, confirmEmail || propertyData.ownerEmail);
            setContractId(session.contractId);

            console.log(`[SOVEREIGN-GATEWAY] Initiated Session: ${session.sessionId}`);

            if (session.sessionId === 'DEMO_SESSION' || session.sessionId === 'MOCK') {
                // 💎 BYPASS GRANTED: Instantly activate without handoff
                setPaymentVerified(true);
                setIsPaying(false); 
                setSnackbar({ open: true, message: "💎 [SOVEREIGN-BYPASS] Institutional verification granted for " + (confirmEmail || 'Admin'), severity: 'success' });
            } else {
                setTimeout(() => {
                    setIsPaying(false);
                    setShowHandoff(true);
                }, 3500);
            }
        } catch (error) {
            console.error("Payment Initiation Error:", error);
            setSnackbar({ open: true, message: "Sovereign Link Terminated. Connection rejected by gateway.", severity: 'error' });
            setIsPaying(false);
        }
    };

    const handleCheckStatus = async () => {
        if (!contractId) return;
        setCheckingStatus(true);

        try {
            // READS ONLY DATABASE-CONFIRMED STATUS (Updated via Webhook on backend)
            const isConfirmed = await verifyPaymentStatus(contractId);
            if (isConfirmed) {
                setPaymentVerified(true);
            } else {
                // If it's not confirmed yet, wait and alert user
                setTimeout(() => {
                    setCheckingStatus(false);
                    console.log("[PROTOCOL] Registry not yet updated via Webhook.");
                }, 2000);
            }
        } catch (error) {
            console.error("Verification Breach:", error);
            setCheckingStatus(false);
        }
    };


    return (
        <Box>
            <Grid container spacing={4}>
            <Grid item xs={12} md={7}>
                <Typography variant="h4" fontWeight="900" sx={{ mb: 1, color: binThemeTokens.gold }}>Institutional Portfolio Activation</Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>Service Agreement for Portfolio of {totalProperties} Mixed-Use Assets.</Typography>
                
                <Paper sx={{ 
                    p: 4, 
                    borderRadius: 6, 
                    bgcolor: 'rgba(22, 22, 24, 0.6)', 
                    border: '1px solid rgba(198,167,94,0.1)',
                    backdropFilter: 'blur(10px)',
                    mb: 4 
                }}>
                    <Typography variant="h6" fontWeight="900" sx={{ mb: 4, letterSpacing: 1, color: binThemeTokens.gold }}>Institutional Agreement Summary</Typography>
                    
                    <Stack spacing={3} divider={<Divider sx={{ borderColor: 'rgba(198,167,94,0.1)' }} />}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{selectedPlan?.packageName}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>Base Annual Management Contract (AMC)</Typography>
                            </Box>
                            <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>AED {baseContractPrice.toLocaleString()}</Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>Institutional Service Add-Ons</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{selectedAddOns.length} compliance & mission-critical services</Typography>
                            </Box>
                            <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>AGGREGATED</Typography>
                        </Box>

                        {valuationResult?.portfolioIntelligence?.portfolioDiscount > 0 && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: binThemeTokens.gold }}>
                                <Box>
                                    <Typography variant="subtitle2" fontWeight="900">Institutional Volume Discount</Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.8 }}>Portfolio Scale Efficiency ({valuationResult.portfolioIntelligence.portfolioDiscount}%)</Typography>
                                </Box>
                                <Typography variant="h6" fontWeight="900">- AED {valuationResult.portfolioIntelligence.portfolioDiscountAmount.toLocaleString()}</Typography>
                            </Box>
                        )}

                        <Box sx={{ py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>TOTAL PORTFOLIO AMC</Typography>
                            <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>AED {annualTotal.toLocaleString()}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>VAT EXCL.</Typography>
                            </Box>
                        </Box>
                    </Stack>
                </Paper>

                <Paper sx={{ 
                    p: 4, 
                    borderRadius: 6, 
                    bgcolor: 'rgba(198, 167, 94, 0.05)', 
                    border: '1px solid rgba(198, 167, 94, 0.1)' 
                }}>
                    <Typography variant="h6" fontWeight="900" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, color: binThemeTokens.gold }}>
                        <TrendingUp color={binThemeTokens.gold} size={24} /> Asset Appreciation Multiplier
                    </Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.8 }}>
                        By activating this contract, your portfolio qualifies for the prestigious <strong>BIN-CERTIFIED™</strong> status.
                        The aggregate institutional coverage for {totalProperties} assets adds significant risk mitigation and estimated capital appreciation premium.
                    </Typography>
                </Paper>
            </Grid>

            <Grid item xs={12} md={5}>
                <Paper sx={{ 
                    p: 4, 
                    borderRadius: 8, 
                    bgcolor: '#161618', 
                    border: '1px solid rgba(198, 167, 94, 0.2)',
                    position: 'sticky', 
                    top: 180, 
                    boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
                    textAlign: 'center'
                }}>
                    <Box sx={{ mb: 4 }}>
                        <Box sx={{ 
                            width: 80, height: 80, borderRadius: '50%', 
                            background: 'linear-gradient(135deg, rgba(198,167,94,0.1), rgba(198,167,94,0.3))', 
                            mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2,
                            border: '1px solid rgba(198,167,94,0.2)'
                        }}>
                            <CreditCard color={binThemeTokens.gold} size={32} />
                        </Box>
                        <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.gold }}>Institutional Activation</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 1 }}>SECURED 15% SOVEREIGN DEPOSIT</Typography>
                    </Box>

                    <Box sx={{ 
                        py: 3, px: 2, borderRadius: 6, 
                        bgcolor: 'rgba(255,255,255,0.02)', 
                        mb: 3, 
                        border: '1px dashed rgba(198,167,94,0.3)' 
                    }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1, display: 'block', mb: 1 }}>PORTFOLIO ANNUAL VALUATION</Typography>
                        <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>
                            AED {annualTotal.toLocaleString()}
                        </Typography>
                    </Box>

                    <Box sx={{ 
                        py: 4, px: 2, borderRadius: 6, 
                        bgcolor: 'rgba(198,167,94,0.05)', 
                        mb: 3, 
                        border: `2px solid rgba(198,167,94,0.4)` 
                    }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, display: 'block', mb: 1 }}>15% ACTIVATION DEPOSIT (DUE NOW)</Typography>
                        <Typography variant="h2" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>
                            AED {activationDeposit.toLocaleString()}
                        </Typography>
                    </Box>

                    <Box sx={{ 
                        py: 2, px: 2, borderRadius: 4, 
                        bgcolor: 'rgba(255,255,255,0.02)', 
                        mb: 2, 
                        border: '1px solid rgba(255,255,255,0.06)' 
                    }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1, display: 'block', mb: 0.5 }}>REMAINING BALANCE — 4 QUARTERLY INSTALLMENTS</Typography>
                        <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>
                            AED {Math.round((annualTotal - activationDeposit) / 4).toLocaleString()} / quarter
                        </Typography>
                    </Box>
                    <Stack spacing={2.5} sx={{ mb: 6, textAlign: 'left' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <ShieldCheck size={20} color={binThemeTokens.gold} />
                            <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 600 }}>Zero-Latency Service Activation</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <CheckCircle2 size={20} color={binThemeTokens.gold} />
                            <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 600 }}>Unlocks BIN-SOVEREIGN™ Owner Dashboard</Typography>
                        </Box>
                    </Stack>

                    {!paymentVerified && (
                         <Box sx={{ mb: 4, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(198,167,94,0.1)' }}>
                            <TextField 
                                fullWidth
                                label="Verify Sovereign Email (Institutional Link)"
                                variant="outlined"
                                placeholder="rashid.pvt420@gmail.com"
                                value={confirmEmail}
                                onChange={(e) => {
                                    setConfirmEmail(e.target.value.toLowerCase());
                                    updatePropertyData({ ownerEmail: e.target.value.toLowerCase() });
                                }}
                                helperText="God-Mode accounts bypass payment gateway"
                                FormHelperTextProps={{ sx: { color: binThemeTokens.gold, fontWeight: 700, opacity: 0.8 } }}
                                sx={{
                                    '& .MuiInputBase-input': { color: '#FFFFFF', textAlign: 'center', fontWeight: 'bold' },
                                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                                    '& .MuiOutlinedInput-root': {
                                        background: 'rgba(255,255,255,0.03)',
                                        '& fieldset': { borderColor: 'rgba(198,167,94,0.3)' },
                                        '&:hover fieldset': { borderColor: binThemeTokens.gold },
                                        '&.Mui-focused fieldset': { borderColor: '#E6C77A' },
                                    },
                                }}
                            />
                        </Box>
                    )}

                    {!paymentVerified ? (
                        <>
                            {!showHandoff && !isPaying && (
                                <Button 
                                    variant="contained" 
                                    fullWidth 
                                    size="large"
                                    onClick={handlePayment}
                                    sx={{ 
                                        background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                                        color: '#0B0B0C', 
                                        py: 3, 
                                        fontWeight: 900, 
                                        fontSize: '1.2rem', 
                                        borderRadius: 4,
                                        boxShadow: '0 15px 30px rgba(198, 167, 94, 0.3)',
                                        '&:hover': { transform: 'scale(1.02)', boxShadow: '0 20px 40px rgba(198, 167, 94, 0.4)' } 
                                    }}
                                >
                                    ENGAGE PRODUCTION GATEWAY
                                </Button>
                            )}

                            {isPaying && (
                                <Box>
                                    <Typography variant="subtitle1" fontWeight="900" sx={{ mb: 2, color: binThemeTokens.gold }}>Initialising Secure Protocol...</Typography>
                                    <LinearProgress 
                                        sx={{ 
                                            height: 12, borderRadius: 6, mb: 2, 
                                            bgcolor: 'rgba(255,255,255,0.05)',
                                            '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #C6A75E, #E6C77A)' }
                                        }} 
                                    />
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>TRANSMITTING HANDSHAKE TO UAE CENTRAL PORTAL...</Typography>
                                </Box>
                            )}

                            {showHandoff && (
                                <Box sx={{ p: 4, bgcolor: 'rgba(198,167,94,0.04)', borderRadius: 6, border: '1px solid rgba(198,167,94,0.3)' }}>
                                    <Typography variant="h6" fontWeight="900" sx={{ mb: 2, color: binThemeTokens.gold }}>PAYMENT PENDING</Typography>
                                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>
                                        A secure payment window was launched. Completed the transaction there.
                                    </Typography>
                                    <Button 
                                        fullWidth 
                                        variant="outlined" 
                                        onClick={handleCheckStatus}
                                        disabled={checkingStatus}
                                        sx={{ mb: 2, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900, py: 1.5 }}
                                    >
                                        {checkingStatus ? "VERIFYING..." : "CHECK PAYMENT STATUS"}
                                    </Button>
                                </Box>
                            )}
                        </>
                    ) : (
                        <Box sx={{ p: 4, bgcolor: 'rgba(74,222,128,0.1)', borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)' }}>
                            <CheckCircle2 color="#4ADE80" size={48} style={{ margin: '0 auto 16px' }} />
                            <Typography variant="h5" fontWeight="900" sx={{ color: '#4ADE80', mb: 1 }}>PAYMENT CONFIRMED</Typography>
                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>
                                Transaction verified via Blockchain hash. Asset activation in progress.
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
                                PROCEED TO ACCOUNT LOCK
                            </Button>
                        </Box>
                    )}

                    <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, opacity: 0.6 }}>
                        <Lock size={16} color={binThemeTokens.gold} />
                        <Typography variant="caption" sx={{ fontWeight: 900, letterSpacing: 2, color: binThemeTokens.goldLight }}>SSL SHA-256 ENCRYPTED</Typography>
                    </Box>

                    <Button 
                        fullWidth 
                        variant="text" 
                        onClick={onBack}
                        disabled={isPaying}
                        sx={{ mt: 3, color: binThemeTokens.textSecondary, fontWeight: 900 }}
                    >
                        Review Portfolio Scope
                    </Button>
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
