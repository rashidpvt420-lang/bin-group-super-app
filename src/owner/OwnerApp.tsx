import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
    Box, AppBar, Toolbar, Typography, Container, IconButton,
    Breadcrumbs, Link as MuiLink, alpha, Stack, Button
} from '@mui/material';
import { ArrowLeft, Globe, LayoutDashboard, Paintbrush, UserCircle } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { NotificationBell } from '../components/NotificationBell';
import OwnerActivationGuard from '../components/owner/OwnerActivationGuard';
import BrandWatermark from '../components/BrandWatermark';

import OwnerDashboardPage from './pages/OwnerDashboardResolvedPage';
import OwnerPropertiesPage from './pages/OwnerPropertiesPage';
import OwnerContractsPage from './pages/OwnerContractsResolvedPage';
import OwnerFinancialsPage from './pages/OwnerFinancialsPage';
import OwnerIbanPage from './pages/OwnerIbanPage';
import OwnerProfilePage from './pages/OwnerProfilePage';
import OwnerRoiPage from './pages/OwnerRoiPage';
import OwnerUnitsPage from './pages/OwnerUnitsPage';
import OwnerUnitRegistryPage from './pages/OwnerUnitRegistryPage';
import OwnerTenantsPage from './pages/OwnerTenantsPage';
import OwnerPropertyPassportPage from './pages/OwnerPropertyPassportResolvedPage';
import OwnerPropertyPassportDetailPage from './pages/OwnerPropertyPassportContractDetailPage';
import OwnerDocumentsPage from './pages/OwnerDocumentsPage';
import OwnerActivationPage from './pages/OwnerActivationPage';
import DesignStudioPage from '../pages/DesignStudioPage';
import DesignRequestDetailPage from '../pages/DesignRequestDetailPage';
import OwnerComplaintPage from './pages/OwnerComplaintPage';
import OwnerTicketsPage from './pages/OwnerTicketsPage';
import OwnerTicketDetailPage from './pages/OwnerTicketDetailPage';

const OwnerLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setLang, lang, isRTL, t, tx } = useLanguage();
    const pathnames = location.pathname.split('/').filter(Boolean);
    const toggleLanguage = () => setLang(lang === 'en' ? 'ar' : 'en');
    const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: binThemeTokens.black, color: binThemeTokens.textPrimary, direction: isRTL ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', position: 'relative', isolation: 'isolate' }}>
            <BrandWatermark opacity={0.04} />
            <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'rgba(11, 11, 12, 0.9)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, zIndex: 1200 }}>
                <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        {location.pathname !== '/owner' && location.pathname !== '/owner/dashboard' && (
                            <IconButton onClick={() => navigate(-1)} sx={{ color: binThemeTokens.textPrimary }}>
                                <ArrowLeft size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                            </IconButton>
                        )}
                        <IconButton onClick={() => navigate('/owner/dashboard')} sx={{ color: binThemeTokens.gold }}>
                            <LayoutDashboard size={22} />
                        </IconButton>
                        <Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.9rem', lineHeight: 1 }}>
                                {label('portal.owner.title', 'OWNER PORTAL', 'بوابة المالك')}
                            </Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, fontSize: '0.6rem' }}>
                                {label('portal.owner.subtitle', 'SOVEREIGN ASSET TERMINAL · UAE 🇦🇪', 'محطة الأصول السيادية · الإمارات 🇦🇪')}
                            </Typography>
                        </Box>
                    </Box>

                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
                        <Button onClick={() => navigate('/owner/property-passport')} sx={{ display: { xs: 'none', md: 'inline-flex' }, color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950 }}>
                            {label('nav.property_passport', 'Property Passport', 'جواز العقار')}
                        </Button>
                        <Button onClick={() => navigate('/owner/design-studio')} startIcon={<Paintbrush size={17} />} sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950 }}>
                            {t('nav.ai_studio') || 'AI Studio'}
                        </Button>
                        <IconButton onClick={toggleLanguage} sx={{ color: '#FFF', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3, px: 2 }}>
                            <Globe size={18} color={binThemeTokens.gold} />
                            <Typography variant="caption" sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, fontWeight: 950, color: binThemeTokens.gold }}>
                                {lang === 'en' ? 'AR' : 'EN'}
                            </Typography>
                        </IconButton>
                        <NotificationBell />
                        <IconButton onClick={() => navigate('/owner/profile')} sx={{ color: '#FFF', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                            <UserCircle size={18} />
                        </IconButton>
                    </Stack>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1, position: 'relative', zIndex: 1 }}>
                {pathnames.length > 1 && (
                    <Breadcrumbs sx={{ mb: 4, '& .MuiBreadcrumbs-separator': { color: 'rgba(255,255,255,0.2)' }, '& .MuiBreadcrumbs-ol': { flexDirection: isRTL ? 'row-reverse' : 'row' } }}>
                        <MuiLink component="button" onClick={() => navigate('/owner/dashboard')} sx={{ color: binThemeTokens.gold, fontWeight: 900, textDecoration: 'none', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                            {t('nav.dashboard')}
                        </MuiLink>
                        {pathnames.slice(1).map((value, idx) => (
                            <Typography key={idx} sx={{ color: idx === pathnames.length - 2 ? '#FFF' : 'rgba(255,255,255,0.4)', fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                {label(`nav.${value.replace('-', '_')}`, value.replace('-', ' '), value.replace('-', ' '))}
                            </Typography>
                        ))}
                    </Breadcrumbs>
                )}
                <OwnerActivationGuard>
                    <Box sx={{ animation: 'fadeIn 0.5s ease-out' }}>{children}</Box>
                </OwnerActivationGuard>
            </Container>

            <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(11, 11, 12, 0.5)', position: 'relative', zIndex: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800, letterSpacing: 2 }}>
                    © 2026 BIN GROUP SOVEREIGN · INSTITUTIONAL ASSET LEDGER · MADE IN UAE 🇦🇪
                </Typography>
            </Box>

            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </Box>
    );
};

export default function OwnerApp() {
    return (
        <OwnerLayout>
            <Routes>
                <Route path="/" element={<OwnerDashboardPage />} />
                <Route path="/dashboard" element={<OwnerDashboardPage />} />
                <Route path="/activation" element={<OwnerActivationPage />} />
                <Route path="/onboarding-status" element={<OwnerActivationPage />} />
                <Route path="/properties" element={<OwnerPropertiesPage />} />
                <Route path="/contracts" element={<OwnerContractsPage />} />
                <Route path="/financials" element={<OwnerFinancialsPage />} />
                <Route path="/iban" element={<OwnerIbanPage />} />
                <Route path="/profile" element={<OwnerProfilePage />} />
                <Route path="/roi" element={<OwnerRoiPage />} />
                <Route path="/units" element={<OwnerUnitRegistryPage />} />
                <Route path="/legacy-units" element={<OwnerUnitsPage />} />
                <Route path="/tenants" element={<OwnerTenantsPage />} />
                <Route path="/property-passport" element={<OwnerPropertyPassportPage />} />
                <Route path="/property-passport/:passportId" element={<OwnerPropertyPassportDetailPage />} />
                <Route path="/documents" element={<OwnerDocumentsPage />} />
                <Route path="/design-studio" element={<DesignStudioPage />} />
                <Route path="/design-studio/request/:id" element={<DesignRequestDetailPage />} />
                <Route path="/complaint" element={<OwnerComplaintPage />} />
                <Route path="/tickets" element={<OwnerTicketsPage />} />
                <Route path="/ticket/:id" element={<OwnerTicketDetailPage />} />
            </Routes>
        </OwnerLayout>
    );
}
