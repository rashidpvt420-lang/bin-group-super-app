import React, { useState, useEffect } from 'react';
import {
    Box, Button, Card, CardContent, Container,
    Divider, IconButton, TextField, Typography, InputAdornment,
    Alert, CircularProgress, Stack, Chip, Grid
} from '@mui/material';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useRole } from '../context/RoleContext';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithRedirect } from 'firebase/auth';
import { Mail, Lock, Eye, EyeOff, Shield, TrendingUp, Building, UserCircle } from 'lucide-react';

const LoginPage: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { role, isAdmin, loading: roleLoading } = useRole();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localLoading, setLocalLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!roleLoading && role) {
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
            // signInWithRedirect will reload the page on success, 
            // but we need to handle errors that happen before redirect.
            await signInWithRedirect(auth, provider);
        } catch (err: any) {
            console.error("Google Auth Error:", err);
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
            // Redirect will be handled by RoleContext/useEffect
        } catch (err: any) {
            console.error("Login Error:", err);
            setError(err.message || "Failed to sign in. Check your credentials.");
            setLocalLoading(false);
        }
        // No finally here because if successful, we want to stay in loading state 
        // until the app redirects. If it fails, we setLocalLoading(false) in catch.
    };

    if (roleLoading) {
        return (
            <Box sx={{ height: '100vh', bgcolor: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress color="inherit" sx={{ color: binThemeTokens.gold, mb: 4 }} />
                <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                    AUTHORIZING BIN-GROUPS ACCESS...
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: '#000', 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'center',
            p: 2,
            backgroundImage: 'radial-gradient(circle at 2% 2%, rgba(198, 167, 94, 0.05) 0%, transparent 40%), radial-gradient(circle at 98% 98%, rgba(198, 167, 94, 0.05) 0%, transparent 40%)'
        }}>
            <Container maxWidth="sm">
                <Box sx={{ textAlign: 'center', mb: 6 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                        <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(198, 167, 94, 0.1)', border: `1px solid ${binThemeTokens.gold}22` }}>
                             <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -2 }}>
                                 BIN-Groups
                            </Typography>
                        </Box>
                    </Box>
                    <Typography variant="h4" fontWeight="900" sx={{ color: '#fff', mb: 1 }}>{t('login.portal')}</Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 1 }}>{t('login.auth_access')} <Chip label="v1.23-STABLE" size="small" sx={{ ml: 1, bgcolor: binThemeTokens.gold, color: '#000', height: 16, fontSize: '0.6rem', verticalAlign: 'middle' }} /></Typography>
                </Box>

                <Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.8)', backdropFilter: 'blur(20px)', border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 8, boxShadow: '0 40px 100px rgba(0,0,0,0.6)', overflow: 'visible', position: 'relative' }}>
                    <Box sx={{ position: 'absolute', top: -1, left: '10%', right: '10%', height: '2px', background: `linear-gradient(90deg, transparent, ${binThemeTokens.gold}, transparent)` }} />
                    <CardContent sx={{ p: { xs: 4, md: 6 } }}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 4, bgcolor: 'rgba(211, 47, 47, 0.1)', color: '#ffb74d', border: '1px solid rgba(211, 47, 47, 0.2)' }}>
                                {error}
                            </Alert>
                        )}
                        <form onSubmit={handleLogin}>
                            <Stack spacing={3}>
                                <TextField
                                    fullWidth
                                    label={t('login.email')}
                                    variant="outlined"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    InputProps={{
                                        startAdornment: (<InputAdornment position="start"><Mail size={20} color={binThemeTokens.gold} /></InputAdornment>),
                                        sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }
                                    }}
                                    sx={{ '& .MuiInputBase-input': { color: '#FFFFFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)' }, '& .MuiOutlinedInput-root': { background: 'rgba(255,255,255,0.04)', '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' }, '&:hover fieldset': { borderColor: '#C6A75E' }, '&.Mui-focused fieldset': { borderColor: '#E6C77A' } } }}
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
                                        startAdornment: (<InputAdornment position="start"><Lock size={20} color={binThemeTokens.gold} /></InputAdornment>),
                                        endAdornment: (<InputAdornment position="end"><IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: binThemeTokens.textSecondary }}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</IconButton></InputAdornment>),
                                        sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }
                                    }}
                                    sx={{ '& .MuiInputBase-input': { color: '#FFFFFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.75)' }, '& .MuiOutlinedInput-root': { background: 'rgba(255,255,255,0.04)', '& fieldset': { borderColor: 'rgba(198,167,94,0.35)' }, '&:hover fieldset': { borderColor: '#C6A75E' }, '&.Mui-focused fieldset': { borderColor: '#E6C77A' } } }}
                                />
                                <Button
                                    type="submit"
                                    fullWidth
                                    variant="contained"
                                    disabled={localLoading}
                                    sx={{ py: 2, borderRadius: 4, fontWeight: 900, letterSpacing: 2, background: `linear-gradient(135deg, ${binThemeTokens.gold}, #E6C77A)`, boxShadow: `0 10px 20px ${binThemeTokens.gold}33`, '&:hover': { background: `linear-gradient(135deg, #E6C77A, ${binThemeTokens.gold})`, transform: 'translateY(-2px)' } }}
                                >
                                    {localLoading ? <CircularProgress size={24} color="inherit" /> : t('login.signin')}
                                </Button>
                                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, px: 2 }}>{t('login.or_sso')}</Typography>
                                </Divider>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    onClick={handleGoogleLogin}
                                    disabled={localLoading}
                                    startIcon={<UserCircle size={20} />}
                                    sx={{ py: 1.5, borderRadius: 4, fontWeight: 800, borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' } }}
                                >
                                    {t('login.google')}
                                </Button>
                            </Stack>
                        </form>
                    </CardContent>
                </Card>

                <Grid container spacing={2} sx={{ mt: 6 }}>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><Shield size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} /><Typography variant="caption" display="block" color={binThemeTokens.textSecondary} fontWeight="700">{t('login.iso_secure')}</Typography></Box></Grid>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><TrendingUp size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} /><Typography variant="caption" display="block" color={binThemeTokens.textSecondary} fontWeight="700">{t('login.inst_grade')}</Typography></Box></Grid>
                    <Grid item xs={4}><Box sx={{ textAlign: 'center' }}><Building size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} /><Typography variant="caption" display="block" color={binThemeTokens.textSecondary} fontWeight="700">{t('login.uae_ops')}</Typography></Box></Grid>
                </Grid>
                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>{t('login.footer')}</Typography>
            </Container>
        </Box>
    );
};

export default LoginPage;
