import React, { useState } from 'react';
import {
    Box, Typography, TextField, Button, Stack, Alert,
    CircularProgress, InputAdornment, IconButton, Paper, Grid, Container
} from '@mui/material';
import { Visibility, VisibilityOff, ArrowBack, ArrowForward, Lock, Mail, Phone, Person, Login, Info } from '@mui/icons-material';
import { createUserWithEmailAndPassword, fetchSignInMethodsForEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db, doc, serverTimestamp, setDoc, collection, query, where, getDocs } from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

interface AccountCreationStepProps {
    onNext: () => void;
    onBack: () => void;
}

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.') || value.toLowerCase() === 'generic') return fallback;
    return value;
};

const normalizePhone = (value: string) => value.replace(/[^0-9+]/g, '').trim();

export default function AccountCreationStep({ onBack, onNext }: AccountCreationStepProps) {
    const { companyProfile, setOwnerAccount, intakeId } = useOnboardingStore();
    const { t, isRTL, lang } = useLanguage();

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

    const errorText = (key: string, fallback: string) => readable(t(key), fallback);

    const validateForm = () => {
        const fullName = formData.fullName.trim();
        const email = formData.email.trim().toLowerCase();
        const mobile = normalizePhone(formData.mobile);

        if (!fullName || !mobile || !email || !formData.password || !formData.confirmPassword) {
            return errorText('onboarding.error.all_fields', 'Please complete all account fields before continuing.');
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return errorText('onboarding.error.invalid_email', 'Enter a valid email address.');
        }
        if (mobile.length < 8) {
            return lang === 'ar' ? 'يرجى إدخال رقم هاتف صحيح.' : 'Enter a valid mobile number.';
        }
        if (formData.password.length < 8) {
            return errorText('onboarding.error.weak_password', 'Password must be at least 8 characters.');
        }
        if (formData.password !== formData.confirmPassword) {
            return errorText('onboarding.error.password_mismatch', 'Passwords do not match.');
        }
        return null;
    };

    const writeOwnerProfile = async (user: any, fullName: string, email: string, mobile: string) => {
        console.log("📝 [ONBOARDING] Writing/Merging owner profile...");
        // 4. LOCK THE FIRESTORE PROFILE (PENDING_APPROVAL)
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: email.toLowerCase(),
            displayName: fullName,
            name: fullName,
            phone: mobile,
            mobile,
            role: 'owner',
            status: 'pending_admin_approval',
            dashboardLocked: true,
            adminApproved: false,
            paymentVerified: false,
            onboardingSubmissionId: intakeId || 'legacy',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });

        // 5. Link Intake Submission
        if (intakeId) {
            try {
                await setDoc(doc(db, 'intake_submissions', intakeId), {
                    ownerUid: user.uid,
                    ownerEmail: email,
                    accountCreated: true,
                    accountCreatedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } catch (intakeErr) {
                console.warn('[ONBOARDING] Optional intake account link failed; owner account still created.', intakeErr);
            }
        }

        // 6. Update Local Store
        setOwnerAccount({
            uid: user.uid,
            fullName,
            email,
            mobile
        });

        setSuccess(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => onNext(), 1200);
    };

    const handleSignup = async () => {
        setError(null);
        const validationError = validateForm();
        if (validationError) {
            setError({ message: validationError, type: 'error' });
            return;
        }

        setLoading(true);
        const email = formData.email.trim().toLowerCase();
        const mobile = normalizePhone(formData.mobile);
        const fullName = formData.fullName.trim();

        try {
            // 2. Role Collision Check (Prevent unauthorized role switches)
            console.log("🔍 [ONBOARDING] Checking for role collision...");
            const userQuery = query(collection(db, 'users'), where('email', '==', email));
            const userSnap = await getDocs(userQuery);

            if (!userSnap.empty) {
                const existingUser = userSnap.docs[0].data();
                if (existingUser.role && existingUser.role !== 'owner') {
                    console.error("🛡️ [AUTH_CONFLICT] Role collision detected:", existingUser.role);
                    setError({ message: errorText('onboarding.error.role_conflict', 'This email is registered with a different role. Please use another email.'), type: 'error' });
                    setLoading(false);
                    return;
                }
            }

            // 3. Create or Sign In to the Authentication Record
            console.log("🛡️ [ONBOARDING] Attempting Auth record creation...");
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, formData.password);
                await writeOwnerProfile(userCredential.user, fullName, email, mobile);
            } catch (authErr: any) {
                // 7. Handle Provider Collisions / Existing Accounts
                if (authErr.code === 'auth/email-already-in-use') {
                    console.log("🔄 [ONBOARDING] Email already exists. Attempting sign-in fallback...");
                    try {
                        const signinCred = await signInWithEmailAndPassword(auth, email, formData.password);
                        console.log("✅ [ONBOARDING] Sign-in successful. Merging profile...");
                        await writeOwnerProfile(signinCred.user, fullName, email, mobile);
                    } catch (signinErr: any) {
                        console.error("❌ [ONBOARDING] Sign-in fallback failed:", signinErr);
                        try {
                            const methods = await fetchSignInMethodsForEmail(auth, email);
                            if (methods.includes('google.com') && !methods.includes('password')) {
                                setError({ message: errorText('onboarding.error.google_only', 'This email uses Google sign-in. Please log in with Google or use another email.'), type: 'info' });
                            } else {
                                setError({ message: errorText('onboarding.error.email_exists', 'This email already exists. Please sign in or use another email.'), type: 'warning', action: 'signin' });
                            }
                        } catch {
                            setError({ message: errorText('onboarding.error.email_exists', 'This email already exists. Please sign in or use another email.'), type: 'warning', action: 'signin' });
                        }
                    }
                } else {
                    throw authErr;
                }
            }

        } catch (err: any) {
            console.error('Account Creation Error:', err);
            if (err.code === 'auth/email-already-in-use') {
                try {
                    const methods = await fetchSignInMethodsForEmail(auth, email);
                    if (methods.includes('google.com') && !methods.includes('password')) {
                        setError({ message: errorText('onboarding.error.google_only', 'This email uses Google sign-in. Please log in with Google or use another email.'), type: 'info' });
                    } else {
                        setError({ message: errorText('onboarding.error.email_exists', 'This email already exists. Please sign in or use another email.'), type: 'warning', action: 'signin' });
                    }
                } catch {
                    setError({ message: errorText('onboarding.error.email_exists', 'This email already exists. Please sign in or use another email.'), type: 'warning', action: 'signin' });
                }
            } else {
                let msg = errorText('onboarding.error.generic', 'Account creation failed. Please check the details and try again.');
                if (err.code === 'auth/invalid-email') msg = errorText('onboarding.error.invalid_email', 'Enter a valid email address.');
                else if (err.code === 'auth/weak-password') msg = errorText('onboarding.error.weak_password', 'Password must be at least 8 characters.');
                else if (err.code === 'auth/operation-not-allowed') msg = lang === 'ar' ? 'تسجيل البريد وكلمة المرور غير مفعّل في Firebase Authentication.' : 'Email/password signup is not enabled in Firebase Authentication.';
                else if (err.code === 'permission-denied') msg = lang === 'ar' ? 'تم إنشاء الحساب، لكن Firestore رفض إنشاء ملف المالك. يرجى نشر قواعد Firestore الجديدة ثم المحاولة مرة أخرى.' : 'Owner account was created, but Firestore rejected the owner profile write. Deploy the latest Firestore rules and try again.';
                else if (err.code === 'unavailable') msg = lang === 'ar' ? 'Firebase غير متاح مؤقتاً. حاول مرة أخرى بعد لحظات.' : 'Firebase is temporarily unavailable. Please try again in a moment.';
                else if (err?.message) msg = `${msg} (${err.code || err.message})`;
                setError({ message: msg, type: 'error' });
            }
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <Container maxWidth="md" sx={{ py: { xs: 4, md: 10 }, textAlign: 'center' }} dir={isRTL ? 'rtl' : 'ltr'}>
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: { xs: 4, md: 8 }, bgcolor: 'rgba(22, 22, 24, 0.8)', border: '1px solid #4ADE80', backdropFilter: 'blur(10px)' }}>
                    <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: 'rgba(74, 222, 128, 0.1)' }}>
                            <Lock sx={{ color: '#4ADE80', fontSize: 48 }} />
                        </Box>
                    </Box>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>{readable(t('onboarding.success_title'), 'Account Created')}</Typography>
                    <Typography variant="body1" sx={{ color: '#4ADE80', fontWeight: 700 }}>
                        {readable(t('onboarding.success_locked'), 'Your owner profile was created and is pending admin approval.')}
                    </Typography>
                    <CircularProgress sx={{ mt: 4, color: binThemeTokens.gold }} />
                </Paper>
            </Container>
        );
    }

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 800, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 }, overflow: 'visible' }}>
            <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 4 } }}>
                <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom sx={{ fontSize: { xs: '1.8rem', md: '2.125rem' } }}>
                    {readable(t('onboarding.acc_creation'), 'Create Owner Account')}
                </Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    {readable(t('onboarding.acc_creation_desc'), 'Create your secure owner login to continue the contract and payment process.')}
                </Typography>
            </Box>

            <Paper sx={{
                p: { xs: 2, sm: 3, md: 5 },
                borderRadius: { xs: 4, md: 6 },
                bgcolor: 'rgba(22, 22, 24, 0.6)',
                border: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(10px)',
                overflow: 'visible'
            }}>
                <Alert
                    icon={<Info sx={{ color: binThemeTokens.gold }} />}
                    sx={{
                        mb: 3,
                        bgcolor: 'rgba(212, 175, 55, 0.05)',
                        color: binThemeTokens.gold,
                        border: '1px solid rgba(212, 175, 55, 0.2)',
                        '& .MuiAlert-icon': { alignItems: 'center', color: binThemeTokens.gold },
                    }}
                >
                    {readable(t('onboarding.acc_creation_warning'), 'Your account will remain locked until contract/payment verification and admin approval are completed.')}
                </Alert>

                {error && (
                    <Alert
                        severity={error.type}
                        sx={{ mb: 3, borderRadius: 2 }}
                        action={error.action === 'signin' && (
                            <Button color="inherit" size="small" onClick={() => window.location.href = '/login'} startIcon={!isRTL ? <Login sx={{ fontSize: 16 }} /> : undefined}>
                                {readable(t('login.signin'), 'Sign in')}
                            </Button>
                        )}
                    >
                        {error.message}
                    </Alert>
                )}

                <Stack spacing={{ xs: 2.25, md: 3 }}>
                    <TextField
                        label={readable(t('onboarding.full_name'), 'Full name')}
                        variant="outlined"
                        fullWidth
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        InputProps={{
                            sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                            startAdornment: !isRTL ? <Person sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} /> : undefined,
                            endAdornment: isRTL ? <Person sx={{ color: binThemeTokens.gold, ml: 1.5, fontSize: 20 }} /> : undefined,
                        }}
                        InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)', textAlign: isRTL ? 'right' : 'left', width: '100%' } }}
                    />

                    <Grid container spacing={{ xs: 2, md: 3 }}>
                        <Grid item xs={12} md={6}>
                            <TextField
                                label={readable(t('onboarding.mobile'), 'Mobile')}
                                variant="outlined"
                                fullWidth
                                value={formData.mobile}
                                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                                InputProps={{
                                    sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                                    startAdornment: !isRTL ? <Phone sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} /> : undefined,
                                    endAdornment: isRTL ? <Phone sx={{ color: binThemeTokens.gold, ml: 1.5, fontSize: 20 }} /> : undefined,
                                }}
                                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                label={readable(t('onboarding.email'), 'Email')}
                                type="email"
                                variant="outlined"
                                fullWidth
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                InputProps={{
                                    sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                                    startAdornment: !isRTL ? <Mail sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} /> : undefined,
                                    endAdornment: isRTL ? <Mail sx={{ color: binThemeTokens.gold, ml: 1.5, fontSize: 20 }} /> : undefined,
                                }}
                                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                            />
                        </Grid>
                    </Grid>

                    <Grid container spacing={{ xs: 2, md: 3 }}>
                        <Grid item xs={12} md={6}>
                            <TextField
                                label={readable(t('onboarding.password'), 'Password')}
                                type={showPassword ? 'text' : 'password'}
                                variant="outlined"
                                fullWidth
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                InputProps={{
                                    sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                                    startAdornment: !isRTL ? <Lock sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} /> : undefined,
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
                                label={readable(t('onboarding.confirm_password'), 'Confirm password')}
                                type={showPassword ? 'text' : 'password'}
                                variant="outlined"
                                fullWidth
                                value={formData.confirmPassword}
                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                InputProps={{
                                    sx: { color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2 },
                                    startAdornment: !isRTL ? <Lock sx={{ color: binThemeTokens.gold, mr: 1.5, fontSize: 20 }} /> : undefined,
                                    endAdornment: isRTL ? <Lock sx={{ color: binThemeTokens.gold, ml: 1.5, fontSize: 20 }} /> : undefined,
                                }}
                                InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                            />
                        </Grid>
                    </Grid>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 3 }}>
                        <Button
                            variant="outlined"
                            startIcon={!isRTL ? <ArrowBack /> : undefined}
                            endIcon={isRTL ? <ArrowForward /> : undefined}
                            onClick={onBack}
                            disabled={loading}
                            fullWidth
                            sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, px: 4, borderRadius: 100, fontWeight: 950 }}
                        >
                            {readable(t('onboarding.back'), 'Back')}
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleSignup}
                            disabled={loading}
                            fullWidth
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
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {readable(t('onboarding.create_btn'), 'Create Account')}
                                    {!isRTL ? <ArrowForward sx={{ fontSize: 20 }} /> : <ArrowBack sx={{ fontSize: 20 }} />}
                                </Box>
                            )}
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
        </Box>
    );
}
