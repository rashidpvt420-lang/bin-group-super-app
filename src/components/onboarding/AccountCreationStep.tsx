import React, { useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Container, Grid, IconButton, InputAdornment,
    Paper, Stack, TextField, Typography,
} from '@mui/material';
import {
    ArrowBack, ArrowForward, Info, Lock, Login, Mail, Person, Phone, Visibility, VisibilityOff,
} from '@mui/icons-material';
import {
    createUserWithEmailAndPassword,
    fetchSignInMethodsForEmail,
    sendEmailVerification,
    signInWithEmailAndPassword,
    updateProfile,
} from 'firebase/auth';
import { auth, functions, httpsCallable } from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

interface AccountCreationStepProps {
    onNext: () => void;
    onBack: () => void;
    brokerUid?: string;
}

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.') || value.toLowerCase() === 'generic') return fallback;
    return value;
};

const normalizePhone = (value: string) => value.replace(/[^0-9+]/g, '').trim();
const authCode = (error: unknown) => String((error as { code?: unknown })?.code || 'auth/unknown');
const authMessage = (error: unknown) => String((error as { message?: unknown })?.message || '');
const isBlockingFunctionFailure = (error: unknown) => (
    authCode(error) === 'auth/internal-error' &&
    /BLOCKING_FUNCTION|HTTP Cloud Function|Page not found|requested URL was not found/i.test(authMessage(error))
);

