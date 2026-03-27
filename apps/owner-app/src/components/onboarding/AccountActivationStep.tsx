import React, { useState } from 'react';
import { 
    Box, 
    Typography, 
    Grid, 
    Paper, 
    Button, 
    TextField, 
    Stack, 
    Divider,
    LinearProgress,
    Container,
    Alert,
    Snackbar
} from '@mui/material';
import { 
    CheckCircle2, 
    User,
    Mail,
    Lock,
    Phone,
    Trophy,
    ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOnboardingStore } from '../../store/onboardingStore';
import { auth, db, doc, setDoc, getDoc, addDoc, serverTimestamp, collection, updateDoc } from '../../lib/firebase';

import { createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword } from 'firebase/auth';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { verifyPaymentStatus } from '../../lib/paymentService';


const AccountActivationStep: React.FC = () => {
    const navigate = useNavigate();
    const { 
        properties, 
        valuationResult, 
        portfolioSummary, 
        propertyData, 
        selectedPlan, 
        selectedAddOns, 
        paymentVerified, 
        contractId, 
        setContractId, 
        reset 
    } = useOnboardingStore();
    const [isActivating, setIsActivating] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', phone: '' });
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const handleActivate = async () => {
        const namePattern = /^[a-zA-Z\s]{3,50}$/;
        if (!formData.name || !namePattern.test(formData.name)) {
            setSnackbar({ open: true, message: "Sovereign Protocol: Please enter a valid Corporate or Individual Name (3-50 characters).", severity: 'error' });
            return;
        }

        if (!formData.email || !formData.password) {
            setSnackbar({ open: true, message: "Profile Error: Missing identity credentials.", severity: 'error' });
            return;
        }

        const phonePattern = /^(\+971|0)?5[024568]\d{7}$/;
        if (formData.phone && !phonePattern.test(formData.phone.replace(/\s/g, ''))) {
            setSnackbar({ open: true, message: "Identity Alert: Invalid UAE Contact Format. Use +971-50-XXX-XXXX.", severity: 'error' });
            return;
        }

        // 🚨 HARDENED SECURITY CHECK:
        // Must verify against Firestore source of truth, not just local store state.
        if (!contractId) {
            setSnackbar({ open: true, message: "Sovereign Protocol Error: Missing Contract ID.", severity: 'error' });
            return;
        }

        setIsActivating(true);
        const isVerified = await verifyPaymentStatus(contractId);
        if (!isVerified) {
            setSnackbar({ open: true, message: "SECURITY ALERT: Payment verification failed in registry. Cannot provision account.", severity: 'error' });
            setIsActivating(false);
            return;
        }
        try {
            let ownerId: string;
            
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                const user = userCredential.user;
                await updateProfile(user, { displayName: formData.name });
                ownerId = user.uid;
            } catch (authError: any) {
                if (authError.code === 'auth/email-already-in-use') {
                    setSnackbar({ open: true, message: "💎 [SOVEREIGN-RECOGNITION] Existing Portfolio Detected. Verifying credentials...", severity: 'info' });
                    
                    try {
                        const signInResult = await signInWithEmailAndPassword(auth, formData.email, formData.password);
                        ownerId = signInResult.user.uid;
                    } catch (signInError: any) {
                        throw new Error("RECOGNITION_FAILED: Credentials rejected for existing sovereign profile.");
                    }
                } else {
                    throw authError;
                }
            }

            // ── ATOMIC BATCH PROVISIONING ──────────────────────────────────
            const { writeBatch, collection, doc, serverTimestamp } = await import('../../lib/firebase');
            const batch = writeBatch(db);
            const propertyIds: string[] = [];

            // 1. Provision all properties
            for (const p of properties) {
                const pRef = doc(collection(db, 'properties'));
                batch.set(pRef, {
                    ...p,
                    ownerId,
                    status: 'ONBOARDING_COMPLETE',
                    verified: false,
                    createdAt: serverTimestamp()
                });
                propertyIds.push(pRef.id);
            }

            const activationTimestamp = new Date().toISOString();
            const invoiceHash = `BIN-${ownerId.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
            const signatureHash = `SIG-${ownerId.slice(-4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
            
            const annualTotal = valuationResult?.portfolioIntelligence?.finalAnnualPrice || 0;
            const depositAmount = Math.round(annualTotal * 0.15);

            // 2. Update Contract
            const contractDocRef = doc(db, 'contracts', contractId);
            batch.update(contractDocRef, {
                propertyIds,
                primaryPropertyId: propertyIds[0],
                ownerId,
                invoiceHash,
                signatureHash,
                activationTimestamp,
                packageName: selectedPlan?.packageName || 'Institutional Package',
                planType: selectedPlan?.tier || 'institutional',
                activationStatus: 'ACTIVE',
                depositPaid: true,
                depositAmount,
                annualContractValue: annualTotal,
                selectedAddOns: selectedAddOns || [],
                portfolioSummary,
                startDate: serverTimestamp(),
                status: 'ACTIVE',
                updatedAt: serverTimestamp()
            });

            // 3. Create/Update Owner Profile
            const ownerRef = doc(db, 'owners', ownerId);
            batch.set(ownerRef, {
                ownerId,
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                status: 'ACTIVE',
                dashboardUnlocked: true,
                propertyIds,
                activeContractId: contractId,
                createdAt: serverTimestamp()
            }, { merge: true });

            // 4. Create Transaction Record
            const transRef = doc(collection(db, 'transactions'));
            batch.set(transRef, {
                ownerId,
                contractId,
                type: 'DEPOSIT',
                amount: depositAmount,
                status: 'SUCCESS',
                description: `Institutional Activation Deposit (15%) — Portfolio of ${properties.length} Assets`,
                timestamp: serverTimestamp()
            });

            // 5. User Role Mapping
            const userRef = doc(db, 'users', ownerId);
            batch.set(userRef, {
                email: formData.email,
                role: 'owner',
                createdAt: serverTimestamp()
            }, { merge: true });

            // COMMIT BATCH
            await batch.commit();

            setTimeout(() => {
                setIsActivating(false);
                reset();
                navigate('/dashboard');
            }, 3000);

        } catch (error: any) {
            console.error("Activation failed:", error);
            setSnackbar({ open: true, message: "Provisioning Error: " + error.message, severity: 'error' });
            setIsActivating(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: { xs: 4, md: 10 } }}>
            <Paper sx={{ 
                p: { xs: 3, md: 6 }, borderRadius: { xs: 4, md: 8 }, bgcolor: 'rgba(22, 22, 24, 0.6)', backdropFilter: 'blur(40px)',
                border: '1px solid rgba(198, 167, 94, 0.2)', position: 'relative',
                boxShadow: '0 50px 100px -20px rgba(0,0,0,0.7)'
            }}>
                <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
                    <Box sx={{ 
                        width: 90, height: 90, borderRadius: '50%', 
                        background: 'linear-gradient(135deg, rgba(198,167,94,0.1), rgba(198,167,94,0.3))', 
                        mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
                        border: '1px solid rgba(198,167,94,0.3)',
                        boxShadow: '0 0 30px rgba(198, 167, 94, 0.2)'
                    }}>
                        <ShieldCheck color={binThemeTokens.gold} size={48} />
                    </Box>
                    <Typography variant="h3" fontWeight="900" sx={{ mb: 1, color: binThemeTokens.gold, letterSpacing: 2 }}>SECURITY VERIFIED</Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>Provisioning Sovereign Infrastructure...</Typography>
                </Box>

                <Divider sx={{ mb: 6, borderColor: 'rgba(198, 167, 94, 0.1)' }} />

                <Grid container spacing={6}>
                    <Grid item xs={12} md={5}>
                        <Typography variant="h6" fontWeight="900" sx={{ mb: 4, color: binThemeTokens.textPrimary, letterSpacing: 1 }}>SOVEREIGN ACCESS</Typography>
                        <Stack spacing={4}>
                            <Box sx={{ display: 'flex', gap: 2.5 }}>
                                <Trophy size={24} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>Real-time ROI Engine</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.6 }}>Track institutional appreciation & asset integrity metrics live.</Typography>
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 2.5 }}>
                                <CheckCircle2 size={24} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>Global BMS-Link™</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.6 }}>Proprietary integration between our intelligence layers and your asset.</Typography>
                                </Box>
                            </Box>
                        </Stack>
                        
                        <Paper sx={{ 
                            p: 3, mt: 8, borderRadius: 5, 
                            bgcolor: 'rgba(198, 167, 94, 0.05)', 
                            border: '1px solid rgba(198, 167, 94, 0.1)' 
                        }}>
                             <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>SELECTED ASSET CONTRACT</Typography>
                             <Typography variant="h6" fontWeight="900" sx={{ mt: 1, color: binThemeTokens.textPrimary }}>{selectedPlan?.packageName}</Typography>
                             <Typography variant="body2" sx={{ color: binThemeTokens.goldLight, fontWeight: 800, mt: 0.5 }}>ACTIVE PORTFOLIO NODE</Typography>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={7}>
                        {!isActivating ? (
                            <Box>
                                <Typography variant="h6" fontWeight="900" sx={{ mb: 4, color: binThemeTokens.textPrimary, letterSpacing: 1 }}>OWNER IDENTITY CREATION</Typography>
                                
                                {!paymentVerified && (
                                    <Alert 
                                        severity="info" 
                                        sx={{ 
                                            mb: 4, 
                                            bgcolor: 'rgba(198, 167, 94, 0.05)', 
                                            color: binThemeTokens.gold,
                                            border: '1px solid rgba(198, 167, 94, 0.2)',
                                            '& .MuiAlert-icon': { color: binThemeTokens.gold }
                                        }}
                                    >
                                        Pending Sovereign Handshake: Your contract identity is pending payment verification from the registry.
                                    </Alert>
                                )}

                                <Stack spacing={3} sx={{ opacity: paymentVerified ? 1 : 0.5, pointerEvents: paymentVerified ? 'auto' : 'none' }}>
                                    <TextField 
                                        fullWidth label="Full Corporate / Individual Name" 
                                        variant="outlined" disabled={!paymentVerified}
                                        placeholder="BIN-GROUP Holding L.L.C"
                                        value={formData.name} 
                                        onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                                        helperText={paymentVerified ? "Ensure this matches your trade license or identity." : "Protocol Locked: Verify payment to unlock identity binding."}
                                        sx={{
                                            '& .MuiInputBase-input': { color: '#FFFFFF' },
                                            '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.4)', fontWeight: 600 },
                                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)' },
                                            '& .MuiOutlinedInput-root': {
                                                background: 'rgba(255,255,255,0.04)',
                                                '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' },
                                                '&:hover fieldset': { borderColor: '#C6A75E' },
                                                '&.Mui-focused fieldset': { borderColor: '#E6C77A' },
                                            },
                                        }}
                                        InputProps={{ startAdornment: <User size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }}
                                    />
                                    <TextField 
                                        fullWidth label="Primary Portfolio ID (Email)" 
                                        variant="outlined" disabled={!paymentVerified}
                                        value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})}
                                        sx={{
                                            '& .MuiInputBase-input': { color: '#FFFFFF' },
                                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)' },
                                            '& .MuiOutlinedInput-root': {
                                                background: 'rgba(255,255,255,0.04)',
                                                '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' },
                                                '&:hover fieldset': { borderColor: '#C6A75E' },
                                                '&.Mui-focused fieldset': { borderColor: '#E6C77A' },
                                            },
                                        }}
                                        InputProps={{ startAdornment: <Mail size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }}
                                    />
                                    <TextField 
                                        fullWidth label="Secure Encryption Guard (Password)" type="password"
                                        variant="outlined" disabled={!paymentVerified}
                                        value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})}
                                        sx={{
                                            '& .MuiInputBase-input': { color: '#FFFFFF' },
                                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)' },
                                            '& .MuiOutlinedInput-root': {
                                                background: 'rgba(255,255,255,0.04)',
                                                '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' },
                                                '&:hover fieldset': { borderColor: '#C6A75E' },
                                                '&.Mui-focused fieldset': { borderColor: '#E6C77A' },
                                            },
                                        }}
                                        InputProps={{ startAdornment: <Lock size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }}
                                    />
                                    <TextField 
                                        fullWidth label="Mission-Critical Contact (Phone)" 
                                        variant="outlined" disabled={!paymentVerified}
                                        value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                        sx={{
                                            '& .MuiInputBase-input': { color: '#FFFFFF' },
                                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)' },
                                            '& .MuiOutlinedInput-root': {
                                                background: 'rgba(255,255,255,0.04)',
                                                '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' },
                                                '&:hover fieldset': { borderColor: '#C6A75E' },
                                                '&.Mui-focused fieldset': { borderColor: '#E6C77A' },
                                            },
                                        }}
                                        InputProps={{ startAdornment: <Phone size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} /> }}
                                    />

                                    <Button 
                                        variant="contained" 
                                        fullWidth 
                                        size="large"
                                        onClick={handleActivate}
                                        disabled={!paymentVerified}
                                        sx={{ 
                                            background: paymentVerified ? 'linear-gradient(135deg, #C6A75E, #E6C77A)' : 'rgba(255,255,255,0.1)', 
                                            color: paymentVerified ? '#0B0B0C' : 'rgba(255,255,255,0.3)', 
                                            py: 2.5, 
                                            fontWeight: 900, 
                                            borderRadius: 4, 
                                            mt: 2,
                                            fontSize: '1.2rem',
                                            boxShadow: paymentVerified ? '0 20px 40px rgba(198, 167, 94, 0.3)' : 'none',
                                            '&:hover': { transform: paymentVerified ? 'scale(1.02)' : 'none' }
                                        }}
                                    >
                                        {paymentVerified ? 'ACTIVATE SOVEREIGN HUB' : 'AWAITING PAYMENT'}
                                    </Button>
                                </Stack>
                            </Box>
                        ) : (
                            <Box sx={{ textAlign: 'center', py: 6 }}>
                                <Typography variant="h5" fontWeight="900" sx={{ mb: 2, color: binThemeTokens.gold }}>Establishing Secure Link...</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 5 }}>Generating encryption keys and linking mission-critical property BMS assets.</Typography>
                                <LinearProgress 
                                    sx={{ 
                                        height: 16, borderRadius: 8, mb: 3,
                                        bgcolor: 'rgba(255,255,255,0.05)',
                                        '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #C6A75E, #E6C77A)' }
                                    }} 
                                />
                                <Typography variant="caption" sx={{ fontWeight: 900, letterSpacing: 4, color: binThemeTokens.goldLight, display: 'block' }}>
                                    BIN-IDENTITY™ SYNC: PROXY LAYER 4
                                </Typography>
                            </Box>
                        )}
                    </Grid>
                </Grid>
            </Paper>

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
        </Container>
    );
};

export default AccountActivationStep;
