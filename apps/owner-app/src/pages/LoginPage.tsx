import React, { useState, useEffect } from 'react';
import {
    Box, Button, Card, CardContent, Container,
    Divider, IconButton, TextField, Typography, InputAdornment,
    Alert, CircularProgress, Stack, Chip, Grid, alpha
} from '@mui/material';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useRole } from '../context/RoleContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, signInWithPopup } from '../lib/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider } from 'firebase/auth';
import { Mail, Lock, Eye, EyeOff, Shield, TrendingUp, Building, UserCircle, ArrowLeft, Key } from 'lucide-react';

const LoginPage: React.FC = () => {
    const { t, tx, isRTL } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const { role, isAdmin, loading: roleLoading } = useRole();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localLoading, setLocalLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Extract intendedRole from query params
    const queryParams = new URLSearchParams(location.search);
    const intendedRole = queryParams.get('intendedRole');

    useEffect(() => {
        if (!roleLoading && role) {
            console.log("🔍 [AUTH] Role Resolved:", role);
            if (role === 'tenant') navigate('/tenant');
            else if (role === 'technician') navigate('/tech');
            else if (role === 'admin' || isAdmin) window.location.href = '/admin';
            else navigate('/dashboard');
        }
    }, [role, isAdmin, roleLoading, navigate]);

    const handleGoogleLogin = async () => {
        setLocalLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            if (result.user) {
                console.log("🛡️ [AUTH] Google Auth Success:", result.user.email);
            }
        } catch (err: any) {
            console.error("❌ [AUTH] Google Error:", err);
            setError(`Identity verification failed: ${err.message || 'Unknown error'}`);
            setLocalLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalLoading(true);
        setError(null);

        try {
            await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password.trim());
            console.log("🔍 [AUTH] Email Login Success");
        } catch (err: any) {
            console.error("❌ [AUTH] Login Error:", err);
            setError(err.message || "Failed to sign in. Check your credentials.");
            setLocalLoading(false);
        }
    };

    if (roleLoading) {
        return (
            <Box sx={{ height: '100vh', bgcolor: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress color="inherit" sx={{ color: binThemeTokens.gold, mb: 4 }} />
                <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                    AUTHORIZING SECURE ACCESS...
                </Typography>
            </Box>
        );
    }

    const getRoleTitle = () => {
        if (!intendedRole) return tx('login.portal', 'PARTNER PORTAL');
        return tx(`gateway.role.${intendedRole}`, `Continue as ${intendedRole.charAt(0).toUpperCase() + intendedRole.slice(1)}`);
    };

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: '#000',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            p: 2,
            backgroundImage: 'radial-gradient(circle at 2% 2%, rgba(198, 167, 94, 0.05) 0%, transparent 40%), radial-gradient(circle at 98% 98%, rgba(198, 167, 94, 0.05) 0%, transparent 40%)',
            position: 'relative'
        }}>
            {/* Back to Gateway */}
            <Box sx={{ p: 4, position: 'absolute', top: 0, left: isRTL ? 'auto' : 0, right: isRTL ? 0 : 'auto', zIndex: 10 }}>
                <Button 
                    startIcon={<ArrowLeft size={16} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />} 
                    onClick={() => navigate('/gateway')}
                    sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, '&:hover': { color: binThemeTokens.gold } }}
                >
                    CHANGE ROLE
                </Button>
            </Box>

            <Container maxWidth="sm">
                <Box sx={{ textAlign: 'center', mb: 6 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                        <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(198, 167, 94, 0.1)', border: `1px solid ${binThemeTokens.gold}22` }}>
                             <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -2 }}>
                                 BIN GROUP
                            </Typography>
                        </Box>
                    </Box>
                    <Typography variant="h4" fontWeight="900" sx={{ color: '#fff', mb: 1, textTransform: 'uppercase' }}>
                        {getRoleTitle()}
                    </Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>
                        {tx('login.authorized_only', 'Authorized client and partner access only.')}
                    </Typography>
                </Box>

                <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.8)', backdropFilter: 'blur(30px)', border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 8, boxShadow: '0 40px 100px rgba(0,0,0,0.8)', overflow: 'visible', position: 'relative' }}>
                    <Box sx={{ position: 'absolute', top: -1, left: '10%', right: '10%', height: '2px', background: `linear-gradient(90deg, transparent, ${binThemeTokens.gold}, transparent)` }} />
                    <CardContent sx={{ p: { xs: 4, md: 6 } }}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 4, bgcolor: 'rgba(211, 47, 47, 0.1)', color: '#ffb74d', border: '1px solid rgba(211, 47, 47, 0.2)' }}>
                                {error}
                            </Alert>
                        )}
                        <form onSubmit={handleLogin}>
                            <Stack spacing={4}>
                                <TextField
                                    fullWidth
                                    label={tx('login.email', 'Email Address')}
                                    variant="outlined"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                    InputProps={{
                                        startAdornment: (<InputAdornment position="start"><Mail size={20} color={binThemeTokens.gold} /></InputAdornment>),
                                        sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }
                                    }}
                                    sx={{ '& .MuiInputBase-input': { color: '#FFFFFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { background: 'rgba(255,255,255,0.02)', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: binThemeTokens.gold }, '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold } } }}
                                />
                                <TextField
                                    fullWidth
                                    label={tx('login.password', 'Password')}
                                    type={showPassword ? 'text' : 'password'}
                                    variant="outlined"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    InputProps={{
                                        startAdornment: (<InputAdornment position="start"><Key size={20} color={binThemeTokens.gold} /></InputAdornment>),
                                        endAdornment: (<InputAdornment position="end"><IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: 'rgba(255,255,255,0.3)' }}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</IconButton></InputAdornment>),
                                        sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }
                                    }}
                                    sx={{ '& .MuiInputBase-input': { color: '#FFFFFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { background: 'rgba(255,255,255,0.02)', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: binThemeTokens.gold }, '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold } } }}
                                />
                                <Button
                                    type="submit"
                                    fullWidth
                                    variant="contained"
                                    disabled={localLoading}
                                    sx={{ py: 2.5, borderRadius: 4, fontWeight: 950, letterSpacing: 2, background: `linear-gradient(135deg, ${binThemeTokens.gold}, #E6C77A)`, color: '#000', fontSize: '1rem', boxShadow: `0 15px 30px ${alpha(binThemeTokens.gold, 0.3)}`, '&:hover': { background: `linear-gradient(135deg, #E6C77A, ${binThemeTokens.gold})`, transform: 'translateY(-2px)' } }}
                                >
                                    {localLoading ? <CircularProgress size={24} color="inherit" /> : tx('login.signin', 'SECURE SIGN IN')}
                                </Button>
                                <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', px: 2, fontWeight: 900 }}>OR INSTITUTIONAL SSO</Typography>
                                </Divider>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    onClick={handleGoogleLogin}
                                    disabled={localLoading}
                                    startIcon={<UserCircle size={20} />}
                                    sx={{ py: 1.5, borderRadius: 4, fontWeight: 900, borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' } }}
                                >
                                    {tx('login.google', 'SIGN IN WITH GOOGLE')}
                                </Button>
                            </Stack>
                        </form>
                    </CardContent>
                </Card>

                <Grid container spacing={3} sx={{ mt: 6 }}>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><Shield size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} /><Typography variant="caption" display="block" color="rgba(255,255,255,0.3)" fontWeight="900" letterSpacing={1}>ISO 27001</Typography></Box></Grid>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><TrendingUp size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} /><Typography variant="caption" display="block" color="rgba(255,255,255,0.3)" fontWeight="900" letterSpacing={1}>INST-GRADE</Typography></Box></Grid>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><Building size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} /><Typography variant="caption" display="block" color="rgba(255,255,255,0.3)" fontWeight="900" letterSpacing={1}>UAE OPS</Typography></Box></Grid>
                </Grid>
                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 8, color: 'rgba(255,255,255,0.15)', letterSpacing: 1, fontWeight: 700 }}>© 2026 BIN GROUP UAE. ALL RIGHTS RESERVED.</Typography>
            </Container>
        </Box>
    );
};

export default LoginPage;
