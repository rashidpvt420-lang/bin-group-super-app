import React from 'react';
import { Box, Button, Chip, Container, Divider, Grid, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { ArrowRight, Building2, CheckCircle2, FileText, LockKeyhole, Mail, MapPin, Phone, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { CeoContactButtons } from '../../components/CeoContactButtons';
import { useLanguage } from '../../context/LanguageContext';
import { Languages } from 'lucide-react';
import IconButton from '@mui/material/IconButton';

interface PageContent {
    eyebrow: string;
    title: string;
    subtitle: string;
    bullets: string[];
}

export default function PublicMarketingPage({ page = 'home' }: { page?: string }) {
    const params = useParams();
    const { t, isRTL } = useLanguage();
    const key = page === 'dynamic' ? params.page || 'home' : page;

    const pageContent: Record<string, PageContent> = {
        owners: {
            eyebrow: t('sector.owners.eyebrow'),
            title: t('sector.owners.title'),
            subtitle: t('sector.owners.subtitle'),
            bullets: [t('sector.owners.b1'), t('sector.owners.b2'), t('sector.owners.b3'), t('sector.owners.b4')]
        },
        tenants: {
            eyebrow: t('sector.tenants.eyebrow'),
            title: t('sector.tenants.title'),
            subtitle: t('sector.tenants.subtitle'),
            bullets: [t('sector.tenants.b1'), t('sector.tenants.b2'), t('sector.tenants.b3'), t('sector.tenants.b4')]
        },
        technicians: {
            eyebrow: t('sector.tech.eyebrow'),
            title: t('sector.tech.title'),
            subtitle: t('sector.tech.subtitle'),
            bullets: [t('sector.tech.b1'), t('sector.tech.b2'), t('sector.tech.b3'), t('sector.tech.b4')]
        },
        brokers: {
            eyebrow: t('sector.brokers.eyebrow'),
            title: t('sector.brokers.title'),
            subtitle: t('sector.brokers.subtitle'),
            bullets: [t('sector.brokers.b1'), t('sector.brokers.b2'), t('sector.brokers.b3'), t('sector.brokers.b4')]
        },
        security: {
            eyebrow: t('sector.security.eyebrow'),
            title: t('sector.security.title'),
            subtitle: t('sector.security.subtitle'),
            bullets: [t('sector.security.b1'), t('sector.security.b2'), t('sector.security.b3'), t('sector.security.b4')]
        }
    };

    const content = key === 'home' ? null : pageContent[key || ''];

    if (key !== 'home' && !content) {
        return <PublicMarketingPage page="home" />;
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}>
            <MarketingNav />
            {key === 'home' ? <HomeHero /> : <SectorHero content={content!} />}

            <Container maxWidth="xl" sx={{ pb: 8 }}>
                <TrustBand />
                <VisualProof />
                <ServicePlans />
                <Coverage />
                <DemoForm />
                <Box sx={{ pt: 5, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5 }}>
                        {t('marketing.req_contract')}
                    </Button>
                    <Button component={Link} to="/login" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950, px: 4, py: 1.5 }}>
                        {t('marketing.inst_login')}
                    </Button>
                    <Button component={Link} to="/onboarding" variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.28)', fontWeight: 950, px: 4, py: 1.5 }}>
                        {t('marketing.onboard_property')}
                    </Button>
                </Box>
            </Container>
        </Box>
    );
}

function MarketingNav() {
    const { lang, setLang, isRTL, t } = useLanguage();
    
    return (
        <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(0,0,0,0.84)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(198,167,94,0.18)' }}>
            <Container maxWidth="xl" sx={{ py: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Stack component={Link} to="/" direction="row" alignItems="center" spacing={1.5} sx={{ cursor: 'pointer', color: '#FFF', textDecoration: 'none' }}>
                    <Box component="img" src="/logo.png" sx={{ width: 38, height: 38, borderRadius: 1 }} onError={(event: any) => { event.currentTarget.style.display = 'none'; }} />
                    <Typography variant="h6" fontWeight="950">BIN-<Box component="span" sx={{ color: binThemeTokens.gold }}>GROUPS</Box></Typography>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', md: 'flex' } }}>
                    {['owners', 'tenants', 'technicians', 'brokers', 'security'].map((item) => (
                        <Button key={item} component={Link} to={`/${item}`} sx={{ color: 'rgba(255,255,255,0.74)', fontWeight: 800, textTransform: 'capitalize' }}>
                            {t(`marketing.${item}`)}
                        </Button>
                    ))}
                    <Button component={Link} to="/login" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('nav.login')}</Button>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Button 
                        onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} 
                        startIcon={<Languages size={20} />}
                        sx={{ color: binThemeTokens.gold, fontWeight: 900 }}
                    >
                        {lang === 'en' ? 'العربية' : 'English'}
                    </Button>
                    <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                        {t('marketing.get_started')}
                    </Button>
                </Stack>
            </Container>
        </Box>
    );
}

