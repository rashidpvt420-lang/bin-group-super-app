import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useLanguage } from '@bin/shared/context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import Navigation from './Navigation';
import { LanguageSwitcher } from './LanguageSwitcher';
import BrandWatermark from './BrandWatermark';
import { functions as adminFunctions } from '../lib/firebase';

const SovereignAIChat = lazy(() =>
    import('@bin/shared/components/SovereignAIChat').then((module) => ({
        default: module.SovereignAIChat,
    })),
);

const SovereignAlertHandler = lazy(() =>
    import('@bin/shared/components/SovereignAlertHandler').then((module) => ({
        default: module.SovereignAlertHandler,
    })),
);

function useIdleOperationalWidgets() {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const mount = () => {
            if (!cancelled) setReady(true);
        };

        const browserWindow = window as Window & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        if (browserWindow.requestIdleCallback) {
            const idleHandle = browserWindow.requestIdleCallback(mount, { timeout: 2000 });
            return () => {
                cancelled = true;
                browserWindow.cancelIdleCallback?.(idleHandle);
            };
        }

        const timeoutHandle = window.setTimeout(mount, 1200);
        return () => {
            cancelled = true;
            window.clearTimeout(timeoutHandle);
        };
    }, []);

    return ready;
}

export default function AdminLayout() {
    const { t, isRTL } = useLanguage();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const operationalWidgetsReady = useIdleOperationalWidgets();
    const shellText = (en: string, ar: string) => (isRTL ? ar : en);

    const handleLogout = async () => {
        try {
            sessionStorage.removeItem('bin-admin-security-session');
            await logout();
        } catch (error) {
            console.error('Admin logout failure:', error);
            window.location.href = '/login';
        }
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', width: '100vw', bgcolor: '#020617', overflow: 'hidden', direction: isRTL ? 'rtl' : 'ltr' }}>
            <Navigation />
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'relative' }}>
                <BrandWatermark opacity={0.035} />
                <Box sx={{ px: 4, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'rgba(2, 6, 23, 0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.05)', zIndex: 1100 }}>
                    <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2 }}>
                        {t('nav.administry')} / <Box component="span" sx={{ color: '#DAA520' }}>{shellText('COMMAND · UAE 🇦🇪', 'القيادة · الإمارات 🇦🇪')}</Box>
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <LanguageSwitcher />
                        <Box sx={{ width: '1px', height: 24, bgcolor: 'rgba(255,255,255,0.1)' }} />
                        <Button
                            href="/profile"
                            onClick={(event) => {
                                event.preventDefault();
                                navigate('/profile');
                            }}
                            data-testid="admin-profile-link"
                            aria-label={shellText('Open Admin profile and security', 'فتح ملف المسؤول والأمان')}
                            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.5, minWidth: 0, borderRadius: 100, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: '#FFF', textTransform: 'none', '&:hover': { bgcolor: 'rgba(218,165,32,0.10)', borderColor: 'rgba(218,165,32,0.45)' } }}
                        >
                            <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#DAA520', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <UserIcon size={14} color="#000" />
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ color: '#FFF', fontWeight: 900, display: 'block', lineHeight: 1 }}>{user?.displayName?.split(' ')[0] || shellText('ADMIN', 'مسؤول')}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' }}>{user?.role || shellText('operator', 'مشغّل')}</Typography>
                            </Box>
                        </Button>
                        <Button onClick={handleLogout} data-testid="admin-logout" startIcon={<LogOut size={16} />} sx={{ color: '#ef4444', fontWeight: 900, fontSize: '0.75rem', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.1)' } }}>
                            {t('nav.logout') || shellText('LOGOUT', 'تسجيل الخروج')}
                        </Button>
                    </Box>
                </Box>

                <Box component="main" sx={{ flexGrow: 1, overflowY: 'auto', p: 0, bgcolor: '#020617', display: 'flex', flexDirection: 'column', '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '4px' } }}>
                    <Box sx={{ flexGrow: 1 }}><Outlet /></Box>
                    <Box component="footer" sx={{ p: 4, borderTop: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: 2, fontWeight: 900 }}>
                            © 2026 BIN GROUP | {t('landing.footer.built_for_uae')} | {shellText('MADE IN UAE 🇦🇪', 'صُنع في الإمارات 🇦🇪')}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            <Suspense fallback={null}>
                <SovereignAlertHandler />
                {operationalWidgetsReady ? (
                    <Box sx={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999 }}>
                        <SovereignAIChat
                            role="admin"
                            onNavigate={navigate}
                            functionsOverride={adminFunctions}
                            isAuthenticated={Boolean(user?.uid)}
                            authUserId={user?.uid || null}
                        />
                    </Box>
                ) : null}
            </Suspense>
        </Box>
    );
}
