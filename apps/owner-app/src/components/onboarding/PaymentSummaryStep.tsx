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

const PaymentSummaryStep: React.FC<{ onNext: () => void, onBack: () => void }> = ({ onNext, onBack }) => {
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
            
            setSnackbar({ open: true, message: `Payment Manifest Ready: ${method}`, severity: 'success' });
        } catch (error: any) {
            console.error("Manifest Error:", error);
            setSnackbar({ open: true, message: "Protocol Error: Handshake Rejected by Settlement Engine.", severity: 'error' });
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
                setSnackbar({ open: true, message: "PAYMENT VERIFIED: Institutional Registry Updated.", severity: 'success' });
            } else {
                setSnackbar({ open: true, message: "Verification Pending: Awaiting Administrative Settlement.", severity: 'info' });
            }
        } catch (error) {
            console.error("Verification Breach:", error);
        } finally {
            setCheckingStatus(false);
        }
    };

    const copyToClipboard = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setSnackbar({ open: true, message: "Copied to Clipboard", severity: 'success' });
    };

    const renderManifest = () => {
        if (!paymentManifest) return null;

        const { method } = paymentManifest;

        return (
            <Box sx={{ mt: 3, textAlign: 'left' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block' }}>
                    OFFICIAL SETTLEMENT INSTRUCTIONS
                </Typography>
                
                {method === 'BANK_TRANSFER' && (
                    <Stack spacing={2}>
                        <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.1)' }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>BANK NAME</Typography>
                            <Typography variant="body1" fontWeight={700}>{paymentManifest.bankName || 'BIN-GROUP ESCROW'}</Typography>
                        </Box>
                        <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.1)' }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>ACCOUNT NAME</Typography>
                            <Typography variant="body1" fontWeight={700}>{paymentManifest.accountName || 'BIN-GROUP MANAGEMENT LLC'}</Typography>
                        </Box>
                        <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>IBAN</Typography>
                                <Typography variant="body1" fontWeight={700} sx={{ letterSpacing: 1 }}>{paymentManifest.iban || 'AE00 0000 0000 0000 0000 000'}</Typography>
                            </Box>
                            <Button size="small" onClick={() => copyToClipboard(paymentManifest.iban || '')} sx={{ color: binThemeTokens.gold }}><Copy size={16} /></Button>
                        </Box>
                        <Alert severity="info" icon={<Info size={20} />} sx={{ bgcolor: 'rgba(198,167,94,0.05)', color: binThemeTokens.textPrimary, border: '1px solid rgba(198,167,94,0.2)' }}>
                            {paymentManifest.paymentReferenceInstruction || 'Please include your Contract ID in the transfer notes.'}
                        </Alert>
                    </Stack>
                )}

                {method === 'CHEQUE' && (
                    <Stack spacing={2}>
                        <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.1)' }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>PAYABLE TO</Typography>
                            <Typography variant="body1" fontWeight={700}>{paymentManifest.payableTo || 'BIN-GROUP MANAGEMENT LLC'}</Typography>
                        </Box>
                        <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.1)' }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>DROP-OFF LOCATION</Typography>
                            <Typography variant="body1" fontWeight={700}>{paymentManifest.dropOffLocation || 'BIN-GROUP HQ, Dubai'}</Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, mt: 1, display: 'block' }}>
                            {paymentManifest.collectionPolicy || 'Cheques are verified within 2-3 business days.'}
                        </Typography>
                    </Stack>
                )}

                {method === 'CASH' && (
                    <Stack spacing={2}>
                        <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.1)' }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>OFFICE LOCATION</Typography>
                            <Typography variant="body1" fontWeight={700}>{paymentManifest.officeLocation || 'BIN-GROUP HQ, Dubai'}</Typography>
                        </Box>
                        <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.1)' }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>COLLECTION HOURS</Typography>
                            <Typography variant="body1" fontWeight={700}>{paymentManifest.acceptedHours || '09:00 - 18:00'}</Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, mt: 1, display: 'block' }}>
                            {paymentManifest.contactInstruction || 'Please contact our office to schedule a cash deposit.'}
                        </Typography>
                    </Stack>
                )}

                <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(198,167,94,0.1)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.3)' }}>
                    <Typography variant="caption" fontWeight={900} sx={{ color: binThemeTokens.gold, display: 'block', mb: 0.5 }}>FINAL VERIFICATION NOTICE</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary }}>
                        {paymentManifest.verificationNote || 'Activation occurs after manual settlement verification.'}
                    </Typography>
                </Box>
            </Box>
        );
    };

    return (
        <Box>
            <Grid container spacing={4}>
            <Grid item xs={12} md={7}>
                <Typography variant="h4" fontWeight="900" sx={{ mb: 1, color: binThemeTokens.gold }}>Institutional Portfolio Activation</Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>Service Agreement for Portfolio of {totalProperties} Mixed-Use Assets.</Typography>
                
                <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(198,167,94,0.1)', backdropFilter: 'blur(10px)', mb: 4 }}>
                    <Typography variant="h6" fontWeight="900" sx={{ mb: 4, letterSpacing: 1, color: binThemeTokens.gold }}>Institutional Agreement Summary</Typography>
                    
                    <Stack spacing={3} divider={<Divider sx={{ borderColor: 'rgba(198,167,94,0.1)' }} />}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{selectedPlan?.packageName || 'Asset AMC'}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>Base Annual Management Contract (AMC)</Typography>
                            </Box>
                            <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>AED {formatAED(baseContractPrice)}</Typography>
                        </Box>

                        <Box sx={{ py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>TOTAL PORTFOLIO AMC</Typography>
                            <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>AED {formatAED(annualTotal)}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>VAT EXCL.</Typography>
                            </Box>
                        </Box>
                    </Stack>
                </Paper>

                <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(198, 167, 94, 0.05)', border: '1px solid rgba(198, 167, 94, 0.1)' }}>
                    <Typography variant="h6" fontWeight="900" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, color: binThemeTokens.gold }}>
                        <TrendingUp color={binThemeTokens.gold} size={24} /> Asset Appreciation Multiplier
                    </Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.8 }}>
                        By activating this contract, your portfolio qualifies for <strong>BIN-CERTIFIED™</strong> status.
                        Manual administrative settlement ensures sovereign-grade audit compliance for your institutional records.
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
                        <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.gold }}>Official Settlement</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 1 }}>15% ACTIVATION DEPOSIT (DUE NOW)</Typography>
                        <Typography variant="h2" fontWeight="900" sx={{ color: binThemeTokens.goldLight, mt: 1 }}>
                            AED {formatAED(activationDeposit)}
                        </Typography>
                    </Box>

                    {!paymentVerified ? (
                        <>
                            {!paymentManifest ? (
                                <Stack spacing={2}>
                                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 1 }}>
                                        Select a manual payment method to generate your institutional manifest.
                                    </Typography>
                                    

                                    <Button 
                                        variant="outlined" 
                                        fullWidth 
                                        onClick={() => handleGenerateManifest('CHEQUE')}
                                        disabled={isGenerating}
                                        sx={{ 
                                            py: 2, borderRadius: 4, borderColor: 'rgba(198,167,94,0.3)', 
                                            color: binThemeTokens.textPrimary, display: 'flex', justifyContent: 'space-between',
                                            '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <ReceiptText size={24} color={binThemeTokens.gold} />
                                            <Typography fontWeight={700}>Cheque</Typography>
                                        </Box>
                                        <ChevronRight size={20} />
                                    </Button>

                                    <Button 
                                        variant="outlined" 
                                        fullWidth 
                                        onClick={() => handleGenerateManifest('CASH')}
                                        disabled={isGenerating}
                                        sx={{ 
                                            py: 2, borderRadius: 4, borderColor: 'rgba(198,167,94,0.3)', 
                                            color: binThemeTokens.textPrimary, display: 'flex', justifyContent: 'space-between',
                                            '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Banknote size={24} color={binThemeTokens.gold} />
                                            <Typography fontWeight={700}>Cash Deposit</Typography>
                                        </Box>
                                        <ChevronRight size={20} />
                                    </Button>

                                    <Button 
                                        variant="outlined" 
                                        fullWidth 
                                        disabled
                                        sx={{ 
                                            py: 2, borderRadius: 4, borderColor: 'rgba(255,255,255,0.05)', 
                                            color: 'rgba(255,255,255,0.3)', display: 'flex', justifyContent: 'space-between',
                                            '&.Mui-disabled': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <TrendingUp size={24} color="rgba(255,255,255,0.2)" />
                                            <Typography fontWeight={700}>Bank Transfer</Typography>
                                        </Box>
                                        <Chip label="COMING SOON" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }} />
                                    </Button>

                                    {isGenerating && (
                                        <Box sx={{ mt: 2 }}>
                                            <LinearProgress sx={{ borderRadius: 6, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { background: binThemeTokens.gold } }} />
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, mt: 1, display: 'block' }}>GENERATING DEPOSIT MANIFEST...</Typography>
                                        </Box>
                                    )}
                                </Stack>
                            ) : (
                                <Box>
                                    <Paper sx={{ p: 1, bgcolor: 'rgba(198,167,94,0.05)', borderRadius: 2, border: '1px solid rgba(198,167,94,0.2)', mb: 3 }}>
                                        <Typography variant="caption" fontWeight={950} color={binThemeTokens.gold}>MANIFEST: {paymentMethod}</Typography>
                                    </Paper>
                                    
                                    {renderManifest()}

                                    <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2 }}>
                                        Once you have initiated the payment, our administrative team will verify the settlement.
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
                                        {checkingStatus ? "VERIFYING LEDGER..." : "VERIFY PAYMENT STATUS"}
                                    </Button>

                                    <Button 
                                        fullWidth 
                                        variant="text" 
                                        size="small"
                                        onClick={() => setPaymentManifest(null)}
                                        sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}
                                    >
                                        Change Payment Method
                                    </Button>
                                </Box>
                            )}
                        </>
                    ) : (
                        <Box sx={{ p: 4, bgcolor: 'rgba(74,222,128,0.1)', borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)' }}>
                            <CheckCircle2 color="#4ADE80" size={48} style={{ margin: '0 auto 16px' }} />
                            <Typography variant="h5" fontWeight="900" sx={{ color: '#4ADE80', mb: 1 }}>SETTLEMENT VERIFIED</Typography>
                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>
                                Your activation deposit has been confirmed by the BIN-ADMINISTRY™.
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
                        <Typography variant="caption" sx={{ fontWeight: 900, letterSpacing: 2, color: binThemeTokens.goldLight }}>SOVEREIGN SECURE SETTLEMENT</Typography>
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
