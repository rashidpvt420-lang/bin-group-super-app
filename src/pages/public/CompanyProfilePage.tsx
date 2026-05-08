import React, { useState, useEffect } from 'react';
import { 
    Box, Container, Typography, Grid, Paper, Stack, 
    Button, IconButton, Divider, alpha, Chip, Avatar,
    Link as MuiLink, CircularProgress
} from '@mui/material';
import { 
    Building2, ShieldCheck, MapPin, Phone, Mail, 
    Globe, MessageSquare, Award, Zap, Briefcase,
    CheckCircle2, ArrowRight, ExternalLink, Scale,
    FileText, HelpCircle, Instagram, Linkedin, Twitter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, doc, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

export default function CompanyProfilePage() {
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'settings', 'companyProfile'), (snap) => {
            if (snap.exists()) {
                setProfile(snap.data());
            } else {
                // Default fallback data if document doesn't exist yet
                setProfile({
                    companyName: 'BIN GROUP INSTITUTIONAL',
                    licenseInfo: 'License #998273 - Dubai Economy',
                    services: [
                        { id: 1, title: 'Property Management', desc: 'End-to-end asset optimization and tenant lifecycle management.', icon: 'building' },
                        { id: 2, title: 'Facility Maintenance', desc: 'Institutional-grade technical maintenance and emergency response.', icon: 'zap' },
                        { id: 3, title: 'Construction & Fit-out', desc: 'Premium architectural design and structural execution.', icon: 'briefcase' }
                    ],
                    maintenanceContracts: 'Sovereign-level SLA coverage for high-value portfolios.',
                    capabilities: 'Advanced geolocated dispatch, AI-driven predictive maintenance, and real-time financial reporting.',
                    contact: {
                        whatsapp: '+971 50 000 0000',
                        email: 'support@bingroup.ae',
                        phone: '+971 4 000 0000'
                    },
                    serviceAreas: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Institutional Zones'],
                    termsUrl: '#',
                    privacyUrl: '#'
                });
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    if (loading) return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
        </Box>
    );

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr', overflow: 'hidden' }}>
            {/* ─── HERO SECTION ──────────────────────────────────────────────── */}
            <Box sx={{ 
                height: '60vh', 
                position: 'relative', 
                display: 'flex', 
                alignItems: 'center',
                background: 'linear-gradient(rgba(2, 6, 23, 0.8), rgba(2, 6, 23, 0.9)), url("https://images.unsplash.com/photo-1582407947304-fd86f028f716?q=80&w=2000&auto=format&fit=crop") center/cover no-repeat'
            }}>
                <Container maxWidth="lg">
                    <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'} sx={{ animation: 'fadeInUp 1s ease-out' }}>
                        <Box sx={{ p: 2, bgcolor: binThemeTokens.gold, borderRadius: 4, width: 'fit-content' }}>
                            <Building2 size={48} color="#000" />
                        </Box>
                        <Typography variant="h1" fontWeight="950" sx={{ letterSpacing: -2, fontSize: { xs: '3rem', md: '5rem' } }}>
                            {profile.companyName}
                        </Typography>
                        <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800, maxWidth: 600 }}>
                            Setting the Sovereign standard in institutional property management and facility operations.
                        </Typography>
                        <Stack direction="row" spacing={2}>
                            <Button 
                                variant="contained" 
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 6, py: 2, borderRadius: 3 }}
                                startIcon={<MessageSquare size={20} />}
                                onClick={() => window.open(`https://wa.me/${profile.contact?.whatsapp?.replace(/\s+/g, '')}`, '_blank')}
                            >
                                CONTACT SUPPORT
                            </Button>
                            <Button 
                                variant="outlined" 
                                sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#FFF', fontWeight: 950, px: 6, py: 2, borderRadius: 3 }}
                                onClick={() => navigate('/services')}
                            >
                                LEARN MORE
                            </Button>
                        </Stack>
                    </Stack>
                </Container>
            </Box>

            {/* ─── INFO BAR ─────────────────────────────────────────────────── */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)', py: 3 }}>
                <Container maxWidth="lg">
                    <Grid container spacing={4} justifyContent="center">
                        {[
                            { icon: <ShieldCheck color={binThemeTokens.gold} />, label: 'VERIFIED LICENSE', value: profile.licenseInfo },
                            { icon: <MapPin color={binThemeTokens.gold} />, label: 'COVERAGE', value: 'FULL UAE COVERAGE' },
                            { icon: <Award color={binThemeTokens.gold} />, label: 'RATING', value: 'INSTITUTIONAL GRADE' },
                        ].map((item, idx) => (
                            <Grid item xs={12} md={4} key={idx}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    {item.icon}
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, letterSpacing: 1 }}>{item.label}</Typography>
                                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{item.value}</Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* ─── SERVICES SECTION ─────────────────────────────────────────── */}
            <Container maxWidth="lg" sx={{ py: 15 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4, mb: 2, display: 'block' }}>
                    OUR CAPABILITIES
                </Typography>
                <Typography variant="h3" fontWeight="950" sx={{ mb: 8, letterSpacing: -1 }}>
                    End-to-End Asset <br /> Ecosystem Management
                </Typography>

                <Grid container spacing={4}>
                    {profile.services?.map((service: any) => (
                        <Grid item xs={12} md={4} key={service.id}>
                            <Paper sx={{ 
                                p: 5, 
                                bgcolor: 'rgba(255,255,255,0.02)', 
                                border: '1px solid rgba(255,255,255,0.05)', 
                                borderRadius: 8,
                                height: '100%',
                                transition: 'all 0.4s ease',
                                '&:hover': { transform: 'translateY(-10px)', borderColor: binThemeTokens.gold, bgcolor: 'rgba(255,255,255,0.04)' }
                            }}>
                                <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, width: 'fit-content', color: binThemeTokens.gold, mb: 4 }}>
                                    {service.icon === 'building' ? <Building2 size={32} /> : service.icon === 'zap' ? <Zap size={32} /> : <Briefcase size={32} />}
                                </Box>
                                <Typography variant="h5" fontWeight="950" color="#FFF" sx={{ mb: 2 }}>{service.title}</Typography>
                                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, lineHeight: 1.8 }}>{service.desc}</Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            </Container>

            {/* ─── CONTACT & SUPPORT ─────────────────────────────────────────── */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.01)', borderTop: '1px solid rgba(255,255,255,0.05)', py: 15 }}>
                <Container maxWidth="lg">
                    <Grid container spacing={10}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="h3" fontWeight="950" sx={{ mb: 4 }}>Connect with <br />BIN Control</Typography>
                            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.4)', mb: 6, fontWeight: 700, fontSize: '1.1rem' }}>
                                For institutional inquiries, high-value asset onboarding, or technical support escalations.
                            </Typography>

                            <Stack spacing={4}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Box sx={{ p: 2, bgcolor: alpha('#25D366', 0.1), borderRadius: 3, color: '#25D366' }}><MessageSquare /></Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 950 }}>WHATSAPP SUPPORT</Typography>
                                        <Typography variant="h6" fontWeight="900" color="#FFF">{profile.contact?.whatsapp}</Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}><Mail /></Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 950 }}>OFFICIAL EMAIL</Typography>
                                        <Typography variant="h6" fontWeight="900" color="#FFF">{profile.contact?.email}</Typography>
                                    </Box>
                                </Box>
                            </Stack>
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 6, borderRadius: 10, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="h5" fontWeight="950" sx={{ mb: 4 }}>UAE Service Coverage</Typography>
                                <Grid container spacing={2}>
                                    {profile.serviceAreas?.map((area: string) => (
                                        <Grid item xs={6} key={area}>
                                            <Stack direction="row" spacing={1.5} alignItems="center">
                                                <CheckCircle2 size={18} color={binThemeTokens.gold} />
                                                <Typography variant="body1" fontWeight="800" color="#FFF">{area}</Typography>
                                            </Stack>
                                        </Grid>
                                    ))}
                                </Grid>
                                <Divider sx={{ my: 6, borderColor: 'rgba(255,255,255,0.05)' }} />
                                <Typography variant="h6" fontWeight="950" sx={{ mb: 2 }}>Compliance & Legal</Typography>
                                <Stack direction="row" spacing={3}>
                                    <MuiLink href={profile.termsUrl} sx={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800, '&:hover': { color: binThemeTokens.gold } }}>
                                        <Scale size={16} /> Terms of Service
                                    </MuiLink>
                                    <MuiLink href={profile.privacyUrl} sx={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800, '&:hover': { color: binThemeTokens.gold } }}>
                                        <FileText size={16} /> Privacy Policy
                                    </MuiLink>
                                </Stack>
                            </Paper>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* ─── FOOTER ──────────────────────────────────────────────────── */}
            <Box sx={{ py: 10, borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: 4, mb: 4 }}>BIN GROUP</Typography>
                <Stack direction="row" spacing={3} justifyContent="center" sx={{ mb: 6 }}>
                    <IconButton sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#FFF' } }}><Instagram /></IconButton>
                    <IconButton sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#FFF' } }}><Linkedin /></IconButton>
                    <IconButton sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#FFF' } }}><Twitter /></IconButton>
                </Stack>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                    © 2024 BIN GROUP INSTITUTIONAL. ALL SOVEREIGN RIGHTS RESERVED.
                </Typography>
            </Box>
        </Box>
    );
}