export default function AccountCreationStep({ onBack, onNext, brokerUid = "" }: AccountCreationStepProps) {
    const { companyProfile, setOwnerAccount, setBrokerAttribution, intakeId, setIntakeId, onboardingSessionId } = useOnboardingStore();
    const { t, isRTL, lang } = useLanguage();
    const copy = (en: string, ar: string) => (lang === 'ar' ? ar : en);

    const [formData, setFormData] = useState({
        fullName: companyProfile.contactPerson || '',
        email: companyProfile.email || '',
        mobile: companyProfile.phone || '',
        password: '',
        confirmPassword: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checkingVerification, setCheckingVerification] = useState(false);
    const [error, setError] = useState<{ message: string; type: 'error' | 'warning' | 'info'; action?: 'signin' } | null>(null);
    const [accountReady, setAccountReady] = useState(false);

    const errorText = (key: string, fallback: string) => readable(t(key), fallback);

    const validateForm = () => {
        const fullName = formData.fullName.trim();
        const email = formData.email.trim().toLowerCase();
        const mobile = normalizePhone(formData.mobile);
        if (!fullName || !mobile || !email || !formData.password || !formData.confirmPassword) {
            return errorText('onboarding.error.all_fields', 'Please complete all account fields before continuing.');
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) return errorText('onboarding.error.invalid_email', 'Enter a valid email address.');
        if (mobile.length < 8) return copy('Enter a valid mobile number.', 'يرجى إدخال رقم هاتف صحيح.');
        if (formData.password.length < 8) return errorText('onboarding.error.weak_password', 'Password must be at least 8 characters.');
        if (formData.password !== formData.confirmPassword) return errorText('onboarding.error.password_mismatch', 'Passwords do not match.');
        return null;
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
            let credential;
            try {
                credential = await createUserWithEmailAndPassword(auth, email, formData.password);
            } catch (authError: any) {
                if (authError?.code !== 'auth/email-already-in-use') throw authError;
                try {
                    credential = await signInWithEmailAndPassword(auth, email, formData.password);
                } catch (signInError: any) {
                    const methods = await fetchSignInMethodsForEmail(auth, email).catch(() => [] as string[]);
                    if (methods.includes('google.com') && !methods.includes('password')) {
                        setError({ message: copy('This email uses Google sign-in. Sign in first, then resume owner onboarding.', 'هذا البريد يستخدم تسجيل الدخول عبر Google. سجّل الدخول أولاً ثم استأنف تسجيل المالك.'), type: 'info', action: 'signin' });
                    } else {
                        setError({ message: errorText('onboarding.error.email_exists', 'This email already exists. Sign in with the existing password or use another email.'), type: 'warning', action: 'signin' });
                    }
                    return;
                }
            }

            if (!credential.user.displayName) await updateProfile(credential.user, { displayName: fullName });
            const resolvedIntakeId = intakeId || onboardingSessionId || credential.user.uid;
            setIntakeId(resolvedIntakeId);
            setOwnerAccount({ uid: credential.user.uid, fullName, email, mobile });

            if (!credential.user.emailVerified) await sendEmailVerification(credential.user);
            setAccountReady(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err: unknown) {
            const code = authCode(err);
            console.error('[OwnerOnboarding] Account creation failed', {
                code,
                blockingFunctionFailure: isBlockingFunctionFailure(err),
                host: window.location.host,
            });
            if (code === 'auth/invalid-email') setError({ message: errorText('onboarding.error.invalid_email', 'Enter a valid email address.'), type: 'error' });
            else if (code === 'auth/weak-password') setError({ message: errorText('onboarding.error.weak_password', 'Password must be at least 8 characters.'), type: 'error' });
            else if (code === 'auth/network-request-failed') setError({ message: copy('Network connection failed. Check your connection and try again.', 'فشل الاتصال بالشبكة. تحقق من الاتصال وحاول مرة أخرى.'), type: 'error' });
            else if (code === 'auth/too-many-requests') setError({ message: copy('Too many attempts were made. Wait a few minutes, then try again.', 'تم إجراء محاولات كثيرة. انتظر بضع دقائق ثم حاول مرة أخرى.'), type: 'warning' });
            else if (code === 'auth/operation-not-allowed') setError({ message: copy('Secure account registration is temporarily unavailable. Please contact BIN GROUP support.', 'إنشاء الحساب الآمن غير متاح مؤقتاً. يرجى التواصل مع دعم BIN GROUP.'), type: 'error' });
            else if (isBlockingFunctionFailure(err)) setError({ message: copy('The secure account verification service is temporarily unavailable. BIN GROUP has been notified. Please retry shortly.', 'خدمة التحقق الآمن من الحساب غير متاحة مؤقتاً. تم إشعار BIN GROUP. يرجى المحاولة بعد قليل.'), type: 'error' });
            else setError({ message: `${errorText('onboarding.error.generic', 'Account creation failed. Please try again.')} [${code}]`, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const confirmEmailVerification = async () => {
        setCheckingVerification(true);
        setError(null);
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error(copy('Sign in again to verify the owner email.', 'سجّل الدخول مرة أخرى للتحقق من بريد المالك.'));
            await currentUser.reload();
            if (!currentUser.emailVerified) {
                setError({ message: copy('Email is not verified yet. Open the verification link, then return and try again.', 'لم يتم التحقق من البريد الإلكتروني بعد. افتح رابط التحقق ثم عد وحاول مرة أخرى.'), type: 'warning' });
                return;
            }
            await currentUser.getIdToken(true);
            const upsertProfile = httpsCallable(functions, 'upsertOwnerOnboardingProfile');
            await upsertProfile({
                fullName: formData.fullName.trim(),
                email: formData.email.trim().toLowerCase(),
                mobile: normalizePhone(formData.mobile),
                intakeId: intakeId || onboardingSessionId,
            });
            const tokenResult = await currentUser.getIdTokenResult(true);
            const resolvedRole = String(tokenResult.claims.role || tokenResult.claims.userRole || tokenResult.claims.primaryRole || '').toLowerCase();
            if (resolvedRole !== 'owner') throw new Error(copy('The verified Owner role is not ready yet. Retry in a moment.', 'دور المالك الموثق غير جاهز بعد. أعد المحاولة بعد لحظة.'));
            if (brokerUid) {
                if (!/^[A-Za-z0-9_-]{6,128}$/.test(brokerUid)) throw new Error(copy('The Broker referral link is invalid. Ask the Broker to share a new link.', 'رابط إحالة الوسيط غير صالح. اطلب من الوسيط إرسال رابط جديد.'));
                const captureReferral = httpsCallable(functions, 'captureBrokerReferralAttribution');
                const referralResponse = await captureReferral({
                    brokerUid,
                    intakeId: intakeId || onboardingSessionId,
                    onboardingSubmissionId: intakeId || onboardingSessionId,
                    ownerName: formData.fullName.trim(),
                });
                const referral = referralResponse.data as { referralCode?: string; attributionId?: string };
                setBrokerAttribution({
                    referralCode: referral.referralCode || referral.attributionId || brokerUid,
                    source: 'verified-owner-onboarding',
                    capturedAt: new Date().toISOString(),
                    landingPath: window.location.pathname + window.location.search,
                });
            }
            onNext();
        } catch (err: unknown) {
            const code = authCode(err);
            console.error('[OwnerOnboarding] Email verification confirmation failed', { code });
            setError({ message: copy(`Email verification could not be confirmed. Please retry. [${code}]`, `تعذر تأكيد البريد الإلكتروني. يرجى المحاولة مرة أخرى. [${code}]`), type: 'error' });
        } finally {
            setCheckingVerification(false);
        }
    };

    if (accountReady) {
        return (
            <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 }, textAlign: 'center' }} dir={isRTL ? 'rtl' : 'ltr'}>
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: { xs: 4, md: 8 }, bgcolor: 'rgba(22,22,24,0.82)', border: '1px solid #4ADE80' }}>
                    <Lock sx={{ color: '#4ADE80', fontSize: 52, mb: 2 }} />
                    <Typography variant="h4" fontWeight={950} color="#FFF">{copy('Owner account created', 'تم إنشاء حساب المالك')}</Typography>
                    <Typography sx={{ color: '#4ADE80', fontWeight: 800, mt: 2 }}>
                        {copy('Open the verification email, verify the address, then continue. Your dashboard stays locked until the property visit, 15% mobilisation payment, and Admin approval are complete.', 'افتح رسالة التحقق، أكد البريد، ثم تابع. تبقى لوحة التحكم مقفلة حتى زيارة العقار ودفع 15٪ والموافقة الإدارية.')}
                    </Typography>
                    {error && <Alert severity={error.type} sx={{ mt: 3, textAlign: 'left' }}>{error.message}</Alert>}
                    <Button variant="contained" onClick={confirmEmailVerification} disabled={checkingVerification} sx={{ mt: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5 }}>
                        {checkingVerification ? <CircularProgress size={22} color="inherit" /> : copy('I verified my email — Continue', 'تم التحقق من بريدي — متابعة')}
                    </Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 800, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 } }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight={950} color="#FFF">{readable(t('onboarding.acc_creation'), 'Create Owner Account')}</Typography>
                <Typography color="rgba(255,255,255,0.58)" sx={{ mt: 1 }}>{copy('Create and verify the secure Owner login used for this five-page application.', 'أنشئ وتحقق من حساب المالك الآمن المستخدم في طلب التسجيل المكون من خمس صفحات.')}</Typography>
            </Box>
            <Paper sx={{ p: { xs: 2.5, md: 5 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.68)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Alert icon={<Info sx={{ color: binThemeTokens.gold }} />} sx={{ mb: 3, bgcolor: 'rgba(212,175,55,0.06)', color: binThemeTokens.gold, border: '1px solid rgba(212,175,55,0.22)' }}>
                    {copy('No payment is collected on these five pages. BIN GROUP reviews the submission, visits the property, then requests the 15% mobilisation payment before Admin approval.', 'لا يتم تحصيل أي دفعة في هذه الصفحات الخمس. تراجع BIN GROUP الطلب وتزور العقار ثم تطلب دفعة التعبئة 15٪ قبل الموافقة الإدارية.')}
                </Alert>
                {error && <Alert severity={error.type} sx={{ mb: 3 }} action={error.action === 'signin' ? <Button color="inherit" size="small" onClick={() => { window.location.href = '/login'; }} startIcon={<Login />}>{readable(t('login.signin'), 'Sign in')}</Button> : undefined}>{error.message}</Alert>}
                <Stack spacing={2.5}>
                    <TextField label={readable(t('onboarding.full_name'), 'Full name')} fullWidth value={formData.fullName} onChange={(event) => setFormData({ ...formData, fullName: event.target.value })} InputProps={{ startAdornment: <Person sx={{ color: binThemeTokens.gold, mr: 1.5 }} /> }} />
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}><TextField label={readable(t('onboarding.mobile'), 'Mobile')} fullWidth value={formData.mobile} onChange={(event) => setFormData({ ...formData, mobile: event.target.value })} InputProps={{ startAdornment: <Phone sx={{ color: binThemeTokens.gold, mr: 1.5 }} /> }} /></Grid>
                        <Grid item xs={12} md={6}><TextField label={readable(t('onboarding.email'), 'Email')} type="email" fullWidth value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} InputProps={{ startAdornment: <Mail sx={{ color: binThemeTokens.gold, mr: 1.5 }} /> }} /></Grid>
                    </Grid>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}><TextField label={readable(t('onboarding.password'), 'Password')} type={showPassword ? 'text' : 'password'} fullWidth value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} InputProps={{ startAdornment: <Lock sx={{ color: binThemeTokens.gold, mr: 1.5 }} />, endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPassword((value) => !value)}>{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} /></Grid>
                        <Grid item xs={12} md={6}><TextField label={readable(t('onboarding.confirm_password'), 'Confirm password')} type={showPassword ? 'text' : 'password'} fullWidth value={formData.confirmPassword} onChange={(event) => setFormData({ ...formData, confirmPassword: event.target.value })} InputProps={{ startAdornment: <Lock sx={{ color: binThemeTokens.gold, mr: 1.5 }} /> }} /></Grid>
                    </Grid>
                    <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ pt: 2 }}>
                        <Button variant="outlined" fullWidth onClick={onBack} startIcon={!isRTL ? <ArrowBack /> : undefined} sx={{ py: 1.5, borderRadius: 100, fontWeight: 900 }}>{copy('Back', 'رجوع')}</Button>
                        <Button variant="contained" fullWidth onClick={handleSignup} disabled={loading} endIcon={!isRTL ? <ArrowForward /> : undefined} sx={{ py: 1.5, borderRadius: 100, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                            {loading ? <CircularProgress size={22} color="inherit" /> : copy('Create secure account', 'إنشاء حساب آمن')}
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
        </Box>
    );
}
