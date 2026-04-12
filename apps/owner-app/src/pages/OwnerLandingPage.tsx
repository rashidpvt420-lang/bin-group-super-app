import React from 'react';
import { 
    Box, 
    Typography, 
    Button, 
    Container, 
    Stack, 
    Grid, 
    alpha, 
    Divider,
    Card,
    CardContent
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { 
    ArrowRight, 
    ShieldCheck, 
    Globe, 
    Building2, 
    Zap, 
    Navigation, 
    CheckCircle2,
    Users,
    Briefcase,
    BadgeCheck
} from 'lucide-react';
import BinGroupHeader from '../components/SovereignHeader';

const OwnerLandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: '#000', 
            direction: isRTL ? 'rtl' : 'ltr',
            position: 'relative',
            overflowX: 'hidden'
        }}>
            <BinGroupHeader />

            {/* Premium Hero Section */}
            <Box sx={{ 
                pt: { xs: 15, md: 25 }, 
                pb: 12, 
                position: 'relative',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: '-10%',
                    right: '-10%',
                    width: '600px',
                    height: '600px',
                    background: `radial-gradient(circle, ${binThemeTokens.gold}15 0%, transparent 70%)`,
                    filter: 'blur(100px)',
                    zIndex: 0
                }
            }}>
                <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
                    <Grid container spacing={8} alignItems="center">
                        <Grid item xs={12} md={7}>
                            <Stack spacing={4}>
                                <Box>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4, mb: 2, display: 'block' }}>
                                        VAE REGIONAL HEADQUARTERS
                                    </Typography>
                                    <Typography variant="h1" sx={{ 
                                        fontSize: { xs: '3.5rem', md: '5.5rem' }, 
                                        fontWeight: 950, 
                                        lineHeight: 0.9,
                                        letterSpacing: -3,
                                        color: '#FFF',
                                        mb: 3
                                    }}>
                                        BIN GROUP <br />
                                        <Box component="span" sx={{ color: binThemeTokens.gold }}>SOVEREIGN ASSET</Box>
                                    </Typography>
                                    <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 600, fontWeight: 400, lineHeight: 1.6 }}>
                                        High-frequency property management and institutional maintenance for UAE portfolio owners. From Abu Dhabi to Dubai and Al Ain, we define the standard of mission-critical asset stability.
                                    </Typography>
                                </Box>

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                                    <Button 
                                        variant="contained" 
                                        size="large"
                                        onClick={() => navigate('/onboarding')}
                                        endIcon={<Navigation size={20} />}
                                        sx={{ 
                                            background: `linear-gradient(135deg, ${binThemeTokens.gold}, #E6C77A)`, 
                                            color: '#000', px: 5, py: 2.5, fontWeight: 900, borderRadius: 100, fontSize: '1.2rem',
                                            boxShadow: `0 20px 40px ${alpha(binThemeTokens.gold, 0.4)}`,
                                            '&:hover': { transform: 'translateY(-4px)' }
                                        }}
                                    >
                                        Inbound Portal
                                    </Button>
                                    <Button 
                                        variant="outlined" 
                                        size="large"
                                        onClick={() => navigate('/login')}
                                        sx={{ 
                                            borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', px: 5, py: 2.5, fontWeight: 900, borderRadius: 100,
                                            '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' }
                                        }}
                                    >
                                        Institutional Sign In
                                    </Button>
                                </Stack>
                            </Stack>
                        </Grid>
                        <Grid item xs={12} md={5}>
                             <Box sx={{ 
                                p: 4, borderRadius: 10, bgcolor: 'rgba(22, 22, 24, 0.6)', 
                                border: '1px solid rgba(198, 167, 94, 0.2)', backdropFilter: 'blur(30px)',
                                position: 'relative'
                            }}>
                                <Typography variant="h6" fontWeight="950" sx={{ mb: 4, color: binThemeTokens.gold }}>NATIONWIDE PRESENCE</Typography>
                                <Stack spacing={3}>
                                    {['Dubai (HQ)', 'Abu Dhabi', 'Al Ain'].map((loc) => (
                                        <Box key={loc} sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(198,167,94,0.1)', color: binThemeTokens.gold }}><Globe size={24} /></Box>
                                            <Typography variant="h5" fontWeight="900" color="#FFF">{loc}</Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Core Capability Section */}
            <Box sx={{ py: 15, bgcolor: '#0B0B0C' }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4, mb: 2, display: 'block', textAlign: 'center' }}>
                        MISSION DEPLOYMENT
                    </Typography>
                    <Typography variant="h2" fontWeight="950" sx={{ color: '#FFF', mb: 8, textAlign: 'center', letterSpacing: -2 }}>The Sovereign <Box component="span" sx={{ color: binThemeTokens.gold }}>Standard</Box></Typography>

                    <Grid container spacing={4}>
                        {[
                            { title: "Proprietary MEP Nodes", desc: "Real-time health monitoring of all mechanical, electrical, and plumbing infrastructure across your assets.", icon: <Zap size={40} /> },
                            { title: "Institutional Maintenance", desc: "4-hour rapid response dispatch with 100% resolution guarantee on all mission-critical tickets.", icon: <Building2 size={40} /> },
                            { title: "Yield Direct-Reroute", desc: "Zero-Escrow Policy. All rental income and yields are routed directly to your verified UAE bank account.", icon: <Briefcase size={40} /> }
                        ].map((node, i) => (
                            <Grid item xs={12} md={4} key={i}>
                                <Card sx={{ 
                                    height: '100%', bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', 
                                    borderRadius: 8, transition: '0.3s', '&:hover': { transform: 'translateY(-10px)', borderColor: binThemeTokens.gold }
                                }}>
                                    <CardContent sx={{ p: 5 }}>
                                        <Box sx={{ color: binThemeTokens.gold, mb: 4 }}>{node.icon}</Box>
                                        <Typography variant="h4" fontWeight="900" sx={{ color: '#FFF', mb: 2 }}>{node.title}</Typography>
                                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.8 }}>{node.desc}</Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* Leadership & CEO Section */}
            <Box sx={{ py: 20, position: 'relative' }}>
                <Container maxWidth="lg">
                    <Grid container spacing={12} alignItems="center">
                        <Grid item xs={12} md={6}>
                            <Box sx={{ 
                                position: 'relative', 
                                '&::before': { content: '""', position: 'absolute', inset: -20, border: `2px solid ${binThemeTokens.gold}`, opacity: 0.1, borderRadius: 10 }
                            }}>
                                <Box sx={{ 
                                    aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', 
                                    background: `linear-gradient(45deg, #111, #222)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                   {/* CEO Placeholder Image - Would be real asset */}
                                   <Users size={120} color={binThemeTokens.gold} strokeWidth={1} />
                                </Box>
                                <Box sx={{ 
                                    position: 'absolute', bottom: -30, right: -30, p: 4, bgcolor: binThemeTokens.gold, 
                                    borderRadius: 6, boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                                }}>
                                    <BadgeCheck size={32} color="#000" />
                                </Box>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4, mb: 2, display: 'block' }}>
                                LEADERSHIP PROFILE
                            </Typography>
                            <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mb: 3 }}>Message from the Founder & CEO</Typography>
                            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.8)', fontStyle: 'italic', mb: 4, lineHeight: 1.8 }}>
                                "At BIN GROUP, we don't just manage buildings; we stabilize infrastructure. Our mission is to ensure that UAE property owners have unshakeable confidence in their portfolio's integrity and financial velocity. We prioritize data sovereignty and zero-hold capital flows above all else."
                            </Typography>
                            <Box>
                                <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.gold }}>Institutional Excellence</Typography>
                                <Typography variant="subtitle1" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>BIN GROUP L.L.C Registry</Typography>
                            </Box>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Zero-Escrow Fintech Banner */}
            <Box sx={{ 
                py: 6, bgcolor: alpha(binThemeTokens.gold, 0.1), borderTop: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`,
                borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`
            }}>
                <Container maxWidth="lg">
                    <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" spacing={4}>
                        <Stack direction="row" spacing={3} alignItems="center">
                            <ShieldCheck size={48} color={binThemeTokens.gold} />
                            <Box>
                                <Typography variant="h5" fontWeight="950" color="#FFF">Zero-Escrow Fintech Policy</Typography>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>BIN GROUP does not hold escrow. All property yields are routed directly to your bank account.</Typography>
                            </Box>
                        </Stack>
                        <Button 
                            variant="contained" 
                            onClick={() => navigate('/onboarding')}
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 6, py: 2, borderRadius: 100 }}
                        >
                            Open Account
                        </Button>
                    </Stack>
                </Container>
            </Box>

            {/* Footer */}
            <Box sx={{ py: 10, textAlign: 'center', opacity: 0.6 }}>
                 <Typography variant="caption" sx={{ letterSpacing: 5, fontWeight: 900, color: '#FFF' }}>
                    BIN GROUP SOVEREIGN OS © 2026 | INSTITUTIONAL PORTFOLIO MANAGEMENT
                 </Typography>
            </Box>
        </Box>
    );
};

export default OwnerLandingPage;
