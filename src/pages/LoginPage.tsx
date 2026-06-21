import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Container,
    Divider,
    Grid,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    Typography,
    alpha,
} from '@mui/material';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useRole } from '../context/RoleContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import {
    GoogleAuthProvider,
    browserLocalPersistence,
    getRedirectResult,
    sendPasswordResetEmail,
    setPersistence,
    signInWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    signOut,
} from 'firebase/auth';
import { ArrowLeft, AlertTriangle, Building, Eye, EyeOff, Key, Mail, Shield, TrendingUp, UserCircle } from 'lucide-react';
import SafeIcon, { renderSafeIcon } from '../components/SafeIcon';
import { CeoContactButtons } from '../components/CeoContactButtons';

type NoticeState = { type: 'success' | 'error' | 'info' | 'warning'; text: string };

const palette = {
    canvas: '#FFFFFF',
    soft: '#F8F9FB',
    card: '#FFFFFF',
    ink: '#111827',
    muted: '#667085',
    border: '#E5E7EB',
    gold: binThemeTokens.gold,
};

const GOOGLE_REDIRECT_INTENT_KEY = 'bin_google_redirect_intended_role';
const GOOGLE_REDIRECT_RETURN_TO_KEY = 'bin_google_redirect_return_to';

const LoginPage: React.FC = () => {
    const { t, tx, isRTL, lang, setLang } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const { role, isAdmin, loading: roleLoading, status: roleStatus, refreshRole } = useRole();
    const [signingOut, setSigningOut] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localLoading, setLocalLoading] = useState(false);
    const [notice, setNotice] = useState<NoticeState | null>(null);

    const queryParams = new URLSearchParams(location.search);
    const intendedRole = queryParams.get('intendedRole');
    const returnToParam = queryParams.get('returnTo') || (location.state as any)?.returnTo || '';
    const ownerEmailParam = queryParams.get('ownerEmail') || queryParams.get('email') || (location.state as any)?.ownerEmail || '';
    const safeReturnTo = returnToParam.startsWith('/') && !returnToParam.startsWith('//') ? returnToParam : '';
    const intendedRoleKey = intendedRole?.toLowerCase();

    useEffect(() => {
        if (ownerEmailParam && !email) setEmail(ownerEmailParam.trim().toLowerCase());
    }, [ownerEmailParam, email]);

    const resolvePostLoginTarget = () => {
        const resolvedRole = isAdmin ? 'admin' : role;
        const roleMatchesIntent = !intendedRoleKey || intendedRoleKey === resolvedRole || (intendedRoleKey === 'owner' && resolvedRole === 'owner');
        if (safeReturnTo && roleMatchesIntent) return safeReturnTo;
        if (resolvedRole === 'tenant') return '/tenant/dashboard';
        if (resolvedRole === 'technician') return '/technician/dashboard';
        if (resolvedRole === 'broker') return '/broker/dashboard';
        if (resolvedRole === 'admin') return '/admin/dashboard';
        if (intendedRoleKey === 'admin') return '/admin/dashboard';
        if (intendedRoleKey === 'tenant') return '/tenant/dashboard';
        if (intendedRoleKey === 'technician') return '/technician/dashboard';
        if (intendedRoleKey === 'broker') return '/broker/dashboard';
        return '/owner/dashboard';
    };

    useEffect(() => {
        if (!roleLoading && role) navigate(resolvePostLoginTarget(), { replace: Boolean(safeReturnTo) });
    }, [role, isAdmin, roleLoading, navigate, safeReturnTo, intendedRoleKey]);

    const getFriendlyAuthError = (err: any) => {
        const code = err?.code || '';
        const message = err?.message || '';
        if (import.meta.env.DEV) {
            console.error('[AUTH_DIAGNOSTIC]', { code, authDomain: auth.config?.authDomain, env: import.meta.env.MODE });
        }
        if (code === 'auth/invalid-email') return tx('login.error.invalid_email', 'Please enter a valid email address.');
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return t('login.error.invalid');
        if (code === 'auth/too-many-requests') return t('login.error.too_many');
        if (code === 'auth/popup-closed-by-user') return tx('login.error.popup_closed', 'Google sign-in was closed before completion. Try again or use email and password.');
        if (code === 'auth/popup-blocked') return tx('login.error.popup_blocked', 'The browser blocked the Google sign-in popup. A redirect sign-in will be attempted.');
        if (code === 'auth/unauthorized-domain') return tx('login.error.unauthorized_domain', 'This domain is not authorized for Firebase Google sign-in. Add the hosting domain in Firebase Authentication settings.');
        if (code === 'auth/operation-not-allowed') return tx('login.error.provider_disabled', 'This sign-in method is not enabled in Firebase Authentication. Enable Google or Email/Password sign-in first.');
        if (code === 'auth/account-exists-with-different-credential') return tx('login.error.account_exists', 'This email already exists with another sign-in method. Sign in using email/password first, then link Google later.');
        if (code === 'auth/network-request-failed') return t('login.error.network');
        return tx('login.error.generic', 'Login could not be completed. Please contact BIN GROUP support.');
    };

    useEffect(() => {
        let mounted = true;
        const completeGoogleRedirect = async () => {
            try {
                const result = await getRedirectResult(auth);
                if (!mounted || !result?.user) return;
                await result.user.getIdToken(true).catch(() => undefined);
                await refreshRole();
                const storedReturnTo = sessionStorage.getItem(GOOGLE_REDIRECT_RETURN_TO_KEY) || '';
                const storedIntent = sessionStorage.getItem(GOOGLE_REDIRECT_INTENT_KEY) || intendedRoleKey || '';
                sessionStorage.removeItem(GOOGLE_REDIRECT_RETURN_TO_KEY);
                sessionStorage.removeItem(GOOGLE_REDIRECT_INTENT_KEY);
                if (storedReturnTo.startsWith('/') && !storedReturnTo.startsWith('//')) {
                    navigate(storedReturnTo, { replace: true });
                    return;
                }
                if (storedIntent === 'admin') navigate('/admin/dashboard', { replace: true });
                else if (storedIntent === 'tenant') navigate('/tenant/dashboard', { replace: true });
                else if (storedIntent === 'technician') navigate('/technician/dashboard', { replace: true });
                else if (storedIntent === 'broker') navigate('/broker/dashboard', { replace: true });
            } catch (err: any) {
                if (mounted) setNotice({ type: 'error', text: getFriendlyAuthError(err) });
            }
        };
        void completeGoogleRedirect();
        return () => { mounted = false; };
    }, []);

    const handleGoogleLogin = async () => {
        setLocalLoading(true);
        setNotice(null);
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await setPersistence(auth, browserLocalPersistence).catch(() => undefined);
            sessionStorage.setItem(GOOGLE_REDIRECT_INTENT_KEY, intendedRoleKey || '');
            sessionStorage.setItem(GOOGLE_REDIRECT_RETURN_TO_KEY, safeReturnTo || '');

            try {
                const result = await signInWithPopup(auth, provider);
                if (result.user) {
                    await result.user.getIdToken(true).catch(() => undefined);
                    await refreshRole();
                    if (safeReturnTo && (!intendedRoleKey || intendedRoleKey === 'owner')) navigate(safeReturnTo, { replace: true });
                }
            } catch (popupErr: any) {
                const popupCode = popupErr?.code || '';
                const shouldRedirect = [
                    'auth/popup-blocked',
                    'auth/cancelled-popup-request',
                    'auth/web-storage-unsupported',
                ].includes(popupCode);
                if (shouldRedirect) {
                    await signInWithRedirect(auth, provider);
                    return;
                }
                throw popupErr;
            }
        } catch (err: any) {
            setNotice({ type: 'error', text: getFriendlyAuthError(err) });
            setLocalLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalLoading(true);
        setNotice(null);
        try {
            await setPersistence(auth, browserLocalPersistence).catch(() => undefined);
            const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            await userCredential.user.getIdToken(true).catch(() => undefined);
            await refreshRole();
            if (safeReturnTo && (!intendedRoleKey || intendedRoleKey === 'owner')) navigate(safeReturnTo, { replace: true });
        } catch (err: any) {
            setNotice({ type: 'error', text: getFriendlyAuthError(err) });
            setLocalLoading(false);
        }
    };

    const handlePasswordReset = async () => {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
            setNotice({ type: 'warning', text: tx('login.reset.enter_email', 'Enter your registered email address first, then tap Forgot password again.') });
            return;
        }
        setLocalLoading(true);
        setNotice(null);
        try {
            auth.languageCode = isRTL ? 'ar' : 'en';
            const resetUrl = `${window.location.origin}/login?email=${encodeURIComponent(normalizedEmail)}${intendedRoleKey ? `&intendedRole=${encodeURIComponent(intendedRoleKey)}` : ''}`;
            await sendPasswordResetEmail(auth, normalizedEmail, { url: resetUrl, handleCodeInApp: false });
            setNotice({ type: 'success', text: tx('login.reset.sent', 'Password reset email sent. Check your inbox or spam folder, then return here to sign in.') });
        } catch (err: any) {
            setNotice({ type: 'error', text: getFriendlyAuthError(err) });
        } finally {
            setLocalLoading(false);
        }
    };

    const getRoleTitle = () => {
        if (!intendedRole) return t('login.portal');
        return t(`gateway.role.${intendedRole.toLowerCase()}`);
    };

    if (roleLoading) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: palette.canvas, display: 'grid', placeItems: 'center', color: palette.ink }}>
                <Stack alignItems="center" spacing={2}>
                    <CircularProgress sx={{ color: palette.gold }} />
                    <Typography variant="h6" sx={{ color: palette.gold, fontWeight: 950 }}>{t('common.auth_sync')}</Typography>
                </Stack>
            </Box>
        );
    }

    if (!role && roleStatus === 'role_required') {
        const handleTryDifferentAccount = async () => {
            setSigningOut(true);
            try {
                await signOut(auth);
            } catch (err) {
                console.error('[AUTH] Sign-out failed while clearing a role_required session.', err);
            } finally {
                setSigningOut(false);
            }
        };
        return (
            <Box sx={{
                minHeight: '100vh',
                bgcolor: palette.canvas,
                display: 'grid',
                placeItems: 'center',
                p: 2,
                direction: isRTL ? 'rtl' : 'ltr',
            }}>
                <Container maxWidth="sm">
                    <Card sx={{
                        bgcolor: palette.card,
                        border: `1px solid ${palette.border}`,
                        borderTop: `3px solid ${palette.gold}`,
                        borderRadius: 3,
                        boxShadow: '0 22px 60px rgba(17,24,39,0.12)',
                    }}>
                        <CardContent sx={{ p: { xs: 2.5, sm: 4 }, textAlign: 'center' }}>
                            <SafeIcon icon={AlertTriangle} size={36} style={{ color: palette.gold, marginBottom: 12 }} />
                            <Typography variant="h6" fontWeight={950} sx={{ color: palette.ink, mb: 1 }}>
                                {tx('login.role_required.title', 'Account Setup Incomplete')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: palette.muted, fontWeight: 600, mb: 3 }}>
                                {tx('login.role_required.body', 'Your account is signed in, but no role has been assigned yet. Please contact support or try a different account.')}
                            </Typography>
                            <Stack spacing={1.5} alignItems="center">
                                <Button
                                    variant="contained"
                                    disabled={signingOut}
                                    onClick={handleTryDifferentAccount}
                                    sx={{ bgcolor: palette.gold, color: '#111827', fontWeight: 900, px: 3, '&:hover': { bgcolor: palette.gold } }}
                                >
                                    {signingOut ? <CircularProgress size={20} sx={{ color: '#111827' }} /> : tx('login.role_required.retry', 'Try a Different Account')}
                                </Button>
                                <CeoContactButtons />
                            </Stack>
                        </CardContent>
                    </Card>
                </Container>
            </Box>
        );
    }

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: palette.canvas,
            color: palette.ink,
            display: 'flex',
            flexDirection: 'column',
            p: { xs: 2, md: 3 },
            direction: isRTL ? 'rtl' : 'ltr',
            backgroundImage: 'radial-gradient(circle at 18% 10%, rgba(201,166,70,0.08), transparent 30%), radial-gradient(circle at 82% 90%, rgba(229,228,226,0.55), transparent 34%)',
        }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: { xs: 2, md: 3 }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Button
                    startIcon={!isRTL ? renderSafeIcon(ArrowLeft, { size: 17 }) : undefined}
                    endIcon={isRTL ? renderSafeIcon(ArrowLeft, { size: 17, style: { transform: 'rotate(180deg)' } }) : undefined}
                    onClick={() => navigate('/gateway')}
                    sx={{
                        color: palette.ink,
                        border: `1px solid ${alpha(palette.gold, 0.36)}`,
                        bgcolor: '#FFFFFF',
                        borderRadius: 2,
                        px: 2,
                        fontWeight: 950,
                        boxShadow: '0 8px 22px rgba(17,24,39,0.06)',
                    }}
                >
                    {t('login.change_role')}
                </Button>
                <Button
                    onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                    sx={{ color: palette.ink, fontWeight: 950, bgcolor: 'rgba(255,255,255,0.8)', px: 2, borderRadius: 2, border: `1px solid ${alpha(palette.gold, 0.36)}` }}
                >
                    {isRTL ? 'EN' : 'AR'}
                </Button>
            </Box>

            <Container maxWidth="sm" sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: { xs: 1, md: 4 } }}>
                <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 4 } }}>
                    <Typography variant="h3" fontWeight="950" sx={{ color: palette.gold, letterSpacing: -1.5, mb: 1 }}>
                        BIN GROUP
                    </Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: palette.ink, mb: 1, textTransform: 'uppercase' }}>
                        {getRoleTitle()}
                    </Typography>
                    <Typography variant="body1" sx={{ color: palette.muted, fontWeight: 700 }}>
                        {t('login.authorized_only')}
                    </Typography>
                </Box>

                <Card sx={{
                    bgcolor: palette.card,
                    border: `1px solid ${palette.border}`,
                    borderTop: `3px solid ${palette.gold}`,
                    borderRadius: 3,
                    boxShadow: '0 22px 60px rgba(17,24,39,0.12)',
                    overflow: 'hidden',
                }}>
                    <CardContent sx={{ p: { xs: 2.5, sm: 4, md: 5 } }}>
                        {notice && <Alert severity={notice.type} sx={{ mb: 3 }}>{notice.text}</Alert>}
                        <form onSubmit={handleLogin}>
                            <Stack spacing={2.5}>
                                <TextField
                                    fullWidth
                                    label={t('login.email')}
                                    variant="outlined"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                    type="email"
                                    name="email"
                                    inputProps={{ 'data-testid': 'login-email' }}
                                    InputProps={{ startAdornment: <InputAdornment position="start"><SafeIcon icon={Mail} size={20} color={palette.gold} /></InputAdornment> }}
                                    sx={{
                                        '& .MuiInputBase-root': { bgcolor: '#FFFFFF', minHeight: 58, borderRadius: 2 },
                                        '& .MuiInputBase-input': { color: palette.ink, fontWeight: 800 },
                                        '& .MuiInputLabel-root': { color: palette.muted, fontWeight: 800 },
                                        '& .MuiOutlinedInput-root fieldset': { borderColor: alpha(palette.gold, 0.38) },
                                        '& .MuiOutlinedInput-root:hover fieldset, & .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: palette.gold },
                                    }}
                                />
                                <TextField
                                    fullWidth
                                    label={t('login.password')}
                                    type={showPassword ? 'text' : 'password'}
                                    variant="outlined"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    inputProps={{ 'data-testid': 'login-password' }}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><SafeIcon icon={Key} size={20} color={palette.gold} /></InputAdornment>,
                                        endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: palette.ink }}><SafeIcon icon={showPassword ? EyeOff : Eye} size={20} /></IconButton></InputAdornment>,
                                    }}
                                    sx={{
                                        '& .MuiInputBase-root': { bgcolor: '#FFFFFF', minHeight: 58, borderRadius: 2 },
                                        '& .MuiInputBase-input': { color: palette.ink, fontWeight: 800 },
                                        '& .MuiInputLabel-root': { color: palette.muted, fontWeight: 800 },
                                        '& .MuiOutlinedInput-root fieldset': { borderColor: alpha(palette.gold, 0.38) },
                                        '& .MuiOutlinedInput-root:hover fieldset, & .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: palette.gold },
                                    }}
                                />
                                <Button type="button" fullWidth variant="text" onClick={handlePasswordReset} disabled={localLoading} sx={{ color: palette.gold, fontWeight: 950 }}>
                                    {tx('login.forgot_password', 'Forgot password?')}
                                </Button>
                                <Button type="submit" fullWidth variant="contained" disabled={localLoading} sx={{ py: 1.7, borderRadius: 2, fontWeight: 950, letterSpacing: 1.5, background: `linear-gradient(135deg, ${palette.gold}, #E6C77A)`, color: '#111827', boxShadow: `0 12px 26px ${alpha(palette.gold, 0.25)}` }}>
                                    {localLoading ? <CircularProgress size={24} color="inherit" /> : t('login.signin')}
                                </Button>
                                <Divider sx={{ my: 0.5 }}><Typography variant="caption" sx={{ color: palette.muted, px: 2, fontWeight: 900 }}>OR INSTITUTIONAL SSO</Typography></Divider>
                                <Button fullWidth variant="outlined" onClick={handleGoogleLogin} disabled={localLoading} startIcon={renderSafeIcon(UserCircle, { size: 20 })} sx={{ py: 1.4, borderRadius: 2, fontWeight: 950, borderColor: alpha(palette.gold, 0.45), color: palette.ink }}>
                                    {t('login.google')}
                                </Button>
                            </Stack>
                        </form>
                    </CardContent>
                </Card>

                <Grid container spacing={2.5} sx={{ mt: 4 }}>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><SafeIcon icon={Shield} size={22} color={palette.gold} style={{ marginBottom: 6 }} /><Typography variant="caption" display="block" color={palette.muted} fontWeight="900" letterSpacing={0.8}>ISO 27001</Typography></Box></Grid>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><SafeIcon icon={TrendingUp} size={22} color={palette.gold} style={{ marginBottom: 6 }} /><Typography variant="caption" display="block" color={palette.muted} fontWeight="900" letterSpacing={0.8}>INST-GRADE</Typography></Box></Grid>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><SafeIcon icon={Building} size={22} color={palette.gold} style={{ marginBottom: 6 }} /><Typography variant="caption" display="block" color={palette.muted} fontWeight="900" letterSpacing={0.8}>UAE-SOV</Typography></Box></Grid>
                </Grid>
                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 4, color: palette.muted, letterSpacing: 0.8, fontWeight: 700 }}>© 2026 BIN GROUP | ALL RIGHTS RESERVED</Typography>
            </Container>
        </Box>
    );
};

export default LoginPage;
