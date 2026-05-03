import React from 'react';
import { Box, Typography, Button, Container, Stack, Grid, alpha, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { ArrowRight, Shield, Globe, Building, TrendingUp, Crown, Mail, Phone, MapPin, Info, MessageSquare, Zap } from 'lucide-react';
import BinGroupHeader from '../components/SovereignHeader';
import CeoContactButtons from '../components/CeoContactButtons';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

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
                top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '800px', height: '800px',
                background: `radial-gradient(circle, ${binThemeTokens.gold}11 0%, transparent 70%)`,
                filter: 'blur(80px)',
                zIndex: 0
            }} />

            {/* HERO SECTION */}
            <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, pt: { xs: 10, md: 20 }, pb: 12 }}>
                <Stack spacing={4} alignItems="center" textAlign="center">
                    <Typography variant="h1" sx={{ 
                        fontSize: { xs: '3.5rem', md: '6rem' }, 
                        fontWeight: 900, 
                        color: 'text.primary', 
                        lineHeight: 1,
                        letterSpacing: -2,
                        background: (theme) => theme.palette.mode === 'dark' 
                            ? 'linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%)'
                            : 'linear-gradient(180deg, #0F172A 0%, #475569 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>
                        {t('landing.hero_title_line1')} <br />
                        <Box component="span" sx={{ color: binThemeTokens.gold, WebkitTextFillColor: binThemeTokens.gold }}>{t('landing.hero_title_line2')}</Box>
                    </Typography>

                    <Typography variant="h6" sx={{ color: 'text.secondary', maxWidth: 800, fontWeight: 500, lineHeight: 1.6, fontSize: '1.25rem' }}>
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
                                px: 6, py: 2.5, 
                                fontWeight: 900,
                                borderRadius: 100,
                                fontSize: '1.1rem',
                                boxShadow: `0 20px 40px ${alpha(binThemeTokens.gold, 0.3)}`
                            }}
                        >
                            Onboard Premium Asset
                        </Button>
                        <Button 
                            variant="outlined" 
                            size="large"
                            onClick={() => navigate('/gateway')}
                            sx={{ 
                                borderColor: (theme) => alpha(theme.palette.text.primary, 0.2), 
                                color: 'text.primary', 
                                px: 6, py: 2.5, 
                                fontWeight: 900,
                                borderRadius: 100,
                                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.05) }
                            }}
                        >
                            {t('landing.partner_login')}
                        </Button>
                    </Stack>

                    <Stack direction="row" spacing={4} sx={{ mt: 2 }} flexWrap="wrap" justifyContent="center">
                        <Button startIcon={<Building size={18} />} onClick={() => scrollToSection('services')} sx={{ color: 'text.secondary', fontWeight: 700 }}>{t('landing.what_we_do')}</Button>
                        <Button startIcon={<Info size={18} />} onClick={() => scrollToSection('about')} sx={{ color: 'text.secondary', fontWeight: 700 }}>{t('landing.who_we_are')}</Button>
                        <Button startIcon={<MessageSquare size={18} />} onClick={() => scrollToSection('contact')} sx={{ color: 'text.secondary', fontWeight: 700 }}>{t('landing.contact_us')}</Button>
                        <Button startIcon={<Shield size={18} />} onClick={() => navigate('/support')} sx={{ color: 'text.secondary', fontWeight: 700 }}>{t('landing.support')}</Button>
                    </Stack>
                </Stack>
            </Container>

            {/* SERVICES SECTION */}
            <Box id="services" sx={{ py: 15, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 1 }}>
                <Container maxWidth="lg">
                    <Typography variant="h3" fontWeight="900" sx={{ color: 'text.primary', mb: 8, textAlign: 'center', letterSpacing: -1 }}>
                        {t('landing.sectors_title')}
                    </Typography>
                    <Grid container spacing={4}>
                        {[
                            { title: t('landing.sector.govt_title'), desc: t('landing.sector.govt_desc'), icon: <Shield size={48} />, color: binThemeTokens.gold },
                            { title: t('landing.sector.luxury_title'), desc: t('landing.sector.luxury_desc'), icon: <Crown size={48} />, color: binThemeTokens.gold },
                            { title: t('landing.sector.infra_title'), desc: t('landing.sector.infra_desc'), icon: <TrendingUp size={48} />, color: binThemeTokens.gold }
                        ].map((sector, i) => (
                            <Grid item xs={12} md={4} key={i}>
                                <Box sx={{ 
                                    p: 6, borderRadius: 8, 
                                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(198,167,94,0.03)' : 'rgba(198,167,94,0.05)', 
                                    border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`, 
                                    textAlign: isRTL ? 'right' : 'left',
                                    height: '100%',
                                    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                    '&:hover': { 
                                        transform: 'translateY(-15px)', 
                                        borderColor: binThemeTokens.gold,
                                        boxShadow: `0 30px 60px ${alpha(binThemeTokens.gold, 0.1)}`
                                    }
                                }}>
                                    <Box sx={{ color: sector.color, mb: 4 }}>{sector.icon}</Box>
                                    <Typography variant="h5" fontWeight="900" sx={{ color: 'text.primary', mb: 2 }}>{sector.title}</Typography>
                                    <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.7, fontSize: '1.1rem' }}>{sector.desc}</Typography>
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* ABOUT & MISSION SECTION */}
            <Container id="about" maxWidth="lg" sx={{ py: 15, position: 'relative', zIndex: 1 }}>
                <Grid container spacing={12} alignItems="center">
                    <Grid item xs={12} md={6}>
                        <Box sx={{ position: 'relative' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4, mb: 2, display: 'block' }}>
                                {t('landing.mission_overline')}
                            </Typography>
                            <Typography variant="h2" fontWeight="900" sx={{ color: 'text.primary', mb: 4, letterSpacing: -1 }}>
                                {t('landing.mission_title')}
                            </Typography>
                            <Typography variant="h6" sx={{ color: 'text.secondary', lineHeight: 1.8, fontWeight: 500, mb: 6 }}>
                                {t('landing.mission_desc')}
                            </Typography>
                            
                            <Divider sx={{ mb: 6, borderColor: alpha(binThemeTokens.gold, 0.1) }} />
                            
                            <Typography variant="h4" fontWeight="900" sx={{ color: 'text.primary', mb: 3 }}>
                                {t('landing.why_choose_us')}
                            </Typography>
                            <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.8, fontSize: '1.1rem' }}>
                                {t('landing.why_choose_us_desc')}
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Box sx={{ 
                            p: 6, borderRadius: 10, 
                            background: `linear-gradient(135deg, ${alpha(binThemeTokens.gold, 0.05)}, transparent)`,
                            border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <Box sx={{ position: 'absolute', top: 0, right: 0, p: 4, color: binThemeTokens.gold, opacity: 0.1 }}>
                                <Globe size={200} />
                            </Box>
                            <Stack spacing={4}>
                                <Box>
                                    <Typography variant="h3" fontWeight="900" color={binThemeTokens.gold}>100%</Typography>
                                    <Typography variant="subtitle1" fontWeight="700">Data Sovereignty</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="h3" fontWeight="900" color={binThemeTokens.gold}>UAE</Typography>
                                    <Typography variant="subtitle1" fontWeight="700">Nationwide Operations</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="h3" fontWeight="900" color={binThemeTokens.gold}>ISO</Typography>
                                    <Typography variant="subtitle1" fontWeight="700">27001 Certified Security</Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </Grid>
                </Grid>
            </Container>

            {/* HOW IT WORKS SECTION */}
            <Box sx={{ py: 15, bgcolor: (theme) => alpha(binThemeTokens.gold, 0.02), position: 'relative', zIndex: 1 }}>
                <Container maxWidth="lg">
                    <Typography variant="h3" fontWeight="900" sx={{ color: 'text.primary', mb: 8, textAlign: 'center' }}>
                        {t('landing.how_it_works')}
                    </Typography>
                    <Grid container spacing={6}>
                        {[
                            { step: "01", title: "Institutional Onboarding", desc: t('landing.how_it_works_desc') },
                            { step: "02", title: "Technical Audit", desc: "Our specialists perform a baseline integrity audit of all MEP and structural nodes." },
                            { step: "03", title: "Mission Deployment", desc: "Deploy specialized technicians via the Sovereign Command terminal with 4-hour SLA guarantee." }
                        ].map((item, i) => (
                            <Grid item xs={12} md={4} key={i}>
                                <Stack spacing={2}>
                                    <Typography variant="h1" fontWeight="900" sx={{ color: alpha(binThemeTokens.gold, 0.2), lineHeight: 1 }}>{item.step}</Typography>
                                    <Typography variant="h5" fontWeight="900" sx={{ color: 'text.primary' }}>{item.title}</Typography>
                                    <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>{item.desc}</Typography>
                                </Stack>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* CONTACT SECTION */}
            <Box id="contact" sx={{ py: 20, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(198,167,94,0.02)' : 'rgba(198,167,94,0.04)', position: 'relative', zIndex: 1 }}>
                <Container maxWidth="lg">
                    <Grid container spacing={8} justifyContent="center" textAlign="center">
                        <Grid item xs={12} md={8}>
                            <Typography variant="h3" fontWeight="900" sx={{ color: 'text.primary', mb: 3 }}>
                                {t('landing.contact_title')}
                            </Typography>
                            <Typography variant="h6" sx={{ color: 'text.secondary', mb: 8 }}>
                                {t('support.subtitle')}
                            </Typography>
                            <Grid container spacing={4}>
                                <Grid item xs={12} md={4}>
                                    <Stack alignItems="center" spacing={2}>
                                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}><Mail /></Box>
                                        <Typography variant="body1" fontWeight="700">{t('landing.email')}</Typography>
                                    </Stack>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <Stack alignItems="center" spacing={2}>
                                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}><Phone /></Box>
                                        <Typography variant="body1" fontWeight="700">{t('landing.phone')}</Typography>
                                    </Stack>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <Stack alignItems="center" spacing={2}>
                                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}><MapPin /></Box>
                                        <Typography variant="body1" fontWeight="700">{t('landing.address')}</Typography>
                                    </Stack>
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* FOOTER */}
            <Box sx={{ py: 8, borderTop: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.05)}`, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <Container maxWidth="md">
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} justifyContent="center" alignItems="center" sx={{ mb: 4 }}>
                        {[
                            { label: t('footer.home'), href: '#' },
                            { label: t('footer.privacy'), href: '/privacy-policy' },
                            { label: t('footer.terms'), href: '/terms-of-service' },
                            { label: t('footer.support'), href: '/support' }
                        ].map((link) => (
                            <Typography 
                                key={link.href}
                                component="a" 
                                href={link.href}
                                onClick={(e) => { if(link.href === '#') { e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}); } }}
                                sx={{ 
                                    color: 'text.secondary', 
                                    textDecoration: 'none', 
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    '&:hover': { color: binThemeTokens.gold }
                                }}
                            >
                                {link.label}
                            </Typography>
                        ))}
                    </Stack>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                        <CeoContactButtons compact />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: 2, fontWeight: 900, display: 'block', mt: 1, opacity: 0.6 }}>
                        {t('footer.copyright')}
                    </Typography>
                </Container>
            </Box>
        </Box>
    );
};

export default LandingPage;
