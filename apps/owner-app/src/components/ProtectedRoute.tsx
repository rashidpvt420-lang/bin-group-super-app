import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '../context/LanguageContext';
import { Box, Typography, CircularProgress, Button, Stack } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';
import { Lock, LogOut } from 'lucide-react';
import { auth } from '../lib/firebase';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

const ROLE_HOME_PATHS: Record<string, string> = {
    owner: '/owner-dashboard',
    tenant: '/tenant',
    technician: '/technician',
    broker: '/broker',
    auditor: '/auditor',
};

const resolveRoleHomePath = (normalizedRole: string) => ROLE_HOME_PATHS[normalizedRole] || '/gateway';

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { user, role, status, isAdmin, loading } = useRole();
    const { t } = useLanguage();
    const location = useLocation();

    if (loading) {
        return null; // Parent (AppContent) handles full-screen loading
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    const currentStatus = (status || '').toLowerCase();
    const normalizedRole = (role || '').toLowerCase();

    // 1. [STRICT ROLE ENFORCEMENT]
    // Bounce unauthorized roles to their own portal home — never to a fixed
    // "/dashboard" fallback, which loops for roles (e.g. auditor) that don't map to it.
    if (allowedRoles && !allowedRoles.includes(normalizedRole) && !isAdmin) {
        return <Navigate to={resolveRoleHomePath(normalizedRole)} replace />;
    }

    // 2. [OWNER LOCK PROTOCOL]
    // Only lock out owners who are pending or haven't paid.
    // Tenants/Technicians bypass this as their status is managed differently.
    const ownerLockedStatuses = ['pending', 'pending_approval', 'payment_pending', 'awaiting_verification', 'awaiting_approval', 'rejected', 'onboarding'];
    const isProtectedPortal = location.pathname.startsWith('/tenant') ||
                              location.pathname.startsWith('/technician') ||
                              location.pathname.startsWith('/tech') ||
                              location.pathname.startsWith('/broker') ||
                              location.pathname.startsWith('/auditor');
    if (normalizedRole === 'owner' && ownerLockedStatuses.includes(currentStatus) && !isAdmin && !isProtectedPortal) {
        if (!location.pathname.startsWith('/onboarding') && !user?.onboardingComplete) {
            const isPendingApproval = currentStatus === 'pending_approval' || currentStatus === 'awaiting_verification' || currentStatus === 'payment_pending';

            return (
                <Box sx={{
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: binThemeTokens.canvas,
                    color: binThemeTokens.textPrimary,
                    textAlign: 'center',
                    p: 4,
                    backgroundImage: 'radial-gradient(circle at center, rgba(198, 167, 94, 0.05) 0%, transparent 70%)'
                }}>
                    <Box sx={{ 
                        p: 3, borderRadius: '50%', bgcolor: 'rgba(198, 167, 94, 0.1)', 
                        border: `1px solid ${binThemeTokens.gold}44`, mb: 4,
                        boxShadow: `0 0 50px ${binThemeTokens.gold}22`
                    }}>
                        <Lock size={64} color={binThemeTokens.gold} />
                    </Box>
                    <Typography variant="h3" sx={{ color: binThemeTokens.goldHover, fontWeight: 900, mb: 2, letterSpacing: -1 }}>
                        {isPendingApproval ? t('lock.title_offline') : t('lock.title')}
                    </Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, mb: 4, maxWidth: 600, fontWeight: 700 }}>
                        {isPendingApproval ? t('lock.desc_offline') : t('lock.desc')}
                    </Typography>

                    <Stack direction="row" spacing={2} sx={{ justifyContent: 'center' }}>
                        <Button
                            variant="outlined"
                            startIcon={<LogOut size={18} />}
                            onClick={() => auth.signOut()}
                            sx={{ borderColor: binThemeTokens.border, color: binThemeTokens.textPrimary, fontWeight: 800, px: 4 }}
                        >
                            {t('lock.signout')}
                        </Button>
                        {!isPendingApproval && (
                            <Button
                                variant="contained"
                                href="/onboarding"
                                sx={{ bgcolor: binThemeTokens.gold, color: binThemeTokens.textPrimary, fontWeight: 900, px: 4, '&:hover': { bgcolor: binThemeTokens.goldHover } }}
                            >
                                {t('lock.resume')}
                            </Button>
                        )}
                    </Stack>
                </Box>
            );
        }
    }

    return <>{children}</>;
};

export default ProtectedRoute;
