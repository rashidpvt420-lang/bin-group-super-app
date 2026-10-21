import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Divider, IconButton, InputAdornment,
    LinearProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import {
    ArrowBack, ArrowForward, Edit, Google, Lock, Login, Mail, MarkEmailRead, Visibility, VisibilityOff,
} from '@mui/icons-material';
import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    onAuthStateChanged,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    signOut,
    updateProfile,
    type User,
} from 'firebase/auth';
import { auth, functions, httpsCallable } from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { entriesMatch,
    existingRoleConflict,
    OWNER_PASSWORD_MIN_LENGTH,
    passwordStrength,
    resendCooldownRemaining,
    roleConflictMessage,
    VERIFICATION_SENT_AT_KEY,
} from './ownerAccountRules';

interface AccountCreationStepProps {
    onNext: () => void;
    onBack: () => void;
    brokerUid?: string;
}

type Notice = { message: string; type: 'error' | 'warning' | 'info' | 'success' };
type Mode = 'create' | 'existing';

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
const readSentAt = () => {
    try { return Number(window.localStorage.getItem(VERIFICATION_SENT_AT_KEY) || 0); } catch { return 0; }
};
const writeSentAt = (value: number) => {
    try { window.localStorage.setItem(VERIFICATION_SENT_AT_KEY, String(value)); } catch { /* storage unavailable */ }
};

