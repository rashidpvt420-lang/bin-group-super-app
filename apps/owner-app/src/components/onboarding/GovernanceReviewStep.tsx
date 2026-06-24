import React, { useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Button, Divider, Chip, Container, CircularProgress, Alert
} from '@mui/material';
import { ShieldCheck, MapPin, Building, Wrench, ArrowRight, ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { db, collection, addDoc, serverTimestamp } from '../../lib/firebase';
import { formatAED } from '../../utils/formatters';
import ContractDigitalSignature from '../ContractDigitalSignature';

const GovernanceReviewStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { 
        properties, selectedPlan, portfolioSummary, setIntakeId, 
        companyProfile 
    } = useOnboardingStore();
    const { tx } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [showSignature, setShowSignature] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [signedData, setSignedData] = useState<any>(null);

    const activeProperty = properties[0];
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
                signedData,
                status: 'AWAITING_VERIFICATION',
                paymentStatus: 'PENDING',
                createdAt: serverTimestamp(),
                source: 'Sovereign_Wizard_v2.1_Optimized'
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
                    Anchored. Initializing mobilization protocols...
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
                        propertyData={activeProperty} 
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
        <Box sx={{ py: 2 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.governance_review', 'GOVERNANCE REVIEW')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.governance_desc', 'Final review and contract execution.')}
                </Typography>
            </Box>

            <Container maxWidth="lg">
                <Grid container spacing={4}>
                    <Grid item xs={12} lg={7}>
                        <Stack spacing={3}>
                            <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>ASSET SUMMARY</Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" color="textSecondary">CATEGORY</Typography>
                                        <Typography variant="body2" fontWeight="900">{activeProperty?.propertyType}</Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" color="textSecondary">UNITS / SQFT</Typography>
                                        <Typography variant="body2" fontWeight="900">{activeProperty?.units} / {activeProperty?.sqft}</Typography>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.05)' }} />
                                        <Typography variant="caption" color="textSecondary">LOCATION</Typography>
                                        <Typography variant="body2" fontWeight="700">{activeProperty?.address}</Typography>
                                    </Grid>
                                </Grid>
                            </Paper>

                            <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>SELECTED PROTOCOL</Typography>
                                <Typography variant="h6" fontWeight="950">{selectedPlan?.name}</Typography>
                                <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {selectedPlan?.features.map((f: string, i: number) => (
                                        <Chip key={i} label={f} size="small" sx={{ height: 20, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }} />
                                    ))}
                                </Box>
                            </Paper>
                        </Stack>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: `2px solid ${binThemeTokens.gold}`, height: '100%' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>FINAL MOBILIZATION</Typography>
                            
                            <Box sx={{ mb: 4 }}>
                                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF' }}>{formatAED(mobilizationPayment)}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>15% UPFRONT MOBILIZATION FEE</Typography>
                            </Box>

                            <Stack spacing={2} sx={{ mb: 4 }}>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <ShieldCheck size={20} color={binThemeTokens.gold} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>Institutional contract anchoring.</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <Clock size={20} color={binThemeTokens.gold} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>24-hour verification queue.</Typography>
                                </Box>
                            </Stack>

                            {signedData && (
                                <Alert severity="success" sx={{ mb: 3, py: 0, '& .MuiAlert-message': { fontSize: '0.7rem' } }}>
                                    SIGNED: {signedData.institutionalHash}
                                </Alert>
                            )}

                            <Button 
                                variant="contained" fullWidth size="large" 
                                onClick={handleFinalSubmit} disabled={loading}
                                sx={{ py: 2, borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                            >
                                {signedData ? 'SUBMIT FOR GOVERNANCE' : 'SIGN & SUBMIT'}
                            </Button>
                            <Button variant="text" fullWidth onClick={onBack} sx={{ mt: 1, color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>BACK</Button>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default GovernanceReviewStep;
