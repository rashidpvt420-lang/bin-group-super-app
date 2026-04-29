import React from 'react';
import { Box, Button, Chip, Container, Divider, Grid, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { ArrowRight, Building2, CheckCircle2, FileText, LockKeyhole, Mail, MapPin, Phone, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import CeoContactButtons from '../../components/CeoContactButtons';
import { useLanguage } from '../../context/LanguageContext';
import { Languages } from 'lucide-react';
import IconButton from '@mui/material/IconButton';

type PageContent = {
    eyebrow: string;
    title: string;
    subtitle: string;
    bullets: string[];
};

const pageContent: Record<string, PageContent> = {
    owners: {
        eyebrow: 'Owner Command',
        title: 'Operate every property with verified contracts, documents, payments, and approvals.',
        subtitle: 'Owners get onboarding, service plans, add-ons, tenant requests, reports, AI Design Studio, property health, and rent ledger in one real-time system.',
        bullets: [
            'Institutional Dashboard with real-time portfolio analytics',
            'Title Deed OCR extraction and verification protocol',
            'Master Service Agreements and automated e-signatures',
            'Live rent ledger, move-in/out reports, and property health scores'
        ]
    },
    tenants: {
        eyebrow: 'Tenant Care',
        title: 'Fast maintenance requests, technician tracking, and clear move-in/move-out support.',
        subtitle: 'Tenants can submit emergencies, upload evidence, follow technician status, verify completion, and access unit documents.',
        bullets: [
            'Sovereign SOS: Instant emergency maintenance routing',
            'Real-time technician tracking and GPS-arrival alerts',
            'Digital move-in/out checklists and condition evidence',
            'Direct support chat and community announcements'
        ]
    },
    technicians: {
        eyebrow: 'Technician Corps',
        title: 'A field command center for jobs, routes, duty, overtime, and performance.',
        subtitle: 'Technicians see assigned jobs, mission pool, route hints, HR duty state, workload, notification link, and digital ID.',
        bullets: [
            'Area-based auto-assignment and smart route optimization',
            'Offline mode for consistent updates in data-dead zones',
            'Digital ID and certified credential management',
            'Live payroll tracking, overtime visibility, and digital payslips'
        ]
    },
    brokers: {
        eyebrow: 'Broker Network',
        title: 'Track leads, contract attribution, commission status, and payout readiness.',
        subtitle: 'Brokers can bring owners, properties, and tenants while finance/admin controls payment verification and payout approval.',
        bullets: [
            'Broker ID and automated lead attribution tracking',
            'Real-time commission pipeline and approval status',
            'Contract management and payout proof archive',
            'Direct communication line with Finance and Admin'
        ]
    },
    security: {
        eyebrow: 'Sovereign Security',
        title: 'Document protection, audit logs, role access, and evidence protocols.',
        subtitle: 'Sensitive documents, payments, contracts, and identity flows are protected by institutional-grade encryption and access controls.',
        bullets: [
            'Firebase App Check and device-integrity enforcement',
            'Immutable audit logs for every operational event',
            'Encrypted document vault and role-based data isolation',
            'Protocol-driven evidence capture for all field work'
        ]
    }
};

const propertyTypesList = [
    'Villas', 'Apartments', 'Residential buildings', 'Commercial buildings', 'Offices', 'Hotels', 'Malls', 'Hospitals',
    'Clinics', 'Schools', 'Warehouses', 'Labour camps', 'Government properties', 'Government Majlis', 'Private Majlis',
    'Mixed-use towers', 'Skyscrapers', 'Stadiums', 'Sports complexes', 'Event venues', 'Resorts', 'Retail centers',
    'Industrial properties', 'Staff accommodation', 'Farms / estates'
];

const screenshots = [
    { title: 'Owner onboarding', body: 'Documents, service plan, add-ons, payment, approval.' },
    { title: 'Tenant dispatch', body: 'Emergency request, technician status, completion proof.' },
    { title: 'Technician jobs', body: 'Mission cards, navigation, duty, workload.' },
    { title: 'Admin command', body: 'Revenue, loss, tickets, HR, documents, repairs.' },
    { title: 'AI Design Studio', body: 'Room concepts, scope, material and quote path.' },
    { title: 'PDF reports', body: 'Contracts, move-in/out, maintenance, owner reports.' }
];

export default function PublicMarketingPage({ page = 'home' }: { page?: string }) {
    const params = useParams();
    const key = page === 'dynamic' ? params.page || 'home' : page;
    const content = key === 'home' ? null : pageContent[key || ''];

    if (key !== 'home' && !content) {
        return <PublicMarketingPage page="home" />;
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', color: '#FFF' }}>
            <MarketingNav />
            {key === 'home' ? <HomeHero /> : <SectorHero content={content!} />}

            <Container maxWidth="xl" sx={{ pb: 8 }}>
                <TrustBand />
                <VisualProof />
                <ServicePlans />
                <Coverage />
                <DemoForm />
                <Box sx={{ pt: 5, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5 }}>
                        Request Contract
                    </Button>
                    <Button component={Link} to="/login" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950, px: 4, py: 1.5 }}>
                        Institutional Login
                    </Button>
                    <Button component={Link} to="/onboarding" variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.28)', fontWeight: 950, px: 4, py: 1.5 }}>
                        Onboard Your Property
                    </Button>
                </Box>
            </Container>
        </Box>
    );
}