export default function AccountCreationStep({ onBack, onNext, brokerUid = "" }: AccountCreationStepProps) {
    const { companyProfile, ownerAccount, setOwnerAccount, setBrokerAttribution, intakeId, setIntakeId, onboardingSessionId } = useOnboardingStore();
    const { t, isRTL, lang } = useLanguage();
    const copy = (en: string, ar: string) => (lang === 'ar' ? ar : en);
    const errorText = (key: string, fallback: string) => readable(t(key), fallback);

    // Identity comes from section 0 (CompanyProfileStep); it is typed once and edited there.
    const fullName = String(companyProfile.contactPerson || ownerAccount?.fullName || '').trim();
    const mobile = normalizePhone(String(companyProfile.phone || ownerAccount?.mobile || ''));
    const profileEmail = String(companyProfile.email || ownerAccount?.email || '').trim().toLowerCase();

    const [authUser, setAuthUser] = useState<User | null>(() => auth.currentUser);
    const [authResolved, setAuthResolved] = useState(false);
    const [mode, setMode] = useState<Mode>('create');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checkingVerification, setCheckingVerification] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const continuingRef = useRef(false);

    useEffect(() => onAuthStateChanged(auth, (user) => {
        setAuthUser(user && !user.isAnonymous ? user : null);
        setAuthResolved(true);
    }), []);

    const signedInEmail = String(authUser?.email || '').toLowerCase();
    const awaitingVerification = Boolean(authUser && !authUser.emailVerified);
    const cooldownMs = resendCooldownRemaining(readSentAt(), now);
    const strength = passwordStrength(password);

    useEffect(() => {
        if (!awaitingVerification || cooldownMs <= 0) return undefined;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [awaitingVerification, cooldownMs]);

    const bindSignedInOwner = useCallback((user: User) => {
        const resolvedIntakeId = intakeId || onboardingSessionId || user.uid;
        setIntakeId(resolvedIntakeId);
        setOwnerAccount({ uid: user.uid, fullName: fullName || user.displayName || '', email: String(user.email || profileEmail).toLowerCase(), mobile });
    }, [fullName, intakeId, mobile, onboardingSessionId, profileEmail, setIntakeId, setOwnerAccount]);

    const sendVerification = async (user: User, force = false) => {
        if (user.emailVerified) return;
        if (!force && resendCooldownRemaining(readSentAt(), Date.now()) > 0) return;
        auth.languageCode = isRTL ? 'ar' : 'en';
        await sendEmailVerification(user, { url: `${window.location.origin}/onboarding`, handleCodeInApp: false })
            .catch(() => sendEmailVerification(user));
        writeSentAt(Date.now());
        setNow(Date.now());
    };

    /** Refuses accounts that already belong to another portal role. Returns true when blocked. */
    const blockedByOtherRole = async (user: User) => {
        const token = await user.getIdTokenResult(true);
        const conflict = existingRoleConflict(token.claims.role || token.claims.userRole || token.claims.primaryRole);
        if (!conflict) return false;
        await signOut(auth).catch(() => undefined);
        setOwnerAccount(null);
        setMode('create');
        setNotice({ message: roleConflictMessage(conflict, lang), type: 'error' });
        return true;
    };

    const afterSignIn = async (user: User) => {
        if (await blockedByOtherRole(user)) return;
        if (!user.displayName && fullName) await updateProfile(user, { displayName: fullName }).catch(() => undefined);
        bindSignedInOwner(user);
        setPassword('');
        setConfirmPassword('');
        if (!user.emailVerified) await sendVerification(user);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const mapAuthError = (err: unknown): Notice => {
        const code = authCode(err);
        if (code === 'auth/invalid-email') return { message: errorText('onboarding.error.invalid_email', 'Enter a valid email address.'), type: 'error' };
        if (code === 'auth/weak-password') return { message: errorText('onboarding.error.weak_password', 'Password must be at least 8 characters.'), type: 'error' };
        if (code === 'auth/password-does-not-meet-requirements') return { message: copy('This password does not meet the security policy. Use 8+ characters with upper and lower case letters and a number.', 'كلمة المرور لا تستوفي سياسة الأمان. استخدم 8 أحرف على الأقل مع أحرف كبيرة وصغيرة ورقم.'), type: 'error' };
        if (code === 'auth/network-request-failed') return { message: copy('Network connection failed. Check your connection and try again.', 'فشل الاتصال بالشبكة. تحقق من الاتصال وحاول مرة أخرى.'), type: 'error' };
        if (code === 'auth/too-many-requests') return { message: copy('Too many attempts were made. Wait a few minutes, then try again.', 'تم إجراء محاولات كثيرة. انتظر بضع دقائق ثم حاول مرة أخرى.'), type: 'error' };
        if (code === 'auth/operation-not-allowed') return { message: copy('Secure account registration is temporarily unavailable. Please contact BIN GROUP support.', 'إنشاء الحساب الآمن غير متاح مؤقتاً. يرجى التواصل مع دعم BIN GROUP.'), type: 'error' };
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials') return { message: copy('That password is not correct for this email. Try again, reset it, or use Google.', 'كلمة المرور غير صحيحة لهذا البريد. حاول مرة أخرى أو أعد تعيينها أو استخدم Google.'), type: 'error' };
        if (code === 'auth/popup-closed-by-user') return { message: copy('Google sign-in was closed before it finished.', 'تم إغلاق تسجيل الدخول عبر Google قبل اكتماله.'), type: 'info' };
        if (isBlockingFunctionFailure(err)) return { message: copy('The secure account verification service is temporarily unavailable. BIN GROUP has been notified. Please retry shortly.', 'خدمة التحقق من الحساب الآمن غير متاحة مؤقتاً. تم إبلاغ BIN GROUP. يرجى المحاولة بعد قليل.'), type: 'error' };
        return { message: `${errorText('onboarding.error.generic', 'Account creation failed. Please try again.')} [${code}]`, type: 'error' };
    };

    const validateCreate = () => {
        if (!fullName || !mobile || !profileEmail) return copy('Complete your name, mobile and email in the previous section first.', 'أكمل الاسم والهاتف والبريد في القسم السابق أولاً.');
        if (!/^\S+@\S+\.\S+$/.test(profileEmail)) return errorText('onboarding.error.invalid_email', 'Enter a valid email address.');
        if (!strength.meetsMinimum) return errorText('onboarding.error.weak_password', 'Password must be at least 8 characters.');
        if (!entriesMatch(password, confirmPassword)) return errorText('onboarding.error.password_mismatch', 'Passwords do not match.');
        return null;
    };

    const handleCreate = async () => {
        setNotice(null);
        const validationError = validateCreate();
        if (validationError) { setNotice({ message: validationError, type: 'error' }); return; }
        setLoading(true);
        try {
            const credential = await createUserWithEmailAndPassword(auth, profileEmail, password);
            await afterSignIn(credential.user);
        } catch (err: unknown) {
            if (authCode(err) === 'auth/email-already-in-use') {
                // Do not probe sign-in methods (enumeration protection hides them). Offer every way in.
                setMode('existing');
                setConfirmPassword('');
                setNotice({ message: copy('This email already has a BIN GROUP account. Sign in below to continue your application.', 'هذا البريد لديه حساب BIN GROUP بالفعل. سجّل الدخول أدناه لمتابعة طلبك.'), type: 'info' });
            } else {
                console.error('[OwnerOnboarding] Account creation failed', { code: authCode(err), blockingFunctionFailure: isBlockingFunctionFailure(err) });
                setNotice(mapAuthError(err));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSignIn = async () => {
        setNotice(null);
        if (!password) { setNotice({ message: copy('Enter the password for this email.', 'أدخل كلمة المرور لهذا البريد.'), type: 'error' }); return; }
        setLoading(true);
        try {
            const credential = await signInWithEmailAndPassword(auth, profileEmail, password);
            await afterSignIn(credential.user);
        } catch (err: unknown) {
            setNotice(mapAuthError(err));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        setNotice(null);
        setLoading(true);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account', ...(profileEmail ? { login_hint: profileEmail } : {}) });
        try {
            const result = await signInWithPopup(auth, provider);
            await afterSignIn(result.user);
        } catch (err: unknown) {
            const code = authCode(err);
            if (['auth/popup-blocked', 'auth/cancelled-popup-request', 'auth/web-storage-unsupported', 'auth/operation-not-supported-in-this-environment'].includes(code)) {
                await signInWithRedirect(auth, provider);
                return;
            }
            setNotice(mapAuthError(err));
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        setNotice(null);
        setLoading(true);
        try {
            auth.languageCode = isRTL ? 'ar' : 'en';
            await sendPasswordResetEmail(auth, profileEmail, { url: `${window.location.origin}/onboarding`, handleCodeInApp: false });
            setNotice({ message: copy('Password reset email sent. Set a new password, then come back here and sign in.', 'تم إرسال بريد إعادة تعيين كلمة المرور. عيّن كلمة جديدة ثم عد هنا وسجّل الدخول.'), type: 'success' });
        } catch (err: unknown) {
            setNotice(mapAuthError(err));
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        await signOut(auth).catch(() => undefined);
        setOwnerAccount(null);
        setMode('create');
        setPassword('');
        setConfirmPassword('');
        setNotice(null);
    };

    const handleChangeEmail = async () => {
        await handleSignOut();
        onBack();
    };

    const handleResend = async () => {
        if (!authUser) return;
        setNotice(null);
        try {
            await sendVerification(authUser, true);
            setNotice({ message: copy(`Verification email sent again to ${signedInEmail}. Check spam if it does not arrive.`, `تمت إعادة إرسال رسالة التحقق إلى ${signedInEmail}. تحقق من البريد غير المرغوب إذا لم تصل.`), type: 'success' });
        } catch (err: unknown) {
            setNotice(mapAuthError(err));
        }
    };

    const confirmEmailVerification = useCallback(async (silent = false) => {
        if (continuingRef.current) return;
        continuingRef.current = true;
        setCheckingVerification(true);
        if (!silent) setNotice(null);
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error(copy('Sign in again to verify the owner email.', 'سجّل الدخول مرة أخرى للتحقق من بريد المالك.'));
            await currentUser.reload();
            if (!currentUser.emailVerified) {
                if (!silent) setNotice({ message: copy('Email is not verified yet. Open the verification link, then return and try again.', 'لم يتم التحقق من البريد الإلكتروني بعد. افتح رابط التحقق ثم عد وحاول مرة أخرى.'), type: 'warning' });
                return;
            }
            setAuthUser(auth.currentUser);
            await currentUser.getIdToken(true);
            const upsertProfile = httpsCallable(functions, 'upsertOwnerOnboardingProfile');
            await upsertProfile({
                fullName: fullName || currentUser.displayName || '',
                email: String(currentUser.email || '').toLowerCase(),
                mobile,
                intakeId: intakeId || onboardingSessionId,
            });
            const tokenResult = await currentUser.getIdTokenResult(true);
            const resolvedRole = String(tokenResult.claims.role || tokenResult.claims.userRole || tokenResult.claims.primaryRole || '').toLowerCase();
            if (resolvedRole !== 'owner') {
                const conflict = existingRoleConflict(resolvedRole);
                throw new Error(conflict ? roleConflictMessage(conflict, lang) : copy('The verified Owner role is not ready yet. Retry in a moment.', 'دور المالك الموثق غير جاهز بعد. أعد المحاولة بعد لحظات.'));
            }
            if (brokerUid) {
                if (!/^[A-Za-z0-9_-]{6,128}$/.test(brokerUid)) throw new Error(copy('The Broker referral link is invalid. Ask the Broker to share a new link.', 'رابط إحالة الوسيط غير صالح. اطلب من الوسيط مشاركة رابط جديد.'));
                const captureReferral = httpsCallable(functions, 'captureBrokerReferralAttribution');
                const referralResponse = await captureReferral({
                    brokerUid,
                    intakeId: intakeId || onboardingSessionId,
                    onboardingSubmissionId: intakeId || onboardingSessionId,
                    ownerName: fullName,
                });
                const referral = referralResponse.data as { referralCode?: string; attributionId?: string };
                setBrokerAttribution({
                    referralCode: referral.referralCode || referral.attributionId || brokerUid,
                    source: 'verified-owner-onboarding',
                    capturedAt: new Date().toISOString(),
                    landingPath: window.location.pathname + window.location.search,
                });
            }
            bindSignedInOwner(currentUser);
            onNext();
        } catch (err: unknown) {
            const code = authCode(err);
            console.error('[OwnerOnboarding] Email verification confirmation failed', { code });
            const message = err instanceof Error && code === 'auth/unknown' && err.message ? err.message : copy(`Email verification could not be confirmed. Please retry. [${code}]`, `تعذر تأكيد البريد الإلكتروني. يرجى المحاولة مرة أخرى. [${code}]`);
            setNotice({ message, type: 'error' });
        } finally {
            continuingRef.current = false;
            setCheckingVerification(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bindSignedInOwner, brokerUid, fullName, intakeId, lang, mobile, onNext, onboardingSessionId, setBrokerAttribution]);

    // Re-check verification when the owner returns from the email link and every few seconds while waiting.
    useEffect(() => {
        if (!awaitingVerification) return undefined;
        const check = () => { if (document.visibilityState === 'visible') void confirmEmailVerification(true); };
        document.addEventListener('visibilitychange', check);
        window.addEventListener('focus', check);
        const poll = window.setInterval(check, 6000);
        return () => {
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('focus', check);
            window.clearInterval(poll);
        };
    }, [awaitingVerification, confirmEmailVerification]);

    const card = { p: { xs: 2.5, md: 4 }, borderRadius: 4, bgcolor: binThemeTokens.card, border: `1px solid ${binThemeTokens.border}` };
    const noticeBlock = notice && <Alert severity={notice.type} sx={{ textAlign: isRTL ? 'right' : 'left' }}>{notice.message}</Alert>;
    const paymentNote = (
        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, display: 'block', textAlign: 'center' }}>
            {copy('No payment is collected on these five pages. The 15% mobilisation is requested only after the property visit.', 'لا يتم تحصيل أي دفعة في هذه الصفحات الخمس. تُطلب دفعة 15٪ فقط بعد زيارة العقار.')}
        </Typography>
    );

    if (!authResolved) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress sx={{ color: binThemeTokens.goldText }} /></Box>;
    }

    // Signed in but not yet verified: resumable verification screen.
    if (authUser && awaitingVerification) {
        const seconds = Math.ceil(cooldownMs / 1000);
        return (
            <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 560, mx: 'auto', width: '100%', pb: { xs: 14, md: 4 } }}>
                <Paper elevation={0} sx={{ ...card, textAlign: 'center' }}>
                    <Stack spacing={2} alignItems="center">
                        <MarkEmailRead sx={{ color: binThemeTokens.goldText, fontSize: 48 }} />
                        <Typography variant="h6" fontWeight={950} sx={{ color: binThemeTokens.textPrimary }}>{copy('Verify your email', 'تحقق من بريدك الإلكتروني')}</Typography>
                        <Typography sx={{ color: binThemeTokens.textSecondary }}>
                            {copy('We sent a verification link to', 'أرسلنا رابط التحقق إلى')} <Box component="strong" sx={{ color: binThemeTokens.textPrimary, wordBreak: 'break-all' }}>{signedInEmail}</Box>
                        </Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                            {copy('Open the link, then come back. This page continues automatically once the email is verified.', 'افتح الرابط ثم عد. ستتابع هذه الصفحة تلقائياً بعد التحقق من البريد.')}
                        </Typography>
                        {checkingVerification && <LinearProgress sx={{ width: '100%' }} />}
                        {noticeBlock && <Box sx={{ width: '100%' }}>{noticeBlock}</Box>}
                        <Button variant="contained" fullWidth onClick={() => void confirmEmailVerification(false)} disabled={checkingVerification} sx={{ py: 1.4, borderRadius: 100, fontWeight: 950 }}>
                            {checkingVerification ? <CircularProgress size={22} color="inherit" /> : copy("I've verified — continue", 'تم التحقق — متابعة')}
                        </Button>
                        <Button variant="outlined" fullWidth onClick={handleResend} disabled={cooldownMs > 0} startIcon={<Mail />} sx={{ py: 1.2, borderRadius: 100, fontWeight: 900 }}>
                            {cooldownMs > 0 ? copy(`Resend email in ${seconds}s`, `إعادة الإرسال بعد ${seconds} ث`) : copy('Resend verification email', 'إعادة إرسال رسالة التحقق')}
                        </Button>
                        <Button variant="text" onClick={handleChangeEmail} startIcon={<Edit />} sx={{ color: binThemeTokens.goldText, fontWeight: 900 }}>
                            {copy('Use a different email', 'استخدام بريد مختلف')}
                        </Button>
                    </Stack>
                </Paper>
            </Box>
        );
    }

    // Already signed in and verified: no password re-entry.
    if (authUser) {
        return (
            <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 560, mx: 'auto', width: '100%', pb: { xs: 14, md: 4 } }}>
                <Paper elevation={0} sx={{ ...card }}>
                    <Stack spacing={2}>
                        <Typography variant="h6" fontWeight={950} sx={{ color: binThemeTokens.textPrimary }}>{copy('You are signed in', 'أنت مسجل الدخول')}</Typography>
                        <Typography sx={{ color: binThemeTokens.textSecondary, wordBreak: 'break-all' }}>{signedInEmail}</Typography>
                        {noticeBlock}
                        <Button variant="contained" fullWidth onClick={() => void confirmEmailVerification(false)} disabled={checkingVerification} endIcon={!isRTL ? <ArrowForward /> : undefined} sx={{ py: 1.4, borderRadius: 100, fontWeight: 950 }}>
                            {checkingVerification ? <CircularProgress size={22} color="inherit" /> : copy(`Continue as ${signedInEmail}`, `المتابعة باسم ${signedInEmail}`)}
                        </Button>
                        <Button variant="text" onClick={handleSignOut} sx={{ color: binThemeTokens.goldText, fontWeight: 900 }}>{copy('Not you? Sign out', 'لست أنت؟ تسجيل الخروج')}</Button>
                        {paymentNote}
                    </Stack>
                </Paper>
            </Box>
        );
    }

    const strengthLabel = [copy('Too short', 'قصيرة جداً'), copy('Weak', 'ضعيفة'), copy('Fair', 'مقبولة'), copy('Good', 'جيدة'), copy('Strong', 'قوية')][strength.score];
    const visibilityToggle = (
        <InputAdornment position="end">
            <IconButton aria-label={showPassword ? copy('Hide password', 'إخفاء كلمة المرور') : copy('Show password', 'إظهار كلمة المرور')} onClick={() => setShowPassword((value) => !value)} edge="end">
                {showPassword ? <VisibilityOff /> : <Visibility />}
            </IconButton>
        </InputAdornment>
    );

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 560, mx: 'auto', width: '100%', pb: { xs: 14, md: 4 } }}>
            <Paper elevation={0} sx={{ ...card }}>
                <Stack spacing={2.2}>
                    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: binThemeTokens.softCanvas, border: `1px solid ${binThemeTokens.border}` }}>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="flex-start" gap={1}>
                            <Box sx={{ minWidth: 0, textAlign: isRTL ? 'right' : 'left' }}>
                                <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>{fullName || '—'}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, wordBreak: 'break-all' }}>{profileEmail || '—'}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{mobile || '—'}</Typography>
                            </Box>
                            <Button size="small" onClick={onBack} startIcon={<Edit />} sx={{ color: binThemeTokens.goldText, fontWeight: 900, flexShrink: 0 }}>{copy('Edit', 'تعديل')}</Button>
                        </Stack>
                    </Box>

                    {mode === 'existing' ? (
                        <>
                            <TextField
                                label={copy('Password for this email', 'كلمة المرور لهذا البريد')}
                                type={showPassword ? 'text' : 'password'} autoComplete="current-password" fullWidth value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Lock sx={{ color: binThemeTokens.goldText }} /></InputAdornment>, endAdornment: visibilityToggle }}
                            />
                            {noticeBlock}
                            <Button variant="contained" fullWidth onClick={handleSignIn} disabled={loading} startIcon={<Login />} sx={{ py: 1.4, borderRadius: 100, fontWeight: 950 }}>
                                {loading ? <CircularProgress size={22} color="inherit" /> : copy('Sign in and continue', 'تسجيل الدخول والمتابعة')}
                            </Button>
                            <Button variant="outlined" fullWidth onClick={handleGoogle} disabled={loading} startIcon={<Google />} sx={{ py: 1.2, borderRadius: 100, fontWeight: 900 }}>
                                {copy('Continue with Google', 'المتابعة باستخدام Google')}
                            </Button>
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" flexWrap="wrap" gap={1}>
                                <Button variant="text" onClick={handleReset} disabled={loading} sx={{ color: binThemeTokens.goldText, fontWeight: 900 }}>{copy('Forgot password?', 'نسيت كلمة المرور؟')}</Button>
                                <Button variant="text" onClick={() => { setMode('create'); setNotice(null); onBack(); }} sx={{ color: binThemeTokens.goldText, fontWeight: 900 }}>{copy('Use a different email', 'استخدام بريد مختلف')}</Button>
                            </Stack>
                        </>
                    ) : (
                        <>
                            <TextField
                                label={readable(t('onboarding.password'), copy('Create a password', 'أنشئ كلمة مرور'))}
                                type={showPassword ? 'text' : 'password'} autoComplete="new-password" fullWidth value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                helperText={copy(`At least ${OWNER_PASSWORD_MIN_LENGTH} characters. Mixing letters, numbers and symbols makes it stronger.`, `${OWNER_PASSWORD_MIN_LENGTH} أحرف على الأقل. المزج بين الأحرف والأرقام والرموز يجعلها أقوى.`)}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Lock sx={{ color: binThemeTokens.goldText }} /></InputAdornment>, endAdornment: visibilityToggle }}
                            />
                            {password && (
                                <Box aria-live="polite">
                                    <LinearProgress variant="determinate" value={strength.score * 25} aria-label={copy('Password strength', 'قوة كلمة المرور')} color={strength.score >= 3 ? 'success' : strength.score >= 2 ? 'warning' : 'error'} sx={{ height: 6, borderRadius: 99 }} />
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{strengthLabel}</Typography>
                                </Box>
                            )}
                            <TextField
                                label={readable(t('onboarding.confirm_password'), copy('Confirm password', 'تأكيد كلمة المرور'))}
                                type={showPassword ? 'text' : 'password'} autoComplete="new-password" fullWidth value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                error={Boolean(confirmPassword) && confirmPassword !== password}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Lock sx={{ color: binThemeTokens.goldText }} /></InputAdornment> }}
                            />
                            {noticeBlock}
                            <Button variant="contained" fullWidth onClick={handleCreate} disabled={loading} endIcon={!isRTL ? <ArrowForward /> : undefined} sx={{ py: 1.4, borderRadius: 100, fontWeight: 950 }}>
                                {loading ? <CircularProgress size={22} color="inherit" /> : copy('Create account and verify email', 'إنشاء الحساب والتحقق من البريد')}
                            </Button>
                            <Divider />
                            <Button variant="text" fullWidth onClick={() => { setMode('existing'); setNotice(null); setConfirmPassword(''); }} startIcon={<Login />} sx={{ color: binThemeTokens.goldText, fontWeight: 900 }}>
                                {copy('I already have an account — sign in', 'لدي حساب بالفعل — تسجيل الدخول')}
                            </Button>
                        </>
                    )}
                    <Button variant="text" onClick={onBack} startIcon={!isRTL ? <ArrowBack /> : undefined} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: binThemeTokens.textSecondary, fontWeight: 800 }}>{copy('Back', 'رجوع')}</Button>
                    {paymentNote}
                </Stack>
            </Paper>
        </Box>
    );
}
