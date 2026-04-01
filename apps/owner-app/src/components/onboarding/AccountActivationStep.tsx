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
    Shield, 
    CheckCircle as CheckCircleIcon,
    User,
    Mail,
    Lock as LockIcon,
    Phone,
    Trophy,
    ArrowRight,
    ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOnboardingStore } from '../../store/onboardingStore';
import { auth, db, doc, setDoc, getDoc, addDoc, serverTimestamp, collection, updateDoc } from '../../lib/firebase';

import { createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword } from 'firebase/auth';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { verifyPaymentStatus } from '../../lib/paymentService';
import { useLanguage } from '../../context/LanguageContext';


const AccountActivationStep: React.FC = () => {
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    const { 
        properties, 
        valuationResult, 
        portfolioSummary, 
        propertyData, 
        selectedPlan, 
        selectedAddOns, 
        paymentVerified, 
        paymentMethod,
        contractId, 
        setContractId, 
        reset 
    } = useOnboardingStore();
    const [isActivating, setIsActivating] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', phone: '' });
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const isOfflineMethod = paymentMethod === 'CASH' || paymentMethod === 'CHEQUE';

    const handleActivate = async () => {
        const namePattern = /^[a-zA-Z\s]{3,50}$/;
        if (!formData.name || !namePattern.test(formData.name)) {
            setSnackbar({ open: true, message: t('activation.error.name'), severity: 'error' });
            return;
        }

        if (!formData.email || !formData.password) {
            setSnackbar({ open: true, message: t('activation.error.credentials'), severity: 'error' });
            return;
        }

        const phonePattern = /^(\+971|0)?5[024568]\d{7}$/;
        if (formData.phone && !phonePattern.test(formData.phone.replace(/\s/g, ''))) {
            setSnackbar({ open: true, message: t('activation.error.phone'), severity: 'error' });
            return;
        }

        // 🚨 HARDENED SECURITY CHECK:
        // Must verify against Firestore source of truth, not just local store state.
        if (!contractId) {
            setSnackbar({ open: true, message: t('activation.error.contract_id'), severity: 'error' });
            return;
        }

        setIsActivating(true);
        const isVerified = await verifyPaymentStatus(contractId);

        if (!isVerified && !isOfflineMethod) {
            setSnackbar({ open: true, message: t('activation.error.payment_failed'), severity: 'error' });
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
                    setSnackbar({ open: true, message: t('activation.info.existing_detected'), severity: 'info' });
                    
                    try {
                        const signInResult = await signInWithEmailAndPassword(auth, formData.email, formData.password);
                        ownerId = signInResult.user.uid;
                    } catch (signInError: any) {
                        throw new Error(t('activation.error.existing_rejection'));
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
            const finalStatus = isVerified ? 'ACTIVE' : 'pending_approval';
            
            batch.update(contractDocRef, {
                propertyIds,
                primaryPropertyId: propertyIds[0],
                ownerId,
                invoiceHash,
                signatureHash,
                activationTimestamp,
                packageName: selectedPlan?.packageName || 'Institutional Package',
                planType: selectedPlan?.tier || 'institutional',
                activationStatus: finalStatus,
                depositPaid: isVerified,
                paymentVerified: isVerified, // Added explicitly for paymentService consistency
                depositAmount,
                annualContractValue: annualTotal,
                selectedAddOns: selectedAddOns || [],
                portfolioSummary,
                startDate: serverTimestamp(),
                status: finalStatus,
                updatedAt: serverTimestamp()
            });

            // 3. Create/Update Owner Profile
            const ownerRef = doc(db, 'owners', ownerId);
            batch.set(ownerRef, {
                ownerId,
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                status: finalStatus,
                dashboardUnlocked: isVerified,
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
                status: isVerified ? 'SUCCESS' : 'PENDING',
                description: `Institutional Activation Deposit (15%) — Portfolio of ${properties.length} Assets`,
                timestamp: serverTimestamp()
            });

            // 5. User Role Mapping
            const userRef = doc(db, 'users', ownerId);
            batch.set(userRef, {
                email: formData.email,
                displayName: formData.name,
                role: 'owner',
                status: finalStatus,
                createdAt: serverTimestamp()
            }, { merge: true });

            // COMMIT BATCH
            await batch.commit();

            if (isVerified) {
                setTimeout(() => {
                    setIsActivating(false);
                    reset();
                    navigate('/dashboard');
                }, 3000);
            } else {
                // For offline methods, stay on page but show success/holding state
                setTimeout(() => {
                    setIsActivating(false);
                    setSnackbar({ 
                        open: true, 
                        message: "Your payment method has been recorded. An admin will contact you shortly to collect payment and verify your account.", 
                        severity: 'success' 
                    });
                    // After a short delay, move them to dashboard where ProtectedRoute will catch the lock
                    setTimeout(() => {
                        reset();
                        navigate('/dashboard');
                    }, 5000);
                }, 3000);
            }

        } catch (error: any) {
            console.error("Activation failed:", error);
            setSnackbar({ open: true, message: t('activation.error.generic', { message: error.message }), severity: 'error' });
            setIsActivating(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: { xs: 4, md: 10 } }}>
            <Paper sx={{ 
                p: { xs: 3, md: 6 }, borderRadius: { xs: 4, md: 8 }, bgcolor: 'rgba(22, 22, 24, 0.6)', backdropFilter: 'blur(40px)',
                border: '1px solid rgba(198, 167, 94, 0.2)', position: 'relative',
                boxShadow: '0 50px 100px -20px rgba(0,0,0,0.7)',
                direction: isRTL ? 'rtl' : 'ltr'
            }}>
                <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
                    <Box sx={{ 
                        width: 90, height: 90, borderRadius: '50%', 
                        background: 'linear-gradient(135deg, rgba(198,167,94,0.1), rgba(198,167,94,0.3))', 
                        mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
                        border: '1px solid rgba(198,167,94,0.3)',
                        boxShadow: '0 0 30px rgba(198, 167, 94, 0.2)'
                    }}>
                        <Shield color={binThemeTokens.gold} size={48} />
                    </Box>
                    <Typography variant="h3" fontWeight="900" sx={{ mb: 1, color: binThemeTokens.gold, letterSpacing: 2 }}>
                        {paymentVerified ? t('activation.title') : t('activation.title_pending')}
                    </Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>
                        {paymentVerified ? t('activation.subtitle') : t('activation.subtitle_pending')}
                    </Typography>
                </Box>

                <Divider sx={{ mb: 6, borderColor: 'rgba(198, 167, 94, 0.1)' }} />

                <Grid container spacing={6} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={12} md={5}>
                        <Typography variant="h6" fontWeight="900" sx={{ mb: 4, color: binThemeTokens.textPrimary, letterSpacing: 1, textAlign: isRTL ? 'right' : 'left' }}>{t('activation.sovereign_access')}</Typography>
                        <Stack spacing={4}>
                            <Box sx={{ display: 'flex', gap: 2.5, flexDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }}>
                                <Trophy size={24} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{t('activation.benefit1.title')}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.6 }}>{t('activation.benefit1.desc')}</Typography>
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 2.5, flexDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }}>
                                <CheckCircleIcon size={24} color={binThemeTokens.gold} />
                                <Box>
                                    <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{t('activation.benefit2.title')}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.6 }}>{t('activation.benefit2.desc')}</Typography>
                                </Box>
                            </Box>
                        </Stack>
                        
                        <Paper sx={{ 
                            p: 3, mt: 8, borderRadius: 5, 
                            bgcolor: 'rgba(198, 167, 94, 0.05)', 
                            border: '1px solid rgba(198, 167, 94, 0.1)',
                            textAlign: isRTL ? 'right' : 'left'
                        }}>
                             <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>{t('activation.selected_contract')}</Typography>
                             <Typography variant="h6" fontWeight="900" sx={{ mt: 1, color: binThemeTokens.textPrimary }}>{selectedPlan?.packageName}</Typography>
                             <Typography variant="body2" sx={{ color: binThemeTokens.goldLight, fontWeight: 800, mt: 0.5 }}>{t('activation.node_status')}</Typography>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={7}>
                        {!isActivating ? (
                            <Box>
                                <Typography variant="h6" fontWeight="900" sx={{ mb: 4, color: binThemeTokens.textPrimary, letterSpacing: 1, textAlign: isRTL ? 'right' : 'left' }}>{t('activation.identity_creation')}</Typography>
                                
                                {!paymentVerified && (
                                    <Alert 
                                        severity="info" 
                                        icon={paymentVerified ? <LockIcon size={18} color={binThemeTokens.gold} /> : <LockIcon size={18} color="rgba(255,255,255,0.7)" />}
                                        sx={{ 
                                            mb: 4, 
                                            bgcolor: 'rgba(198, 167, 94, 0.05)', 
                                            color: binThemeTokens.gold,
                                            border: '1px solid rgba(198, 167, 94, 0.2)',
                                            '& .MuiAlert-icon': { color: binThemeTokens.gold },
                                            flexDirection: isRTL ? 'row-reverse' : 'row',
                                            textAlign: isRTL ? 'right' : 'left'
                                        }}
                                    >
                                        {t('activation.pending_handshake')}
                                    </Alert>
                                )}

                                <Stack spacing={3} sx={{ opacity: (paymentVerified || isOfflineMethod) ? 1 : 0.5, pointerEvents: (paymentVerified || isOfflineMethod) ? 'auto' : 'none' }}>
                                    <TextField 
                                        fullWidth label={t('activation.field.name')} 
                                        variant="outlined" disabled={!(paymentVerified || isOfflineMethod)}
                                        placeholder={t('activation.field.name_placeholder')}
                                        value={formData.name} 
                                        onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                                        helperText={(paymentVerified || isOfflineMethod) ? t('activation.field.name_helper') : t('activation.field.locked_helper')}
                                        sx={{
                                            '& .MuiInputBase-input': { color: '#FFFFFF', textAlign: isRTL ? 'right' : 'left' },
                                            '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.4)', fontWeight: 600, textAlign: isRTL ? 'right' : 'left' },
                                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)', left: isRTL ? 'auto' : 0, right: isRTL ? 0 : 'auto', transformOrigin: isRTL ? 'right' : 'left' },
                                            '& .MuiOutlinedInput-root': {
                                                background: 'rgba(255,255,255,0.04)',
                                                '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' },
                                                '&:hover fieldset': { borderColor: '#C6A75E' },
                                                '&.Mui-focused fieldset': { borderColor: '#E6C77A' },
                                            },
                                        }}
                                        InputProps={{ 
                                            startAdornment: isRTL ? null : <User size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} />,
                                            endAdornment: isRTL ? <User size={18} style={{ marginLeft: 12, color: binThemeTokens.gold }} /> : null
                                        }}
                                    />
                                    <TextField 
                                        fullWidth label={t('activation.field.portfolio_id')} 
                                        variant="outlined" disabled={!(paymentVerified || isOfflineMethod)}
                                        value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})}
                                        sx={{
                                            '& .MuiInputBase-input': { color: '#FFFFFF', textAlign: isRTL ? 'right' : 'left' },
                                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)', left: isRTL ? 'auto' : 0, right: isRTL ? 0 : 'auto', transformOrigin: isRTL ? 'right' : 'left'  },
                                            '& .MuiOutlinedInput-root': {
                                                background: 'rgba(255,255,255,0.04)',
                                                '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' },
                                                '&:hover fieldset': { borderColor: '#C6A75E' },
                                                '&.Mui-focused fieldset': { borderColor: '#E6C77A' },
                                            },
                                        }}
                                        InputProps={{ 
                                            startAdornment: isRTL ? null : <Mail size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} />,
                                            endAdornment: isRTL ? <Mail size={18} style={{ marginLeft: 12, color: binThemeTokens.gold }} /> : null
                                        }}
                                    />
                                    <TextField 
                                        fullWidth label={t('activation.field.encryption_guard')} type="password"
                                        variant="outlined" disabled={!(paymentVerified || isOfflineMethod)}
                                        value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})}
                                        sx={{
                                            '& .MuiInputBase-input': { color: '#FFFFFF', textAlign: isRTL ? 'right' : 'left' },
                                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)', left: isRTL ? 'auto' : 0, right: isRTL ? 0 : 'auto', transformOrigin: isRTL ? 'right' : 'left'  },
                                            '& .MuiOutlinedInput-root': {
                                                background: 'rgba(255,255,255,0.04)',
                                                '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' },
                                                '&:hover fieldset': { borderColor: '#C6A75E' },
                                                '&.Mui-focused fieldset': { borderColor: '#E6C77A' },
                                            },
                                        }}
                                        InputProps={{ 
                                            startAdornment: isRTL ? null : <LockIcon size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} />,
                                            endAdornment: isRTL ? <LockIcon size={18} style={{ marginLeft: 12, color: binThemeTokens.gold }} /> : null
                                        }}
                                    />
                                    <TextField 
                                        fullWidth label={t('activation.field.contact_phone')} 
                                        variant="outlined" disabled={!(paymentVerified || isOfflineMethod)}
                                        value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                        sx={{
                                            '& .MuiInputBase-input': { color: '#FFFFFF', textAlign: isRTL ? 'right' : 'left' },
                                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)', left: isRTL ? 'auto' : 0, right: isRTL ? 0 : 'auto', transformOrigin: isRTL ? 'right' : 'left'  },
                                            '& .MuiOutlinedInput-root': {
                                                background: 'rgba(255,255,255,0.04)',
                                                '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' },
                                                '&:hover fieldset': { borderColor: '#C6A75E' },
                                                '&.Mui-focused fieldset': { borderColor: '#E6C77A' },
                                            },
                                        }}
                                        InputProps={{ 
                                            startAdornment: isRTL ? null : <Phone size={18} style={{ marginRight: 12, color: binThemeTokens.gold }} />,
                                            endAdornment: isRTL ? <Phone size={18} style={{ marginLeft: 12, color: binThemeTokens.gold }} /> : null
                                        }}
                                    />

                                    <Button 
                                        variant="contained" 
                                        fullWidth 
                                        size="large"
                                        onClick={handleActivate}
                                        disabled={!(paymentVerified || isOfflineMethod)}
                                        sx={{ 
                                            background: (paymentVerified || isOfflineMethod) ? 'linear-gradient(135deg, #C6A75E, #E6C77A)' : 'rgba(255,255,255,0.1)', 
                                            color: (paymentVerified || isOfflineMethod) ? '#0B0B0C' : 'rgba(255,255,255,0.3)', 
                                            py: 2.5, 
                                            fontWeight: 900, 
                                            borderRadius: 4, 
                                            mt: 2,
                                            fontSize: '1.2rem',
                                            boxShadow: (paymentVerified || isOfflineMethod) ? '0 20px 40px rgba(198, 167, 94, 0.3)' : 'none',
                                            '&:hover': { transform: (paymentVerified || isOfflineMethod) ? 'scale(1.02)' : 'none' }
                                        }}
                                    >
                                        {(paymentVerified || isOfflineMethod) ? t('activation.btn.activate') : t('activation.btn.awaiting')}
                                    </Button>
                                </Stack>
                            </Box>
                        ) : (
                            <Box sx={{ textAlign: 'center', py: 6 }}>
                                <Typography variant="h5" fontWeight="900" sx={{ mb: 2, color: binThemeTokens.gold }}>{t('activation.progress.establishing')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 5 }}>{t('activation.progress.encryption')}</Typography>
                                <LinearProgress 
                                    sx={{ 
                                        height: 16, borderRadius: 8, mb: 3,
                                        bgcolor: 'rgba(255,255,255,0.05)',
                                        '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #C6A75E, #E6C77A)' }
                                    }} 
                                />
                                <Typography variant="caption" sx={{ fontWeight: 900, letterSpacing: 4, color: binThemeTokens.goldLight, display: 'block' }}>
                                    {t('activation.progress.sync')}
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
