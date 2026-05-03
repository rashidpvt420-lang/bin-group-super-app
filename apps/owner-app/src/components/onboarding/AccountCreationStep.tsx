import React, { useState } from 'react';
import { 
    Box, Typography, TextField, Button, Stack, Alert, 
    CircularProgress, InputAdornment, IconButton, Paper, Grid, Container
} from '@mui/material';
import { Visibility, VisibilityOff, ArrowBack, ArrowForward, Lock, Mail, Phone, Person, Login, Info } from '@mui/icons-material';
import { createUserWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth';
import { auth, db, doc, serverTimestamp, setDoc, collection, query, where, getDocs } from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

interface AccountCreationStepProps {
    onNext: () => void;
    onBack: () => void;
}

export default function AccountCreationStep({ onBack, onNext }: AccountCreationStepProps) {
    const { companyProfile, setOwnerAccount, updateCompanyProfile, updateSignupData, intakeId } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    
    const [formData, setFormData] = useState({
        fullName: companyProfile.contactPerson || '',
        email: companyProfile.email || '',
        mobile: companyProfile.phone || '',
        password: '',
        confirmPassword: ''
    });

    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{ message: string; type: 'error' | 'warning' | 'info'; action?: 'signin' } | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSignup = async () => {
        setError(null);
        
        // 1. Validation
        if (!formData.fullName || !formData.mobile || !formData.email || !formData.password) {
            setError({ message: t('onboarding.error.all_fields') || "All fields are required.", type: 'error' });
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError({ message: t('onboarding.error.password_mismatch') || "Passwords do not match.", type: 'error' });
            return;
        }
        if (formData.password.length < 8) {
            setError({ message: t('onboarding.error.weak_password') || "Password must be at least 8 characters long.", type: 'error' });
            return;
        }

        setLoading(true);

        const email = formData.email.trim().toLowerCase();

        try {
            // 2. Role Collision Check (Prevent unauthorized role switches)
            console.log("🔍 [ONBOARDING] Checking for role collision...");
            const userQuery = query(collection(db, 'users'), where('email', '==', email));
            const userSnap = await getDocs(userQuery);

            if (!userSnap.empty) {
                const existingUser = userSnap.docs[0].data();
                if (existingUser.role && existingUser.role !== 'owner') {
                    console.error("🛡️ [AUTH_CONFLICT] Role collision detected:", existingUser.role);
                    setError({ message: t('onboarding.error.role_conflict'), type: 'error' });
                    setLoading(false);
                    return;
                }
            }

            // 3. Create the Authentication Record
            console.log("🛡️ [ONBOARDING] Creating Firebase Auth record...");
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, formData.password);
                const user = userCredential.user;

                // 4. LOCK THE FIRESTORE PROFILE (PENDING_APPROVAL)
                await setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid,
                    email: user.email?.toLowerCase(),
                    displayName: formData.fullName,
                    phone: formData.mobile,
                    role: 'owner',
                    status: 'pending_admin_approval',
                    dashboardLocked: true,
                    adminApproved: false,
                    paymentVerified: false,
                    onboardingSubmissionId: intakeId || 'legacy',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                // 5. Link Intake Submission
                if (intakeId) {
                    await setDoc(doc(db, 'intake_submissions', intakeId), {
                        ownerUid: user.uid,
                        ownerEmail: email,
                        accountCreated: true,
                        accountCreatedAt: serverTimestamp()
                    }, { merge: true });
                }

                // 6. Update Local Store
                setOwnerAccount({ 
                    uid: user.uid, 
                    fullName: formData.fullName, 
                    email: email, 
                    mobile: formData.mobile 
                });
                
                setSuccess(true);
                setTimeout(() => onNext(), 2000);

            } catch (authErr: any) {
                // 7. Handle Provider Collisions
                if (authErr.code === 'auth/email-already-in-use') {
                    const methods = await fetchSignInMethodsForEmail(auth, email);
                    if (methods.includes('google.com') && !methods.includes('password')) {
                        setError({ message: t('onboarding.error.google_only'), type: 'info' });
                    } else {
                        setError({ message: t('onboarding.error.email_exists'), type: 'warning', action: 'signin' });
                    }
                } else {
                    throw authErr;
                }
            }
            
        } catch (err: any) {
            console.error("Account Creation Error:", err);
            let msg = t('onboarding.error.generic') || "Failed to create account.";
            if (err.code === 'auth/invalid-email') msg = t('onboarding.error.invalid_email');
            else if (err.code === 'auth/weak-password') msg = t('onboarding.error.weak_password');
            setError({ message: msg, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <Container maxWidth="md" sx={{ py: 10, textAlign: 'center' }}>
                <Paper sx={{ p: 6, borderRadius: 8, bgcolor: 'rgba(22, 22, 24, 0.8)', border: '1px solid #4ADE80', backdropFilter: 'blur(10px)' }}>
                    <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: 'rgba(74, 222, 128, 0.1)' }}>
                            <Lock sx={{ color: '#4ADE80', fontSize: 48 }} />
                        </Box>
                    </Box>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>{t('onboarding.success_title') || 'SUCCESS'}</Typography>
                    <Typography variant="body1" sx={{ color: '#4ADE80', fontWeight: 700 }}>
                        {t('onboarding.success_locked')}
                    </Typography>
                    <CircularProgress sx={{ mt: 4, color: binThemeTokens.gold }} />
                </Paper>
            </Container>
        );
    }

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', width: '100%', py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom>
                    {t('onboarding.acc_creation')}
                </Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    {t('onboarding.acc_creation_desc')}
                </Typography>
            </Box>

            <Paper sx={{ 
                p: { xs: 3, md: 5 }, 
                borderRadius: 6, 
                bgcolor: 'rgba(22, 22, 24, 0.6)', 
                border: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(10px)'
            }}>
                <Alert 
                    icon={<Info sx={{ color: binThemeTokens.gold }} />}
                    sx={{ 
                        mb: 4, 
                        bgcolor: 'rgba(212, 175, 55, 0.05)', 
                        color: binThemeTokens.gold,
                        border: `1px solid rgba(212, 175, 55, 0.2)`,
                        '& .MuiAlert-icon': { alignItems: 'center', color: binThemeTokens.gold },
                        flexDirection: isRTL ? 'row-reverse' : 'row'
                    }}
                >
                    {t('onboarding.acc_creation_warning')}
                </Alert>

                {error && (
                    <Alert 
                        severity={error.type} 
                        sx={{ mb: 4, borderRadius: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}
                        action={error.action === 'signin' && (
                            <Button color="inherit" size="small" onClick={() => window.location.href = '/login'} startIcon={<Login sx={{ fontSize: 16 }} />}>
                                {t('login.signin')}
                            </Button>
                        )}
                    >
                        {error.message}
                    </Alert>
                )}

                <Stack spacing={3}>
                    <TextField 
                        label={t('onboarding.full_name')} 
                        variant="outlined" 
                        fullWidth 
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        InputProps={{
                            sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                            startAdornment: <Person sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} />
                        }}
                        InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)', textAlign: isRTL ? 'right' : 'left', width: '100%' } }}
                    />

                    <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label={t('onboarding.mobile')} 
                                variant="outlined" 
                                fullWidth 
                                value={formData.mobile}
                                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                                InputProps={{
                                    sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                                    startAdornment: <Phone sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} />
                                }}
                                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label={t('onboarding.email')} 
                                type="email"
                                variant="outlined" 
                                fullWidth 
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                InputProps={{
                                    sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                                    startAdornment: <Mail sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} />
                                }}
                                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                            />
                        </Grid>
                    </Grid>

                    <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label={t('onboarding.password')} 
                                type={showPassword ? 'text' : 'password'}
                                variant="outlined" 
                                fullWidth 
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                InputProps={{
                                    sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                                    startAdornment: <Lock sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} />,
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                                {showPassword ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label={t('onboarding.confirm_password')} 
                                type={showPassword ? 'text' : 'password'}
                                variant="outlined" 
                                fullWidth 
                                value={formData.confirmPassword}
                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                InputProps={{
                                    sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                                    startAdornment: <Lock sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} />
                                }}
                                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                            />
                        </Grid>
                    </Grid>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Button 
                            variant="outlined" 
                            startIcon={!isRTL ? <ArrowBack /> : null} 
                            endIcon={isRTL ? <ArrowBack sx={{ transform: 'rotate(180deg)' }} /> : null}
                            onClick={onBack}
                            disabled={loading}
                            sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, px: 4, borderRadius: 100 }}
                        >
                            {t('onboarding.back')}
                        </Button>
                        <Button 
                            variant="contained" 
                            onClick={handleSignup}
                            disabled={loading || formData.password !== formData.confirmPassword || formData.password.length < 8}
                            sx={{ 
                                bgcolor: binThemeTokens.gold, 
                                color: '#000', 
                                fontWeight: 950, 
                                py: 1.5, 
                                px: 4, 
                                borderRadius: 100,
                                '&:hover': { bgcolor: '#FFF' }
                            }}
                        >
                            {loading ? <CircularProgress size={24} color="inherit" /> : (
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    {t('onboarding.create_btn')}
                                    {!isRTL ? <ArrowForward sx={{ ml: 1, fontSize: 20 }} /> : <ArrowForward sx={{ mr: 1, fontSize: 20, transform: 'rotate(180deg)' }} />}
                                </Box>
                            )}
                        </Button>
                    </Box>
                </Stack>
            </Paper>
        </Box>
    );
}
