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
import { db, auth, doc, getDoc, setDoc } from '../lib/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, TrendingUp, Building2, UserCircle } from 'lucide-react';

const LoginPage: React.FC = () => {
    const { lang } = useLanguage();
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
        
        const googleAdmin = 'rashidpvt420@gmail.com';
        const goldList = [googleAdmin, 'rashid.pvt420@gmail.com', 'rashidbinabdulghani@gmail.com'];

        if (email && goldList.includes(email)) {
             const isCEO = email.includes('rashidpvt') || email.includes('rashid.pvt');
             const profileData = {
                email,
                uid,
                displayName: isCEO ? "BIN-GROUP CEO (ADMIN)" : "BIN-GROUP TECHNICAL",
                role: isCEO ? 'ceo' : 'technical',
                isAdmin: true,
                godMode: true,
                status: 'active',
                updatedAt: new Date().toISOString()
            };
            await setDoc(doc(db, "users", uid), profileData, { merge: true });
            navigate('/dashboard');
            return;
        }

        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const data = snap.data();
            if (data.isAdmin || data.role === 'ceo' || data.role === 'owner') {
                navigate('/dashboard');
            } else {
                navigate(data.role === 'tenant' ? '/tenant' : data.role === 'technician' ? '/tech' : '/');
            }
        } else {
            setError("Identity confirmed but no Bin-Group profile found. Please contact HQ.");
        }
    };

    const from = (location.state as any)?.from?.pathname || '/';

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            let result;
            
            try {
                result = await signInWithPopup(auth, provider);
                handleAuthResult(result);
            } catch (popupError: any) {
                if (popupError.code === 'auth/popup-blocked' || popupError.code === 'auth/popup-closed-by-user') {
                    console.log("🔒 [SOVEREIGN-FALLBACK] Popup blocked. Executing redirect-handshake...");
                    await signInWithRedirect(auth, provider);
                    return;
                }
                throw popupError;
            }
        } catch (err: any) {
            console.error("Google Login Error:", err);
            setError(err.message || "Failed to sign in with Google.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password.trim();

        try {
            const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            const uid = userCredential.user.uid;
            
            // Fetch role to redirect correctly
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) {
                const data = snap.data();
                const role = data.role;
                
                if (data.isAdmin || data.godMode || role === 'ceo' || role === 'owner') {
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
                    <Typography variant="h4" fontWeight="900" sx={{ color: '#fff', mb: 1 }}>PARTNER PORTAL</Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 1 }}>AUTHENTICATED INSTITUTIONAL ACCESS <Chip label="v1.4-FIX" size="small" sx={{ ml: 1, bgcolor: binThemeTokens.gold, color: '#000', height: 16, fontSize: '0.6rem', verticalAlign: 'middle' }} /></Typography>
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
                                    label="Access Email"
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
                                    label="Secure Key (Password)"
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
                                    {loading ? <CircularProgress size={24} color="inherit" /> : 'SECURE SIGN IN'}
                                </Button>

                                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, px: 2 }}>OR INSTITUTIONAL SSO</Typography>
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
                                    SIGN IN WITH GOOGLE
                                </Button>

                                <Box sx={{ textAlign: 'center' }}>
                                    <Typography 
                                        variant="caption" 
                                        sx={{ 
                                            color: 'rgba(255,255,255,0.3)', 
                                            cursor: 'pointer',
                                            textDecoration: 'underline',
                                            '&:hover': { color: binThemeTokens.gold }
                                        }}
                                        onClick={async () => {
                                            const provider = new GoogleAuthProvider();
                                            const { signInWithRedirect } = await import('firebase/auth');
                                            await signInWithRedirect(auth, provider);
                                        }}
                                    >
                                        [SOVEREIGN-REDIRECT] Troubleshoot Popup? Click here.
                                    </Typography>
                                </Box>
                            </Stack>
                        </form>
                    </CardContent>
                </Card>

                <Grid container spacing={2} sx={{ mt: 6 }}>
                    <Grid item xs={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <ShieldCheck size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} />
                            <Typography variant="caption" display="block" color={binThemeTokens.textSecondary} fontWeight="700">ISO 27001 SECURE</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <TrendingUp size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} />
                            <Typography variant="caption" display="block" color={binThemeTokens.textSecondary} fontWeight="700">INSTITUTIONAL GRADE</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Building2 size={24} color={binThemeTokens.gold} style={{ marginBottom: 8 }} />
                            <Typography variant="caption" display="block" color={binThemeTokens.textSecondary} fontWeight="700">UAE PORTFOLIO OPS</Typography>
                        </Box>
                    </Grid>
                </Grid>

                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>
                    &copy; 2026 BIN-GROUP UAE. UNAUTHORIZED ACCESS IS MONITORED.
                </Typography>
            </Container>
        </Box>
    );
};

export default LoginPage;