function HomeHero() {
    const { t, isRTL } = useLanguage();
    return (
        <Box sx={{ minHeight: { xs: '78vh', md: '86vh' }, display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(198,167,94,0.16)' }}>
            <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(198,167,94,0.16), rgba(0,0,0,0.12) 38%, rgba(20,20,22,0.92))' }} />
            <Box sx={{ position: 'absolute', inset: 0, opacity: 0.28, backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '54px 54px' }} />
            <Container maxWidth="xl" sx={{ position: 'relative', py: 8 }}>
                <Grid container spacing={5} alignItems="center" direction={isRTL ? 'row-reverse' : 'row'}>
                    <Grid item xs={12} md={7} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Chip label={t('marketing.hero_chip')} sx={{ mb: 3, bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950 }} />
                        <Typography variant="h1" sx={{ fontSize: { xs: 42, md: 72 }, lineHeight: 0.98, fontWeight: 950, letterSpacing: 0, mb: 3 }}>
                            {t('marketing.hero_title')}
                        </Typography>
                        <Typography variant="h6" sx={{ maxWidth: 850, color: 'rgba(255,255,255,0.76)', lineHeight: 1.65, mb: 4 }}>
                            {t('marketing.hero_desc')}
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                            <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5 }}>
                                {t('marketing.req_contract')}
                            </Button>
                            <Button component={Link} to="/login" variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.28)', fontWeight: 950, px: 4, py: 1.5 }}>
                                {t('marketing.inst_login')}
                            </Button>
                            <Button component={Link} to="/onboarding" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950, px: 4, py: 1.5 }}>
                                {t('marketing.onboard_property')}
                            </Button>
                        </Stack>
                    </Grid>
                    <Grid item xs={12} md={5}>
                        <CommandMockup />
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
}

function SectorHero({ content }: { content: PageContent }) {
    const { isRTL } = useLanguage();
    return (
        <Container maxWidth="xl" sx={{ py: { xs: 7, md: 10 } }}>
            <Grid container spacing={5} alignItems="center" direction={isRTL ? 'row-reverse' : 'row'}>
                <Grid item xs={12} md={7} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{content.eyebrow}</Typography>
                    <Typography variant="h2" sx={{ fontSize: { xs: 36, md: 58 }, lineHeight: 1, fontWeight: 950, mt: 1, mb: 3 }}>{content.title}</Typography>
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.76)', lineHeight: 1.6, mb: 3 }}>{content.subtitle}</Typography>
                    <Stack spacing={1.2}>
                        {content.bullets.map((bullet) => (
                            <Stack key={bullet} direction="row" spacing={1.2} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <CheckCircle2 size={18} color={binThemeTokens.gold} />
                                <Typography sx={{ color: 'rgba(255,255,255,0.84)' }}>{bullet}</Typography>
                            </Stack>
                        ))}
                    </Stack>
                </Grid>
                <Grid item xs={12} md={5}>
                    <CommandMockup compact />
                </Grid>
            </Grid>
        </Container>
    );
}

function CommandMockup({ compact = false }: { compact?: boolean }) {
    const { t, isRTL } = useLanguage();
    return (
        <Paper sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(18,18,20,0.92)', border: '1px solid rgba(198,167,94,0.28)', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
            <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('marketing.live_command')}</Typography>
                    <Chip label={t('marketing.online')} size="small" sx={{ bgcolor: alpha('#10b981', 0.16), color: '#10b981', fontWeight: 900 }} />
                </Stack>
                {[
                    [t('marketing.owner_contract'), t('marketing.active_protocol'), 'AED 24,500'],
                    [t('marketing.tenant_sos'), t('marketing.tech_assigned'), t('marketing.eta')],
                    [t('marketing.move_out_audit'), t('marketing.evidence_captured'), t('marketing.verified')],
                    [t('marketing.broker_comm'), t('marketing.finance_approved'), 'AED 1,200']
                ].slice(0, compact ? 3 : 4).map(([a, b, c]) => (
                    <Box key={a} sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                <Typography fontWeight="900">{a}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.58)' }}>{b}</Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{c}</Typography>
                        </Stack>
                    </Box>
                ))}
            </Stack>
        </Paper>
    );
}

function TrustBand() {
    const { t } = useLanguage();
    return (
        <Grid container spacing={2} sx={{ mt: 5 }}>
            {[
                [t('landing.zero_friction'), <ShieldCheck size={24} />],
                [t('landing.auto_financials'), <FileText size={24} />],
                [t('landing.gps_dispatch'), <Wrench size={24} />],
                [t('landing.transparency'), <LockKeyhole size={24} />]
            ].map(([label, icon]) => (
                <Grid item xs={12} md={3} key={String(label)}>
                    <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2 }}>
                        <Box sx={{ color: binThemeTokens.gold, mb: 1 }}>{icon}</Box>
                        <Typography fontWeight="950">{label}</Typography>
                    </Paper>
                </Grid>
            ))}
        </Grid>
    );
}

