import React, { useState } from 'react';
import {
    Box, Button, Card, CardContent, Container,
    Divider, FormControl, Grid, IconButton, InputLabel,
    MenuItem, Select, TextField, Typography, InputAdornment,
    Alert, CircularProgress, Stack, Chip
} from '@mui/material';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useRole } from '../context/RoleContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { db, auth, doc, getDoc, setDoc, serverTimestamp } from '../lib/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signInWithPopup } from 'firebase/auth';
import { Mail, Lock, Eye, EyeOff, Shield, TrendingUp, Building, UserCircle } from 'lucide-react';

const LoginPage: React.FC = () => {
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redirectHandling, setRedirectHandling] = useState(false);

    React.useEffect(() => {
        const checkRedirect = async () => {
            try {
                const result = await getRedirectResult(auth);
                if (result) {
                    setRedirectHandling(true);
                    handleAuthResult(result);
                }
            } catch (err: any) {
                console.error("Redirect Auth Error:", err);
                setError("Institutional Redirect Failed: " + (err.message || "Credential rejection."));
            }
        };
        checkRedirect();
    }, []);

    const handleAuthResult = async (result: any) => {
        const uid = result.user.uid;
        const email = (result.user.email || '').toLowerCase();
        
        let snap = await getDoc(doc(db, "users", uid));
        
        // If profile doesn't exist (e.g. first-time non-admin user), create a default owner profile
        if (!snap.exists()) {
            console.log("[IAM] Creating default owner profile for:", email);
            const newProfile = {
                uid,
                email,
                displayName: result.user.displayName || "New User",
                role: 'owner',
                isAdmin: false,
                status: 'pending',
                createdAt: serverTimestamp()
            };
            await setDoc(doc(db, "users", uid), newProfile);
            // Refresh snap after creation
            snap = await getDoc(doc(db, "users", uid));
        }

        if (snap.exists()) {
            const data = snap.data();
            const role = (data.role || '').toLowerCase();
            
            if (role === 'admin') {
                navigate('/admin');
            } else if (data.isAdmin || data.role === 'ceo' || data.role === 'owner') {
                navigate('/dashboard');
            } else {
                navigate(role === 'tenant' ? '/tenant' : role === 'technician' ? '/tech' : '/');
            }
        } else {
            setError("Identity confirmed but profile synchronization failed. Please refresh.");
        }
    };

    const from = (location.state as any)?.from?.pathname || '/';

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            // Force Secure Flow (Authorization Code Flow) via Redirect
            await signInWithRedirect(auth, provider);
            // In case the browser does not navigate away, clear the spinner
            setLoading(false);
        } catch (err: any) {
            console.error("Google Login Error:", err);
            setError(err.message || "Failed to sign in with Google.");
            setLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password.trim();

        const timeout = setTimeout(() => setLoading(false), 8000);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            const uid = userCredential.user.uid;
            
            // Fetch role to redirect correctly
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) {
                const data = snap.data();
                const role = data.role;
                
                if (data.isAdmin || role === 'owner') {
                    navigate('/dashboard');
                } else {
                    switch(role) {
                        case 'tenant': navigate('/tenant'); break;
                        case 'technician': navigate('/tech'); break;
                        case 'broker': navigate('/broker'); break;
                        case 'admin': navigate('/admin'); break;
                        case 'auditor': navigate('/auditor'); break;
                        default: navigate(from);
                    }
                }
            } else {
                setError("User profile not found. Please contact support.");
            }
        } catch (err: any) {
            console.error("Login Error:", err);
            if (err.code === 'auth/invalid-email') {
                setError("Invalid email format. Please check for trailing spaces.");
            } else if (err.code === 'auth/user-not-found') {
                setError("No institutional account found with this email.");
            } else {
                setError(err.message || "Failed to sign in. Check your credentials.");
            }
        } finally {
            clearTimeout(timeout);
            setLoading(false);
        }
    };

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
                        <Box sx={{ 
                            p: 2, 
                            borderRadius: 4, 
                            bgcolor: 'rgba(198, 167, 94, 0.1)', 
                            border: `1px solid ${binThemeTokens.gold}22` 
                        }}>
                             <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -2 }}>
                                BIN
                                <Box component="span" sx={{ color: '#fff', ml: 1, letterSpacing: 4 }}>GROUP</Box>
                            </Typography>
                        </Box>
                    </Box>
                    <Typography variant="h4" fontWeight="900" sx={{ color: '#fff', mb: 1 }}>{t('login.portal')}</Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 1 }}>{t('login.auth_access')} <Chip label="v1.21-SOVEREIGN" size="small" sx={{ ml: 1, bgcolor: binThemeTokens.gold, color: '#000', height: 16, fontSize: '0.6rem', verticalAlign: 'middle' }} /></Typography>
                </Box>

                <Card sx={{ 
                    bgcolor: 'rgba(22, 22, 24, 0.8)', 
                    backdropFilter: 'blur(20px)',
                    border: `1px solid rgba(255,255,255,0.05)`,
                    borderRadius: 8,
                    boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
                    overflow: 'visible',
                    position: 'relative'
                }}>
                    <Box sx={{ 
                        position: 'absolute', 
                        top: -1, 
                        left: '10%', 
                        right: '10%', 
                        height: '2px', 
                        background: `linear-gradient(90deg, transparent, ${binThemeTokens.gold}, transparent)` 
                    }} />

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
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Mail size={20} color={binThemeTokens.gold} />
                                            </InputAdornment>
                                        ),
                                        sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }
                                    }}
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
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Lock size={20} color={binThemeTokens.gold} />
                                            </InputAdornment>
                                        ),
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: binThemeTokens.textSecondary }}>
                                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                        sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }
                                    }}
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
                                />

                                <Button
                                    type="submit"
                                    fullWidth
                                    variant="contained"
                                    disabled={loading}
                                    sx={{ 
                                        py: 2, 
                                        borderRadius: 4, 
                                        fontWeight: 900, 
                                        letterSpacing: 2,
                                        background: `linear-gradient(135deg, ${binThemeTokens.gold}, #E6C77A)`,
                                        boxShadow: `0 10px 20px ${binThemeTokens.gold}33`,
                                        '&:hover': {
                                            background: `linear-gradient(135deg, #E6C77A, ${binThemeTokens.gold})`,
                                            transform: 'translateY(-2px)'
                                        }
                                    }}
                                >
                                    {loading ? <CircularProgress size={24} color="inherit" /> : t('login.signin')}
                                </Button>

                                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, px: 2 }}>{t('login.or_sso')}</Typography>
                                </Divider>

                                <Button
                                    fullWidth
                                    variant="outlined"
                                    onClick={handleGoogleLogin}
                                    disabled={loading}
                                    startIcon={<UserCircle size={20} />}
                                    sx={{ 
                                        py: 1.5, 
                                        borderRadius: 4, 
                                        fontWeight: 800, 
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        color: '#FFF',
                                        '&:hover': {
                                            borderColor: binThemeTokens.gold,
                                            bgcolor: 'rgba(198,167,94,0.05)'
                                        }
                                    }}
                                >
                                    {t('login.google')}
                                </Button>

                            </Stack>
                        </form>
                    </CardContent>
                </Card>

                <Grid container spacing={2} sx={{ mt: 6 }}>
                    <Grid item xs={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Shield size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} />
                            <Typography variant="caption" display="block" color={binThemeTokens.textSecondary} fontWeight="700">{t('login.iso_secure')}</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <TrendingUp size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} />
                            <Typography variant="caption" display="block" color={binThemeTokens.textSecondary} fontWeight="700">{t('login.inst_grade')}</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Building size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} />
                            <Typography variant="caption" display="block" color={binThemeTokens.textSecondary} fontWeight="700">{t('login.uae_ops')}</Typography>
                        </Box>
                    </Grid>
                </Grid>

                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>
                    {t('login.footer')}
                </Typography>
            </Container>
        </Box>
    );
};

export default LoginPage;
