import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { 
    Box, AppBar, Toolbar, Typography, Container, IconButton, 
    Breadcrumbs, Link as MuiLink, alpha, Stack, Avatar 
} from '@mui/material';
import { ArrowLeft, Home, Globe, User, Bell, LayoutDashboard, Settings } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { NotificationBell } from '../components/NotificationBell';

import OwnerDashboardPage from './pages/OwnerDashboardPage';
import OwnerPropertiesPage from './pages/OwnerPropertiesPage';
import OwnerContractsPage from './pages/OwnerContractsPage';
import OwnerFinancialsPage from './pages/OwnerFinancialsPage';
import OwnerIbanPage from './pages/OwnerIbanPage';
import OwnerRoiPage from './pages/OwnerRoiPage';
import OwnerUnitsPage from './pages/OwnerUnitsPage';
import OwnerTenantsPage from './pages/OwnerTenantsPage';
import OwnerPropertyPassportPage from './pages/OwnerPropertyPassportPage';
import OwnerDocumentsPage from './pages/OwnerDocumentsPage';

const OwnerLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { toggleLanguage, language, t, isRTL } = useLanguage();
    const pathnames = location.pathname.split('/').filter(Boolean);

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: binThemeTokens.black, 
            color: binThemeTokens.textPrimary,
            direction: isRTL ? 'rtl' : 'ltr',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Sovereign Owner Header */}
            <AppBar 
                position="sticky" 
                elevation={0} 
                sx={{
                    bgcolor: 'rgba(11, 11, 12, 0.9)',
                    backdropFilter: 'blur(16px)',
                    borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`,
                    zIndex: 1200
                }}
            >
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
                                {t('sector.owners.eyebrow') || 'OWNER PORTAL'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, fontSize: '0.6rem' }}>
                                SOVEREIGN ASSET TERMINAL
                            </Typography>
                        </Box>
                    </Box>

                    <Stack direction="row" spacing={1} alignItems="center">
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
                    <Breadcrumbs 
                        sx={{ 
                            mb: 4, 
                            '& .MuiBreadcrumbs-separator': { color: 'rgba(255,255,255,0.2)' },
                            '& .MuiBreadcrumbs-ol': { flexDirection: isRTL ? 'row-reverse' : 'row' }
                        }}
                    >
                        <MuiLink 
                            component="button" 
                            onClick={() => navigate('/owner/dashboard')} 
                            sx={{ color: binThemeTokens.gold, fontWeight: 900, textDecoration: 'none', fontSize: '0.75rem', textTransform: 'uppercase' }}
                        >
                            {t('nav.dashboard')}
                        </MuiLink>
                        {pathnames.slice(1).map((value, idx) => (
                            <Typography 
                                key={idx} 
                                sx={{ 
                                    color: idx === pathnames.length - 2 ? '#FFF' : 'rgba(255,255,255,0.4)', 
                                    fontWeight: 900, 
                                    fontSize: '0.75rem', 
                                    textTransform: 'uppercase' 
                                }}
                            >
                                {value.replace('-', ' ')}
                            </Typography>
                        ))}
                    </Breadcrumbs>
                )}
                <Box sx={{ animation: 'fadeIn 0.5s ease-out' }}>
                    {children}
                </Box>
            </Container>

            {/* Sovereign Footer */}
            <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(11, 11, 12, 0.5)' }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800, letterSpacing: 2 }}>
                    © 2026 BIN GROUP SOVEREIGN · INSTITUTIONAL ASSET LEDGER
                </Typography>
            </Box>

            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}
            </style>
        </Box>
    );
};

export default function OwnerApp() {
    return (
        <OwnerLayout>
            <Routes>
                <Route path="/" element={<OwnerDashboardPage />} />
                <Route path="/dashboard" element={<OwnerDashboardPage />} />
                <Route path="/properties" element={<OwnerPropertiesPage />} />
                <Route path="/contracts" element={<OwnerContractsPage />} />
                <Route path="/financials" element={<OwnerFinancialsPage />} />
                <Route path="/iban" element={<OwnerIbanPage />} />
                <Route path="/roi" element={<OwnerRoiPage />} />
                <Route path="/units" element={<OwnerUnitsPage />} />
                <Route path="/tenants" element={<OwnerTenantsPage />} />
                <Route path="/property-passport" element={<OwnerPropertyPassportPage />} />
                <Route path="/documents" element={<OwnerDocumentsPage />} />
            </Routes>
        </OwnerLayout>
    );
}