function MarketingNav() {
    const { lang, setLang, isRTL } = useLanguage();
    
    return (
        <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(0,0,0,0.84)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(198,167,94,0.18)', direction: isRTL ? 'rtl' : 'ltr' }}>
            <Container maxWidth="xl" sx={{ py: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Stack component={Link} to="/" direction="row" alignItems="center" spacing={1.5} sx={{ cursor: 'pointer', color: '#FFF', textDecoration: 'none' }}>
                    <Box component="img" src="/logo.png" sx={{ width: 38, height: 38, borderRadius: 1 }} onError={(event: any) => { event.currentTarget.style.display = 'none'; }} />
                    <Typography variant="h6" fontWeight="950">BIN-<Box component="span" sx={{ color: binThemeTokens.gold }}>GROUPS</Box></Typography>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    {['owners', 'tenants', 'technicians', 'brokers', 'security'].map((item) => (
                        <Button key={item} component={Link} to={`/${item}`} sx={{ color: 'rgba(255,255,255,0.74)', fontWeight: 800, textTransform: 'capitalize' }}>{item.replace('-', ' ')}</Button>
                    ))}
                    <Button component={Link} to="/login" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>Login</Button>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <IconButton onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} sx={{ color: binThemeTokens.gold }}>
                        <Languages size={20} />
                    </IconButton>
                    <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                        Get Started
                    </Button>
                </Stack>
            </Container>
        </Box>
    );
}

function HomeHero() {
    return (
        <Box sx={{ minHeight: { xs: '78vh', md: '86vh' }, display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(198,167,94,0.16)' }}>
            <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(198,167,94,0.16), rgba(0,0,0,0.12) 38%, rgba(20,20,22,0.92))' }} />
            <Box sx={{ position: 'absolute', inset: 0, opacity: 0.28, backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '54px 54px' }} />
            <Container maxWidth="xl" sx={{ position: 'relative', py: 8 }}>
                <Grid container spacing={5} alignItems="center">
                    <Grid item xs={12} md={7}>
                        <Chip label="UAE REAL-TIME PROPERTY OPERATIONS" sx={{ mb: 3, bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950 }} />
                        <Typography variant="h1" sx={{ fontSize: { xs: 42, md: 72 }, lineHeight: 0.98, fontWeight: 950, letterSpacing: 0, mb: 3 }}>
                            BIN-GROUPS — The Real-Time Property Operations OS for the UAE
                        </Typography>
                        <Typography variant="h6" sx={{ maxWidth: 850, color: 'rgba(255,255,255,0.76)', lineHeight: 1.65, mb: 4 }}>
                            From villas to skyscrapers, malls, hospitals, stadiums, hotels, government properties, and Majlis operations — BIN-GROUPS connects owners, tenants, technicians, brokers, payments, documents, contracts, and AI design in one verified command system.
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5 }}>
                                Request Contract
                            </Button>
                            <Button component={Link} to="/login" variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.28)', fontWeight: 950, px: 4, py: 1.5 }}>
                                Institutional Login
                            </Button>
                            <Button component={Link} to="/onboarding" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950, px: 4, py: 1.5 }}>
                                Onboard Your Property
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
    return (
        <Container maxWidth="xl" sx={{ py: { xs: 7, md: 10 } }}>
            <Grid container spacing={5} alignItems="center">
                <Grid item xs={12} md={7}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{content.eyebrow}</Typography>
                    <Typography variant="h2" sx={{ fontSize: { xs: 36, md: 58 }, lineHeight: 1, fontWeight: 950, mt: 1, mb: 3 }}>{content.title}</Typography>
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.76)', lineHeight: 1.6, mb: 3 }}>{content.subtitle}</Typography>
                    <Stack spacing={1.2}>
                        {content.bullets.map((bullet) => (
                            <Stack key={bullet} direction="row" spacing={1.2} alignItems="center">
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
    return (
        <Paper sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(18,18,20,0.92)', border: '1px solid rgba(198,167,94,0.28)', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
            <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>LIVE COMMAND</Typography>
                    <Chip label="ONLINE" size="small" sx={{ bgcolor: alpha('#10b981', 0.16), color: '#10b981', fontWeight: 900 }} />
                </Stack>
                {[
                    ['Owner Contract', 'Active Protocol', 'AED 24,500'],
                    ['Tenant SOS Dispatch', 'Technician assigned', '8 min ETA'],
                    ['Move-Out Audit', 'Evidence captured', 'Verified'],
                    ['Broker Commission', 'Finance approved', 'AED 1,200']
                ].slice(0, compact ? 3 : 4).map(([a, b, c]) => (
                    <Box key={a} sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
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
    return (
        <Grid container spacing={2} sx={{ mt: 5 }}>
            {[
                ['Verified Roles', <ShieldCheck size={24} />],
                ['Documents & Contracts', <FileText size={24} />],
                ['Real-Time Maintenance', <Wrench size={24} />],
                ['Secure Operations', <LockKeyhole size={24} />]
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
    return (
        <Box sx={{ mt: 8 }}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 1 }}>Built For Real Operations</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.66)', mb: 3 }}>Owner onboarding, emergency dispatch, technician jobs, admin finance, AI design, PDF reports, title deed scanning, and contracts are planned as one connected system.</Typography>
            <Grid container spacing={2}>
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
    return (
        <Box sx={{ mt: 8 }}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 3 }}>Institutional Service Protocols</Typography>
            <Grid container spacing={2}>
                {[
                    'Maintenance Only (Alpha)',
                    'Property Management (Beta)',
                    'Total Care Hybrid (Omega)',
                    'Enterprise Custom Protocol'
                ].map((plan) => (
                    <Grid item xs={12} md={3} key={plan}>
                        <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2 }}>
                            <Building2 size={24} color={binThemeTokens.gold} />
                            <Typography fontWeight="950" sx={{ mt: 1.5 }}>{plan}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 1 }}>Coverage, exclusions, add-ons, SLA and payment terms verified before contract.</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}

function Coverage() {
    return (
        <Box sx={{ mt: 8 }}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 3 }}>UAE-Wide Portfolio Coverage</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                {propertyTypesList.map((type) => (
                    <Chip key={type} label={type} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: '#FFF', border: '1px solid rgba(198,167,94,0.22)', fontWeight: 800 }} />
                ))}
            </Stack>
        </Box>
    );
}

function DemoForm() {
    return (
        <Box sx={{ mt: 8 }}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, bgcolor: 'rgba(22,22,24,0.82)', border: '1px solid rgba(198,167,94,0.2)' }}>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={5}>
                        <Typography variant="h4" fontWeight="950">Institutional Inquiry</Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.66)', mt: 1 }}>Tell BIN-GROUPS what you manage. Your portfolio audit starts here.</Typography>
                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />
                        <Stack spacing={1}>
                            <Stack direction="row" spacing={1}><Mail size={18} color={binThemeTokens.gold} /><Typography>Ceo@bin-groups.com</Typography></Stack>
                            <Stack direction="row" spacing={1}><Phone size={18} color={binThemeTokens.gold} /><Typography>+971 55 242 3233</Typography></Stack>
                            <Stack direction="row" spacing={1}><MapPin size={18} color={binThemeTokens.gold} /><Typography>United Arab Emirates</Typography></Stack>
                        </Stack>
                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.56)', fontWeight: 800, display: 'block', mb: 1 }}>
                            CEO escalation is available in addition to normal support tickets and chat.
                        </Typography>
                        <CeoContactButtons />
                    </Grid>
                    <Grid item xs={12} md={7}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Name" /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Phone / Email" /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Property Type" /></Grid>
                            <Grid item xs={12} md={6}><TextField fullWidth label="Emirate" /></Grid>
                            <Grid item xs={12}><TextField fullWidth multiline minRows={4} label="Portfolio Details" /></Grid>
                            <Grid item xs={12}><Button disabled fullWidth variant="contained" sx={{ py: 1.4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Submit for Audit</Button></Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}