function VisualProof() {
    const { t, isRTL } = useLanguage();
    const screenshots = [
        { title: t('proof.owner_onboarding'), body: t('proof.owner_onboarding_desc') },
        { title: t('proof.tenant_dispatch'), body: t('proof.tenant_dispatch_desc') },
        { title: t('proof.tech_jobs'), body: t('proof.tech_jobs_desc') },
        { title: t('proof.owner_command'), body: t('proof.owner_command_desc') },
        { title: t('proof.ai_studio'), body: t('proof.ai_studio_desc') },
        { title: t('proof.pdf_reports'), body: t('proof.pdf_reports_desc') }
    ];
    return (
        <Box sx={{ mt: 8, textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 1 }}>{t('marketing.built_for_ops')}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.66)', mb: 3 }}>{t('marketing.built_for_ops_desc')}</Typography>
            <Grid container spacing={2} direction={isRTL ? 'row-reverse' : 'row'}>
                {screenshots.map((shot) => (
                    <Grid item xs={12} sm={6} md={4} key={shot.title}>
                        <Paper sx={{ p: 2.5, minHeight: 170, borderRadius: 2, bgcolor: 'linear-gradient(135deg, rgba(198,167,94,0.12), rgba(255,255,255,0.03))', background: 'linear-gradient(135deg, rgba(198,167,94,0.12), rgba(255,255,255,0.03))', border: '1px solid rgba(198,167,94,0.18)' }}>
                            <Sparkles size={22} color={binThemeTokens.gold} />
                            <Typography variant="h6" fontWeight="950" sx={{ mt: 2 }}>{shot.title}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.66)' }}>{shot.body}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}

function ServicePlans() {
    const { t, isRTL } = useLanguage();
    return (
        <Box sx={{ mt: 8, textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 3 }}>{t('marketing.service_protocols')}</Typography>
            <Grid container spacing={2} direction={isRTL ? 'row-reverse' : 'row'}>
                {[
                    t('plan.maintenance'),
                    t('plan.management'),
                    t('plan.hybrid'),
                    t('plan.enterprise')
                ].map((plan) => (
                    <Grid item xs={12} md={3} key={plan}>
                        <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2 }}>
                            <Building2 size={24} color={binThemeTokens.gold} />
                            <Typography fontWeight="950" sx={{ mt: 1.5 }}>{plan}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 1 }}>{t('onboarding.payment.appreciation_desc')}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}

function Coverage() {
    const { t, isRTL } = useLanguage();
    const propertyTypesList = [
        t('prop.villas'), t('prop.apartments'), t('prop.res_buildings'), t('prop.com_buildings'), t('prop.offices'), t('prop.hotels'), t('prop.malls'), t('prop.hospitals'),
        t('prop.clinics'), t('prop.schools'), t('prop.warehouses'), t('prop.labour_camps'), t('prop.gov_properties'), t('prop.gov_majlis'), t('prop.pri_majlis'),
        t('prop.mixed_towers'), t('prop.skyscrapers'), t('prop.stadiums'), t('prop.sports_complex'), t('prop.event_venues'), t('prop.resorts'), t('prop.retail_centers'),
        t('prop.industrial'), t('prop.staff_acc'), t('prop.farms')
    ];
    return (
        <Box sx={{ mt: 8, textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 3 }}>{t('marketing.coverage_title')}</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                {propertyTypesList.map((type) => (
                    <Chip key={type} label={type} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: '#FFF', border: '1px solid rgba(198,167,94,0.22)', fontWeight: 800 }} />
                ))}
            </Stack>
        </Box>
    );
}

function DemoForm() {
    const { t, isRTL } = useLanguage();
    return (
        <Box sx={{ mt: 8, textAlign: isRTL ? 'right' : 'left' }}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, bgcolor: 'rgba(22,22,24,0.82)', border: '1px solid rgba(198,167,94,0.2)' }}>
                <Grid container spacing={3} direction={isRTL ? 'row-reverse' : 'row'}>
                    <Grid item xs={12} md={5}>
                        <Typography variant="h4" fontWeight="950">{t('marketing.inquiry_title')}</Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.66)', mt: 1 }}>{t('marketing.inquiry_desc')}</Typography>
                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />
                        <Stack spacing={1}>
                            <Stack direction="row" spacing={1} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}><Mail size={18} color={binThemeTokens.gold} /><Typography>Ceo@bin-groups.com</Typography></Stack>
                            <Stack direction="row" spacing={1} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}><Phone size={18} color={binThemeTokens.gold} /><Typography>+971 55 242 3233</Typography></Stack>
                            <Stack direction="row" spacing={1} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}><MapPin size={18} color={binThemeTokens.gold} /><Typography>{t('landing.address')}</Typography></Stack>
                        </Stack>
                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.56)', fontWeight: 800, display: 'block', mb: 1 }}>
                            {t('form.ceo_note')}
                        </Typography>
                        <CeoContactButtons />
                    </Grid>
                    <Grid item xs={12} md={7}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} md={6}><TextField fullWidth label={t('form.name')} /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label={t('form.contact')} /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label={t('form.prop_type')} /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label={t('form.emirate')} /></Grid>
                            <Grid item xs={12}><TextField fullWidth multiline minRows={4} label={t('form.details')} /></Grid>
                            <Grid item xs={12}><Button disabled fullWidth variant="contained" sx={{ py: 1.4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{t('marketing.submit_audit')}</Button></Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}

