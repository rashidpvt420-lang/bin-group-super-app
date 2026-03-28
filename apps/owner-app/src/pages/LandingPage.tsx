import React from 'react';
import { Box, Typography, Button, Container, Stack, Grid, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { ArrowRight, ShieldCheck, Globe, Building2, TrendingUp } from 'lucide-react';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: 'background.default', 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative'
        }}>
            {/* Hero Background Grid Effect */}
            <Box sx={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundImage: (theme) => theme.palette.mode === 'dark' 
                    ? `linear-gradient(${binThemeTokens.black} 0%, transparent 40%), linear-gradient(90deg, rgba(198,167,94,0.03) 1px, transparent 1px), linear-gradient(rgba(198,167,94,0.03) 1px, transparent 1px)`
                    : `linear-gradient(#F8FAFC 0%, transparent 40%), linear-gradient(90deg, rgba(198,167,94,0.05) 1px, transparent 1px), linear-gradient(rgba(198,167,94,0.05) 1px, transparent 1px)`,
                backgroundSize: '100% 100%, 60px 60px, 60px 60px',
                zIndex: 0
            }} />

            {/* Radiant Bloom */}
            <Box sx={{
                position: 'absolute',
                top: '20%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '600px', height: '600px',
                background: `radial-gradient(circle, ${binThemeTokens.gold}11 0%, transparent 70%)`,
                filter: 'blur(80px)',
                zIndex: 0
            }} />

            <Container maxWidth="lg" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1, pt: 12, pb: 8 }}>
                <Stack spacing={4} alignItems="center" textAlign="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Box sx={{ bgcolor: binThemeTokens.gold, px: 2, py: 1, borderRadius: 2, height: 48, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="h5" fontWeight="900" sx={{ color: '#000' }}>BIN</Typography>
                        </Box>
                        <Typography variant="h5" fontWeight="900" sx={{ color: 'text.primary', letterSpacing: 4 }}>GROUP</Typography>
                    </Box>

                    <Typography variant="h1" sx={{ 
                        fontSize: { xs: '3rem', md: '5rem' }, 
                        fontWeight: 900, 
                        color: 'text.primary', 
                        lineHeight: 1.1,
                        background: (theme) => theme.palette.mode === 'dark' 
                            ? 'linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%)'
                            : 'linear-gradient(180deg, #0F172A 0%, #475569 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>
                        {t('landing.hero_title_line1')} <br />
                        <Box component="span" sx={{ color: binThemeTokens.gold, WebkitTextFillColor: binThemeTokens.gold }}>{t('landing.hero_title_line2')}</Box>
                    </Typography>

                    <Typography variant="h6" sx={{ color: 'text.secondary', maxWidth: 800, fontWeight: 500, lineHeight: 1.6 }}>
                        {t('landing.subtitle')}
                    </Typography>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mt: 4 }}>
                        <Button 
                            variant="contained" 
                            size="large"
                            onClick={() => navigate('/onboarding')}
                            endIcon={<ArrowRight style={{ transform: isRTL ? 'scaleX(-1)' : 'none' }} />}
                            sx={{ 
                                background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                                color: '#000', 
                                px: 5, py: 2, 
                                fontWeight: 900,
                                borderRadius: 100,
                                fontSize: '1.1rem'
                            }}
                        >
                            {t('btn.quote')}
                        </Button>
                        <Button 
                            variant="outlined" 
                            size="large"
                            onClick={() => navigate('/login')}
                            sx={{ 
                                borderColor: (theme) => alpha(theme.palette.text.primary, 0.1), 
                                color: 'text.primary', 
                                px: 5, py: 2, 
                                fontWeight: 900,
                                borderRadius: 100,
                                '&:hover': { borderColor: binThemeTokens.gold }
                            }}
                        >
                            {t('landing.partner_login')}
                        </Button>
                    </Stack>

                    <Grid container spacing={4} sx={{ mt: 10, maxWidth: 1000 }}>
                        {[
                            { icon: <ShieldCheck size={28} />, title: t('landing.feature.risk_title'), desc: t('landing.feature.risk_desc') },
                            { icon: <Building2 size={28} />, title: t('landing.feature.maintenance_title'), desc: t('landing.feature.maintenance_desc') },
                            { icon: <TrendingUp size={28} />, title: t('landing.feature.yield_title'), desc: t('landing.feature.yield_desc') }
                        ].map((item, i) => (
                            <Grid item xs={12} md={4} key={i}>
                                <Box sx={{ 
                                    p: 4, borderRadius: 6, 
                                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)', 
                                    border: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.05)}`, 
                                    textAlign: isRTL ? 'right' : 'left', height: '100%' 
                                }}>
                                    <Box sx={{ color: binThemeTokens.gold, mb: 2 }}>{item.icon}</Box>
                                    <Typography variant="h6" fontWeight="900" sx={{ color: 'text.primary', mb: 1 }}>{item.title}</Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{item.desc}</Typography>
                                </Box>
                            </Grid>
                        ))}
                    </Grid>

                    {/* OAuth Compliance Section: Data Transparency */}
                    <Box sx={{ mt: 8, p: 4, bgcolor: 'rgba(198,167,94,0.03)', borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`, maxWidth: 800 }}>
                        <Typography variant="h6" color={binThemeTokens.gold} fontWeight="900" gutterBottom>
                            INSTITUTIONAL DATA TRANSPARENCY
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                            BIN-GROUP utilizes Google OAuth to authenticate authorized asset administrators. We request access to your identity profile solely to verify your institutional clearance within the BIN-GENESIS™ ecosystem. Your data is never shared with third parties and is used exclusively for secure session management and cross-portal authorization.
                        </Typography>
                    </Box>
                </Stack>
            </Container>

            {/* Compliance Footer */}
            <Box sx={{ p: 4, borderTop: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.05)}`, textAlign: 'center', bgcolor: 'rgba(0,0,0,0.02)' }}>
                <Container maxWidth="md">
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} justifyContent="center" alignItems="center" sx={{ mb: 2 }}>
                        {[
                            { label: 'Home', href: '/' },
                            { label: 'Privacy Policy', href: '/privacy-policy' },
                            { label: 'Terms of Service', href: '/terms-of-service' },
                            { label: 'Support', href: '/support' }
                        ].map((link) => (
                            <Typography 
                                key={link.label}
                                component="a" 
                                href={link.href}
                                sx={{ 
                                    color: binThemeTokens.textSecondary, 
                                    textDecoration: 'none', 
                                    fontWeight: 700,
                                    '&:hover': { color: binThemeTokens.gold }
                                }}
                            >
                                {link.label}
                            </Typography>
                        ))}
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: 2, fontWeight: 900, display: 'block', mt: 1 }}>
                        © 2026 BIN GROUP | ARCHITECTED FOR THE SEVEN EMIRATES | DUBAI, UAE
                    </Typography>
                </Container>
            </Box>
        </Box>
    );
};

export default LandingPage;
