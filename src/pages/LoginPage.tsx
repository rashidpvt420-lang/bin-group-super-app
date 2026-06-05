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
import { auth, signInWithPopup } from '../lib/firebase';
import { GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { ArrowLeft, Building, Eye, EyeOff, Key, Mail, Shield, TrendingUp, UserCircle } from 'lucide-react';

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

const LoginPage: React.FC = () => {
    const { t, tx, isRTL } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const { role, isAdmin, loading: roleLoading, refreshRole } = useRole();
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
        return '/owner/dashboard';
    };

    useEffect(() => {
        if (!roleLoading && role) navigate(resolvePostLoginTarget(), { replace: Boolean(safeReturnTo) });
    }, [role, isAdmin, roleLoading, navigate, safeReturnTo, intendedRoleKey]);

    const getFriendlyAuthError = (err: any) => {
        const code = err?.code || '';
        const message = err?.message || '';
        console.error('[AUTH_DIAGNOSTIC]', {
            code,
            message,
            authDomain: auth.config?.authDomain,
            currentUrl: window.location.href,
            provider: code.includes('google') ? 'google.com' : 'password',
            env: import.meta.env.MODE,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            emailAttempted: email.replace(/(.{3}).*@/, '$1***@'),
        });
        if (code === 'auth/invalid-email') return tx('login.error.invalid_email', 'Please enter a valid email address.');
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return t('login.error.invalid');
        if (code === 'auth/too-many-requests') return t('login.error.too_many');
        if (code === 'auth/popup-closed-by-user') return t('login.error.popup_closed');
        if (code === 'auth/network-request-failed') return t('login.error.network');
        return tx('login.error.generic', 'Login could not be completed. Please contact BIN GROUP support.');
    };

    const handleGoogleLogin = async () => {
        setLocalLoading(true);
        setNotice(null);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            if (result.user) {
                await refreshRole();
                if (safeReturnTo && (!intendedRoleKey || intendedRoleKey === 'owner')) navigate(safeReturnTo, { replace: true });
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
            await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password.trim());
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
            <Box sx={{ display: 'flex', justifyContent: isRTL ? 'flex-end' : 'flex-start', mb: { xs: 2, md: 3 } }}>
                <Button
                    startIcon={!isRTL ? <ArrowLeft size={17} /> : undefined}
                    endIcon={isRTL ? <ArrowLeft size={17} style={{ transform: 'rotate(180deg)' }} /> : undefined}
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
                                    InputProps={{ startAdornment: <InputAdornment position="start"><Mail size={20} color={palette.gold} /></InputAdornment> }}
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
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Key size={20} color={palette.gold} /></InputAdornment>,
                                        endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: palette.ink }}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</IconButton></InputAdornment>,
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
                                <Button fullWidth variant="outlined" onClick={handleGoogleLogin} disabled={localLoading} startIcon={<UserCircle size={20} />} sx={{ py: 1.4, borderRadius: 2, fontWeight: 950, borderColor: alpha(palette.gold, 0.45), color: palette.ink }}>
                                    {t('login.google')}
                                </Button>
                            </Stack>
                        </form>
                    </CardContent>
                </Card>

                <Grid container spacing={2.5} sx={{ mt: 4 }}>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><Shield size={22} color={palette.gold} style={{ marginBottom: 6 }} /><Typography variant="caption" display="block" color={palette.muted} fontWeight="900" letterSpacing={0.8}>ISO 27001</Typography></Box></Grid>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><TrendingUp size={22} color={palette.gold} style={{ marginBottom: 6 }} /><Typography variant="caption" display="block" color={palette.muted} fontWeight="900" letterSpacing={0.8}>INST-GRADE</Typography></Box></Grid>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><Building size={22} color={palette.gold} style={{ marginBottom: 6 }} /><Typography variant="caption" display="block" color={palette.muted} fontWeight="900" letterSpacing={0.8}>UAE-SOV</Typography></Box></Grid>
                </Grid>
                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 4, color: palette.muted, letterSpacing: 0.8, fontWeight: 700 }}>© 2026 BIN GROUP | ALL RIGHTS RESERVED</Typography>
            </Container>
        </Box>
    );
};

export default LoginPage;
