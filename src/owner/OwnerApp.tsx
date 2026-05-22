import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
    Box, AppBar, Toolbar, Typography, Container, IconButton,
    Breadcrumbs, Link as MuiLink, alpha, Stack, Button
} from '@mui/material';
import { ArrowLeft, Globe, LayoutDashboard, Paintbrush, Settings } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { NotificationBell } from '../components/NotificationBell';
import OwnerActivationGuard from '../components/owner/OwnerActivationGuard';

import OwnerDashboardPage from './pages/OwnerDashboardPageV2';
import OwnerPropertiesPage from './pages/OwnerPropertiesPage';
import OwnerContractsPage from './pages/OwnerContractsPage';
import OwnerFinancialsPage from './pages/OwnerFinancialsPage';
import OwnerIbanPage from './pages/OwnerIbanPage';
import OwnerRoiPage from './pages/OwnerRoiPage';
import OwnerUnitsPage from './pages/OwnerUnitsPage';
import OwnerUnitRegistryPage from './pages/OwnerUnitRegistryPage';
import OwnerTenantsPage from './pages/OwnerTenantsPage';
import OwnerPropertyPassportPage from './pages/OwnerPropertyPassportPage';
import OwnerPropertyPassportDetailPage from './pages/OwnerPropertyPassportDetailPage';
import OwnerDocumentsPage from './pages/OwnerDocumentsPage';
import OwnerActivationPage from './pages/OwnerActivationPage';

const OwnerLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { toggleLanguage, language, isRTL } = useLanguage();
    const pathnames = location.pathname.split('/').filter(Boolean);

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: binThemeTokens.black, color: binThemeTokens.textPrimary, direction: isRTL ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column' }}>
            <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'rgba(11, 11, 12, 0.9)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, zIndex: 1200 }}>
                <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {location.pathname !== '/owner' && location.pathname !== '/owner/dashboard' && (
                            <IconButton onClick={() => navigate(-1)} sx={{ color: binThemeTokens.textPrimary }}>
                                <ArrowLeft size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                            </IconButton>
                        )}
                        <IconButton onClick={() => navigate('/owner/dashboard')} sx={{ color: binThemeTokens.gold }}>
                            <LayoutDashboard size={22} />
                        </IconButton>
                        <Box sx={{ ml: 1 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.9rem', lineHeight: 1 }}>
                                OWNER PORTAL
                            </Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, fontSize: '0.6rem' }}>
                                SOVEREIGN ASSET TERMINAL
                            </Typography>
                        </Box>
                    </Box>

                    <Stack direction="row" spacing={1} alignItems="center">
                        <Button onClick={() => navigate('/owner/property-passport')} sx={{ display: { xs: 'none', md: 'inline-flex' }, color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950 }}>
                            Property Passport
                        </Button>
                        <Button onClick={() => navigate('/design-studio')} startIcon={<Paintbrush size={17} />} sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950 }}>
                            AI Studio
                        </Button>
                        <IconButton onClick={toggleLanguage} sx={{ color: '#FFF', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3, px: 2 }}>
                            <Globe size={18} color={binThemeTokens.gold} />
                            <Typography variant="caption" sx={{ ml: 1, mr: isRTL ? 1 : 0, fontWeight: 950, color: binThemeTokens.gold }}>
                                {language === 'en' ? 'AR' : 'EN'}
                            </Typography>
                        </IconButton>
                        <NotificationBell />
                        <IconButton onClick={() => navigate('/owner/iban')} sx={{ color: '#FFF', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                            <Settings size={18} />
                        </IconButton>
                    </Stack>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
                {pathnames.length > 1 && (
                    <Breadcrumbs sx={{ mb: 4, '& .MuiBreadcrumbs-separator': { color: 'rgba(255,255,255,0.2)' }, '& .MuiBreadcrumbs-ol': { flexDirection: isRTL ? 'row-reverse' : 'row' } }}>
                        <MuiLink component="button" onClick={() => navigate('/owner/dashboard')} sx={{ color: binThemeTokens.gold, fontWeight: 900, textDecoration: 'none', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                            Dashboard
                        </MuiLink>
                        {pathnames.slice(1).map((value, idx) => (
                            <Typography key={idx} sx={{ color: idx === pathnames.length - 2 ? '#FFF' : 'rgba(255,255,255,0.4)', fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                {value.replace('-', ' ')}
                            </Typography>
                        ))}
                    </Breadcrumbs>
                )}
                <OwnerActivationGuard>
                    <Box sx={{ animation: 'fadeIn 0.5s ease-out' }}>{children}</Box>
                </OwnerActivationGuard>
            </Container>

            <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(11, 11, 12, 0.5)' }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800, letterSpacing: 2 }}>
                    © 2026 BIN GROUP SOVEREIGN · INSTITUTIONAL ASSET LEDGER
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
                <Route path="/roi" element={<OwnerRoiPage />} />
                <Route path="/units" element={<OwnerUnitRegistryPage />} />
                <Route path="/legacy-units" element={<OwnerUnitsPage />} />
                <Route path="/tenants" element={<OwnerTenantsPage />} />
                <Route path="/property-passport" element={<OwnerPropertyPassportPage />} />
                <Route path="/property-passport/:passportId" element={<OwnerPropertyPassportDetailPage />} />
                <Route path="/documents" element={<OwnerDocumentsPage />} />
            </Routes>
        </OwnerLayout>
    );
}
