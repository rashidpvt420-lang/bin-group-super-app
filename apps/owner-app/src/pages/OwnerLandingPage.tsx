import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Button,
    Container,
    Stack,
    Grid,
    alpha,
    Card,
    CardContent,
    Divider,
    Paper,
    AppBar,
    Toolbar,
    TextField,
    InputAdornment,
    IconButton,
    Alert,
    CircularProgress,
    Chip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import { auth, signInWithPopup } from '../lib/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider } from 'firebase/auth';
import {
    ArrowRight,
    ShieldCheck,
    Globe,
    Building2,
    Zap,
    Navigation,
    CheckCircle2,
    Briefcase,
    BadgeCheck,
    Mail,
    Lock,
    Eye,
    EyeOff,
    TrendingUp,
    UserCircle,
    Smartphone,
    Database,
    Droplets,
    Lightbulb,
    Home,
    AlertTriangle
} from 'lucide-react';

const OwnerLandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    const { role, isAdmin, loading: roleLoading } = useRole();
    const loginRef = useRef<HTMLDivElement>(null);

    // Login Form State (Preserving Logic)
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localLoading, setLocalLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!roleLoading && role) {
            const normalizedRole = role.toLowerCase();
            if (normalizedRole === 'tenant') navigate('/tenant');
            else if (normalizedRole === 'technician') navigate('/tech');
            else if (normalizedRole === 'admin' || isAdmin) window.location.href = '/admin';
            else navigate('/dashboard');
        }
    }, [role, isAdmin, roleLoading, navigate]);

    const scrollToLogin = () => {
        loginRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleGoogleLogin = async () => {
        setLocalLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            console.log("🔍 [DIAG] Starting signInWithPopup...");
            const result = await signInWithPopup(auth, provider);
            if (result.user) {
                console.log("🛡️ [AUTH] Popup login successful for:", result.user.email);
            }
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
        } catch (err: any) {
            console.error("Login Error:", err);
            setError(err.message || "Failed to sign in. Check your credentials.");
            setLocalLoading(false);
        }
    };

    if (roleLoading) {
        return (
            <Box sx={{ height: '100vh', bgcolor: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress color="inherit" sx={{ color: binThemeTokens.gold, mb: 4 }} size={60} />
                <Typography variant="h5" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                    AUTHENTICATING SECURE PROTOCOL...
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: '#000',
            direction: isRTL ? 'rtl' : 'ltr',
            position: 'relative',
            overflowX: 'hidden'
        }}>
            {/* 1. The Top Navigation Bar */}
            <AppBar position="sticky" sx={{ bgcolor: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(30px)', borderBottom: '1px solid rgba(255,255,255,0.05)', boxShadow: 'none', zIndex: 1200 }}>
                <Container maxWidth="xl">
                    <Toolbar sx={{ justifyContent: 'space-between', py: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ p: 0.8, borderRadius: 1.5, bgcolor: binThemeTokens.gold }}>
                                <ShieldCheck size={24} color="#000" />
                            </Box>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -1.5, display: 'flex', alignItems: 'center' }}>
                                BIN GROUP<Box component="span" sx={{ color: binThemeTokens.gold, ml: 0.5 }}>™</Box>
                            </Typography>
                        </Box>
                        <Button 
                            variant="contained" 
                            onClick={scrollToLogin}
                            sx={{ 
                                bgcolor: 'transparent', 
                                border: `1px solid ${binThemeTokens.gold}`,
                                color: binThemeTokens.gold, 
                                fontWeight: 950, 
                                px: 3, 
                                py: 1,
                                borderRadius: 100,
                                fontSize: '0.9rem',
                                '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1), borderColor: '#FFF', color: '#FFF' }
                            }}
                        >
                            Institutional Login
                        </Button>
                    </Toolbar>
                </Container>
            </AppBar>

            {/* 2. The Hero Section (First Impression) */}
            <Box sx={{ 
                pt: { xs: 15, md: 20 }, 
                pb: { xs: 10, md: 15 },
                position: 'relative',
                textAlign: 'center'
            }}>
                <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 8, mb: 3, display: 'block' }}>
                        THE NEW STANDARD of UAE REAL ESTATE
                    </Typography>
                    <Typography variant="h1" sx={{ 
                        fontSize: { xs: '3rem', md: '5.5rem' }, 
                        fontWeight: 950, 
                        lineHeight: 1,
                        letterSpacing: -4,
                        color: '#FFF',
                        mb: 4
                    }}>
                        Redefining Property Management <br />
                        <Box component="span" sx={{ color: binThemeTokens.gold }}>Across the UAE</Box>
                    </Typography>
                    <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 850, mx: 'auto', fontWeight: 400, lineHeight: 1.6, fontSize: { xs: '1.2rem', md: '1.6rem' }, mb: 8 }}>
                        Elite, end-to-end maintenance and asset stability for institutional property portfolios. Covering Dubai, Abu Dhabi, Al Ain, and the entire United Arab Emirates.
                    </Typography>
                    <Button 
                        variant="contained" 
                        size="large"
                        onClick={() => navigate('/onboarding')}
                        sx={{ 
                            background: `linear-gradient(135deg, ${binThemeTokens.gold}, #E6C77A)`, 
                            color: '#000', px: 8, py: 2.5, fontWeight: 950, borderRadius: 3, fontSize: '1.2rem',
                            boxShadow: `0 20px 40px ${alpha(binThemeTokens.gold, 0.3)}`,
                            '&:hover': { transform: 'translateY(-4px)' }
                        }}
                    >
                        Onboard Premium Asset
                    </Button>
                </Container>
            </Box>

            {/* 3. The 'Why BIN Group?' Section */}
            <Box sx={{ py: 20, bgcolor: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Container maxWidth="lg">
                    <Box sx={{ textAlign: 'center', mb: 12 }}>
                        <Typography variant="h2" fontWeight="950" sx={{ color: '#FFF', mb: 2, letterSpacing: -2 }}>The Headache Solved</Typography>
                        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 700, mx: 'auto' }}>We eliminate the friction of traditional maintenance, moving at the speed of your portfolio.</Typography>
                    </Box>

                    <Grid container spacing={4}>
                        {[
                            { title: 'Zero Friction', desc: 'No manual coordination. Everything from ticketing to invoicing is digitally handled within the Sovereign OS.', icon: <Zap /> },
                            { title: 'Real-Time GPS Dispatch', desc: 'Watch your service order fulfill in real-time. Our technicians are dispatched immediately via GPS routing.', icon: <Navigation /> },
                            { title: 'Automated Financials', desc: 'Rental yields and maintenance fees are routed through mathematically precise automated protocols.', icon: <Database /> },
                            { title: '100% Transparency', desc: 'Immutable portfolio tracking. No hidden costs. No administrative delays. Just absolute visibility.', icon: <TrendingUp /> }
                        ].map((point, i) => (
                            <Grid item xs={12} sm={6} md={3} key={i}>
                                <Box sx={{ p: 4, textAlign: 'center' }}>
                                    <Box sx={{ color: binThemeTokens.gold, mb: 3, display: 'flex', justifyContent: 'center', '& svg': { size: 48 } }}>{point.icon}</Box>
                                    <Typography variant="h5" fontWeight="950" color="#FFF" gutterBottom>{point.title}</Typography>
                                    <Typography variant="body2" color="rgba(255,255,255,0.5)" sx={{ lineHeight: 1.7 }}>{point.desc}</Typography>
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* 4. The Services Grid */}
            <Box sx={{ py: 20 }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4, mb: 2, display: 'block', textAlign: 'center' }}>
                        MISSION DEPLOYMENT CAPABILITIES
                    </Typography>
                    <Typography variant="h2" fontWeight="950" sx={{ color: '#FFF', textAlign: 'center', mb: 10, letterSpacing: -2 }}>Elite Infrastructure Maintenance</Typography>

                    <Grid container spacing={3}>
                        {[
                            { title: "Elite HVAC", desc: "Precision climate control maintenance for high-value properties.", icon: <Zap /> },
                            { title: "Plumbing", desc: "Institutional-grade hydraulic & water system integrity.", icon: <Droplets /> },
                            { title: "Electrical", desc: "Advanced power grid stability and preventative maintenance.", icon: <Lightbulb /> },
                            { title: "Smart Home IoT", desc: "Full automation stack integration and node monitoring.", icon: <Home /> },
                            { title: "24/7 Emergency SOS", desc: "Instant response for mission-critical infrastructure failure.", icon: <AlertTriangle /> }
                        ].map((service, i) => (
                            <Grid item xs={12} sm={6} md={4} key={i} lg={i === 4 ? 12 : 3}>
                                <Card sx={{ 
                                    height: '100%', bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', 
                                    borderRadius: 6, transition: '0.3s', '&:hover': { borderColor: binThemeTokens.gold, transform: 'translateY(-8px)' }
                                }}>
                                    <CardContent sx={{ p: 4, textAlign: 'center' }}>
                                        <Box sx={{ color: binThemeTokens.gold, mb: 3, display: 'flex', justifyContent: 'center' }}>{service.icon}</Box>
                                        <Typography variant="h5" fontWeight="900" color="#FFF" gutterBottom>{service.title}</Typography>
                                        <Typography variant="body2" color="rgba(255,255,255,0.5)">{service.desc}</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* 5. Executive Access & Footer */}
            <Box sx={{ py: 20, bgcolor: 'rgba(198, 167, 94, 0.03)', borderTop: '1px solid rgba(198, 167, 94, 0.1)' }}>
                <Container maxWidth="lg">
                    <Grid container spacing={10} alignItems="center">
                        <Grid item xs={12} md={7}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4, mb: 2, display: 'block' }}>
                                DIRECT PARTNERSHIP
                            </Typography>
                            <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mb: 3, letterSpacing: -1.5 }}>Direct Executive Access</Typography>
                            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400, mb: 6, lineHeight: 1.8 }}>
                                Institutional Partnerships require direct communication. For high-value asset onboarding or regional collaboration, connect directly with our leadership.
                            </Typography>
                            <Button 
                                variant="contained" 
                                size="large"
                                startIcon={<Smartphone size={24} />}
                                onClick={() => window.open('https://wa.me/971552423233', '_blank')}
                                sx={{ 
                                    bgcolor: '#25D366', 
                                    color: '#FFF', 
                                    fontWeight: 950, 
                                    px: 6, py: 2.5, 
                                    borderRadius: 4,
                                    fontSize: '1.2rem',
                                    '&:hover': { bgcolor: '#20BA5A', transform: 'scale(1.05)' }
                                }}
                            >
                                WhatsApp CEO (0552423233)
                            </Button>
                        </Grid>
                        <Grid item xs={12} md={5}>
                            <Paper sx={{ p: 5, borderRadius: 8, bgcolor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                                <BadgeCheck size={80} color={binThemeTokens.gold} style={{ marginBottom: 24, opacity: 0.8 }} />
                                <Typography variant="h5" fontWeight="950" color="#FFF" gutterBottom>BIN GROUP L.L.C</Typography>
                                <Typography variant="body2" color="rgba(255,255,255,0.4)">Registered Trademark • UAE Nationwide Operations</Typography>
                            </Paper>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Final Login Gate */}
            <Box ref={loginRef} sx={{ py: 20, bgcolor: '#000', textAlign: 'center', borderTop: '2px solid rgba(198, 167, 94, 0.3)' }}>
                <Container maxWidth="sm">
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 6, letterSpacing: -2 }}>Sign In to Dashboard</Typography>
                    <Card sx={{ 
                        bgcolor: 'rgba(22, 22, 24, 0.8)', 
                        backdropFilter: 'blur(30px)', 
                        border: '1px solid rgba(255,255,255,0.05)', 
                        borderRadius: 10, 
                        p: { xs: 4, md: 6 }
                    }}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 4, bgcolor: 'rgba(211, 47, 47, 0.1)', color: '#ffb74d', border: '1px solid rgba(211, 47, 47, 0.2)' }}>
                                {error}
                            </Alert>
                        )}
                        <form onSubmit={handleLogin}>
                            <Stack spacing={4}>
                                <TextField
                                    fullWidth
                                    label="Email Address"
                                    variant="outlined"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    InputProps={{
                                        sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, height: 65, fontSize: '1.1rem' }
                                    }}
                                    sx={{ '& .MuiInputBase-input': { color: '#FFFFFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' } }}
                                />
                                <TextField
                                    fullWidth
                                    label="Security Key"
                                    type={showPassword ? 'text' : 'password'}
                                    variant="outlined"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    InputProps={{
                                        endAdornment: (<InputAdornment position="end"><IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: 'rgba(255,255,255,0.3)' }}>{showPassword ? <EyeOff /> : <Eye />}</IconButton></InputAdornment>),
                                        sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, height: 65, fontSize: '1.1rem' }
                                    }}
                                    sx={{ '& .MuiInputBase-input': { color: '#FFFFFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' } }}
                                />
                                <Button
                                    type="submit"
                                    fullWidth
                                    variant="contained"
                                    disabled={localLoading}
                                    sx={{ py: 2.5, borderRadius: 4, fontWeight: 950, letterSpacing: 3, background: `linear-gradient(135deg, ${binThemeTokens.gold}, #E6C77A)`, color: '#000', fontSize: '1.1rem' }}
                                >
                                    {localLoading ? <CircularProgress size={24} color="inherit" /> : 'AUTHORIZE ACCESS'}
                                </Button>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)' }}>SECURE GLOBAL VERIFICATION</Typography>
                                </Divider>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    onClick={handleGoogleLogin}
                                    disabled={localLoading}
                                    startIcon={<UserCircle />}
                                    sx={{ py: 2, borderRadius: 4, fontWeight: 800, borderColor: 'rgba(255,255,255,0.1)', color: '#FFF' }}
                                >
                                    Verify Identity
                                </Button>
                            </Stack>
                        </form>
                    </Card>
                </Container>
            </Box>

            {/* Footer Institutional Footer */}
            <Box sx={{ py: 10, textAlign: 'center', opacity: 0.4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                 <Typography variant="caption" sx={{ letterSpacing: 4, fontWeight: 900, color: '#FFF' }}>
                    BIN GROUP SOVEREIGN OS © 2026 | INSTITUTIONAL PORTFOLIO MANAGEMENT | UAE NATIONWIDE
                 </Typography>
            </Box>
        </Box>
    );
};

export default OwnerLandingPage;
