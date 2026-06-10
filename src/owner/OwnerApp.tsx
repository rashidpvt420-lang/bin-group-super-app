import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
    Box, AppBar, Toolbar, Typography, Container, IconButton,
    Breadcrumbs, Link as MuiLink, alpha, Stack, Button, Tooltip
} from '@mui/material';
import { ArrowLeft, LayoutDashboard, LogOut, Paintbrush, UserCircle } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { auth } from '../lib/firebase';
import { NotificationBell } from '../components/NotificationBell';
import OwnerActivationGuard from '../components/owner/OwnerActivationGuard';
import BrandWatermark from '../components/BrandWatermark';
import SafeIcon, { renderSafeIcon } from '../components/SafeIcon';

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

    const handleSecureLogout = async () => {
        const preferredLanguage = localStorage.getItem('bin_language');
        try {
            localStorage.clear();
            sessionStorage.clear();
            if (preferredLanguage) localStorage.setItem('bin_language', preferredLanguage);
            await signOut(auth);
        } catch (error) {
            console.warn('[OwnerApp] Secure logout fallback triggered.', error);
        } finally {
            window.location.replace('/login?intendedRole=owner&logout=1');
        }
    };

    void toggleLanguage;

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: binThemeTokens.canvas,
            color: binThemeTokens.textPrimary,
            direction: isRTL ? 'rtl' : 'ltr',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            isolation: 'isolate',
            background: `linear-gradient(180deg, ${binThemeTokens.canvas} 0%, ${binThemeTokens.softCanvas} 100%)`,
        }}>
            <BrandWatermark label="BIN GROUPS" opacity={binThemeTokens.watermarkOpacity} />
            <AppBar position="sticky" elevation={0} sx={{
                bgcolor: alpha(binThemeTokens.canvas, 0.94),
                backdropFilter: 'blur(18px)',
                borderBottom: `1px solid ${binThemeTokens.border}`,
                boxShadow: '0 8px 24px rgba(17, 24, 39, 0.06)',
                zIndex: 1200,
            }}>
                <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        {location.pathname !== '/owner' && location.pathname !== '/owner/dashboard' && (
                            <IconButton onClick={() => navigate(-1)} sx={{ color: binThemeTokens.textPrimary, bgcolor: alpha(binThemeTokens.platinum, 0.35) }}>
                                <SafeIcon icon={ArrowLeft} size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                            </IconButton>
                        )}
                        <IconButton onClick={() => navigate('/owner/dashboard')} sx={{ color: binThemeTokens.goldHover, bgcolor: alpha(binThemeTokens.gold, 0.10), border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
                            <SafeIcon icon={LayoutDashboard} size={22} />
                        </IconButton>
                        <Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.textPrimary, textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.9rem', lineHeight: 1 }}>
                                {label('portal.owner.title', 'OWNER PORTAL', 'بوابة المالك')}
                            </Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.goldHover, fontWeight: 900, letterSpacing: 1, fontSize: '0.6rem' }}>
                                {label('portal.owner.subtitle', 'WHITE & PLATINUM PROPERTY OS · UAE 🇦🇪', 'نظام العقار الأبيض والبلاتيني · الإمارات 🇦🇪')}
                            </Typography>
                        </Box>
                    </Box>

                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
                        <Button onClick={() => navigate('/owner/property-passport')} sx={{ display: { xs: 'none', md: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff', boxShadow: '0 10px 26px rgba(17,24,39,0.05)' }}>
                            {label('nav.property_passport', 'Property Passport', 'جواز العقار')}
                        </Button>
                        <Button onClick={() => navigate('/owner/design-studio')} startIcon={renderSafeIcon(Paintbrush, { size: 17 })} sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff', boxShadow: '0 10px 26px rgba(17,24,39,0.05)' }}>
                            {t('nav.ai_studio') || 'AI Studio'}
                        </Button>
                        <NotificationBell />
                        <IconButton onClick={() => navigate('/owner/profile')} sx={{ color: binThemeTokens.textPrimary, bgcolor: alpha(binThemeTokens.platinum, 0.38), borderRadius: 3 }}>
                            <SafeIcon icon={UserCircle} size={18} />
                        </IconButton>
                        <Button
                            onClick={handleSecureLogout}
                            startIcon={renderSafeIcon(LogOut, { size: 17 })}
                            sx={{
                                display: { xs: 'none', sm: 'inline-flex' },
                                color: '#ef4444',
                                border: `1px solid ${alpha('#ef4444', 0.28)}`,
                                borderRadius: 3,
                                fontWeight: 950,
                                bgcolor: alpha('#ef4444', 0.08),
                                '&:hover': { bgcolor: alpha('#ef4444', 0.14) }
                            }}
                        >
                            {label('nav.logout_secure', 'Logout', 'تسجيل الخروج')}
                        </Button>
                        <Tooltip title={label('nav.logout_secure', 'Logout', 'تسجيل الخروج')}>
                            <IconButton
                                onClick={handleSecureLogout}
                                sx={{
                                    display: { xs: 'inline-flex', sm: 'none' },
                                    color: '#ef4444',
                                    bgcolor: alpha('#ef4444', 0.08),
                                    border: `1px solid ${alpha('#ef4444', 0.28)}`,
                                    borderRadius: 3
                                }}
                            >
                                <SafeIcon icon={LogOut} size={18} />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1, position: 'relative', zIndex: 1 }}>
                {pathnames.length > 1 && (
                    <Breadcrumbs sx={{ mb: 4, '& .MuiBreadcrumbs-separator': { color: alpha(binThemeTokens.textSecondary, 0.45) }, '& .MuiBreadcrumbs-ol': { flexDirection: isRTL ? 'row-reverse' : 'row' } }}>
                        <MuiLink component="button" onClick={() => navigate('/owner/dashboard')} sx={{ color: binThemeTokens.goldHover, fontWeight: 900, textDecoration: 'none', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                            {t('nav.dashboard')}
                        </MuiLink>
                        {pathnames.slice(1).map((value, idx) => (
                            <Typography key={idx} sx={{ color: idx === pathnames.length - 2 ? binThemeTokens.textPrimary : binThemeTokens.textSecondary, fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                {label(`nav.${value.replace('-', '_')}`, value.replace('-', ' '), value.replace('-', ' '))}
                            </Typography>
                        ))}
                    </Breadcrumbs>
                )}
                <OwnerActivationGuard>
                    <Box sx={{ animation: 'fadeIn 0.5s ease-out' }}>{children}</Box>
                </OwnerActivationGuard>
            </Container>

            <Box sx={{ py: 3, textAlign: 'center', borderTop: `1px solid ${binThemeTokens.border}`, bgcolor: alpha(binThemeTokens.canvas, 0.86), position: 'relative', zIndex: 1 }}>
                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800, letterSpacing: 2 }}>
                    © 2026 BIN GROUP SOVEREIGN · WHITE & PLATINUM PROPERTY OS · MADE IN UAE 🇦🇪
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
