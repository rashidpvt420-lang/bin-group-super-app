import React, { useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Button, Divider, 
    CircularProgress, Alert, Container 
} from '@mui/material';
import { ShieldCheck, CreditCard, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { db, collection, addDoc, serverTimestamp } from '../../lib/firebase';
import { formatAED } from '../../utils/formatters';
import ContractDigitalSignature from '../ContractDigitalSignature';

const AdminSubmissionStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
    const { 
        properties, selectedPlan, portfolioSummary, intakeId, setIntakeId, 
        companyProfile, setPaymentVerified 
    } = useOnboardingStore();
    const { tx, isRTL } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [showSignature, setShowSignature] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [signedData, setSignedData] = useState<any>(null);

    // [V3] CALCULATION LOGIC: 15% Upfront Mobilization
    const estimatedAMC = (portfolioSummary?.totalUnits || 1) * 2500; 
    const mobilizationPayment = estimatedAMC * 0.15;

    const handleFinalSubmit = async () => {
        if (!signedData) {
            setShowSignature(true);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const docRef = await addDoc(collection(db, 'intake_submissions'), {
                properties,
                selectedPlan,
                portfolioSummary,
                mobilizationDue: mobilizationPayment,
                companyProfile,
                signedData, // [V4] Executed document metadata
                status: 'AWAITING_VERIFICATION',
                paymentStatus: 'PENDING',
                createdAt: serverTimestamp(),
                source: 'Sovereign_Wizard_v2.0'
            });
            setIntakeId(docRef.id);
            setSubmitted(true);
            setLoading(false);
            setTimeout(onNext, 2000);
        } catch (err: any) {
            console.error("Submission Fault:", err);
            setError("Systemic fault during submission. Operational node retry required.");
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <Box sx={{ py: 10, textAlign: 'center' }}>
                <CheckCircle2 size={80} color="#10b981" style={{ marginBottom: 24 }} />
                <Typography variant="h3" fontWeight="950" sx={{ mb: 2 }}>SUBMISSION SECURED</Typography>
                <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.5)', mb: 4 }}>
                    Your portfolio data has been anchored. Initializing mobilization protocols...
                </Typography>
                <CircularProgress color="inherit" sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    if (showSignature) {
        return (
            <Container maxWidth="md" sx={{ py: 4 }}>
                <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.9)', border: `1px solid ${binThemeTokens.gold}`, borderRadius: 4 }}>
                    <ContractDigitalSignature 
                        propertyData={properties[0]} 
                        selectedPlan={selectedPlan} 
                        onSign={(data: any) => {
                            setSignedData(data);
                            setShowSignature(false);
                        }} 
                    />
                    <Button onClick={() => setShowSignature(false)} sx={{ mt: 2, color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.mobilization', 'MOBILIZATION & ACTIVATION')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.mobilization_desc', 'Finalize the institutional handshake to unlock your Sovereign Dashboard.')}
                </Typography>
            </Box>

            <Container maxWidth="sm">
                <Paper sx={{ p: 6, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: `2px solid ${binThemeTokens.gold}`, position: 'relative', overflow: 'hidden' }}>
                    <Box sx={{ position: 'absolute', top: 0, right: 0, p: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.7rem', letterSpacing: 2 }}>
                        FINAL STEP
                    </Box>
                    
                    <Stack spacing={4}>
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block' }}>
                                MOBILIZATION PAYMENT (15%)
                            </Typography>
                            <Typography variant="h2" fontWeight="950" sx={{ color: '#FFF' }}>
                                {formatAED(mobilizationPayment)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                This upfront allocation covers asset auditing, technician mapping, and system initialization.
                            </Typography>
                        </Box>

                        {signedData && (
                             <Alert severity="success" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#4ADE80', border: '1px solid rgba(16,185,129,0.2)' }}>
                                DIGITAL CONTRACT SIGNED: {signedData.institutionalHash}
                             </Alert>
                        )}

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Stack spacing={3}>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <Clock size={24} color={binThemeTokens.gold} />
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="body1" fontWeight="700">ADMIN VERIFICATION PHASE</Typography>
                                    <Typography variant="body2" color="text.secondary">Our analysts will review your portfolio data within 24 hours.</Typography>
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <ShieldCheck size={24} color={binThemeTokens.gold} />
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="body1" fontWeight="700">DASHBOARD ACTIVATION</Typography>
                                    <Typography variant="body2" color="text.secondary">Live monitoring and SOS dispatch unlock immediately upon payment verification.</Typography>
                                </Box>
                            </Box>
                        </Stack>

                        {error && <Alert severity="error" sx={{ bgcolor: 'rgba(211,47,47,0.1)', color: '#ffb74d' }}>{error}</Alert>}

                        <Button 
                            variant="contained" 
                            fullWidth 
                            size="large" 
                            disabled={loading}
                            onClick={handleFinalSubmit}
                            endIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ArrowRight />}
                            sx={{ 
                                py: 2.5, borderRadius: 4, 
                                bgcolor: binThemeTokens.gold, color: '#000', 
                                fontWeight: 950, fontSize: '1.1rem',
                                boxShadow: `0 20px 40px ${alpha(binThemeTokens.gold, 0.2)}`,
                                '&:hover': { bgcolor: '#E6C77A', transform: 'translateY(-2px)' }
                            }}
                        >
                            {signedData ? 'SECURE SUBMISSION' : 'SIGN CONTRACT & SUBMIT'}
                        </Button>
                    </Stack>
                </Paper>

                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 4, color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
                    By clicking Secure Submission, you initialize the BIN GROUP Sovereign Onboarding Protocol.
                </Typography>
            </Container>
        </Box>
    );
};

export default AdminSubmissionStep;
