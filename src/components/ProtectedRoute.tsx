import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRole, type SovereignPermission } from '../context/RoleContext';
import { useLanguage } from '@bin/shared';
import { Box, Typography, Button, Stack } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';
import { Lock, LogOut } from 'lucide-react';
import { auth } from '../lib/firebase';
interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
    requiredPermission?: SovereignPermission;
}

const ROLE_HOME_PATHS: Record<string, string> = {
    owner: '/owner/dashboard',
    tenant: '/tenant/dashboard',
    technician: '/technician/dashboard',
    broker: '/broker/dashboard',
    admin: '/admin/dashboard',
    super_admin: '/admin/dashboard',
    ceo: '/admin/dashboard',
    manager: '/admin/dashboard',
    operations_admin: '/admin/dashboard',
    finance_admin: '/admin/dashboard',
    hr_admin: '/admin/dashboard',
    support_admin: '/admin/dashboard',
    hr_manager: '/admin/dashboard',
    hr_staff: '/admin/dashboard',
    finance_staff: '/admin/dashboard',
    account_manager: '/admin/dashboard',
    dispatcher: '/admin/dashboard',
    operations_manager: '/admin/dashboard',
};

const resolveRoleHomePath = (normalizedRole: string) => ROLE_HOME_PATHS[normalizedRole] || '/gateway';

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission }) => {
    const { user, role, status, isAdmin, loading, hasPermission } = useRole();
    const { t } = useLanguage();
    const location = useLocation();

    if (loading) {
        return null;
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    const currentStatus = (status || '').toLowerCase();
    const normalizedRole = (role || '').toLowerCase();
    const isAdminRoute = location.pathname.startsWith('/admin');
    // Staff-tier roles (hr_staff, dispatcher, etc.) are not granted isAdmin —
    // they get read-only access to /admin/* via the explicit allowedRoles list
    // instead, so they don't get redirect-looped back into the route they need.
    const isAllowedStaffRole = Boolean(allowedRoles && allowedRoles.includes(normalizedRole));

    if (isAdminRoute && !isAdmin && !isAllowedStaffRole) {
        return <Navigate to={resolveRoleHomePath(normalizedRole)} replace />;
    }

    if (!isAdmin && (currentStatus === 'role_required' || !normalizedRole)) {
        return <Navigate to="/gateway" state={{ reason: 'role_required', from: location }} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(normalizedRole) && !isAdmin) {
        return <Navigate to={resolveRoleHomePath(normalizedRole)} replace />;
    }

    if (requiredPermission && !hasPermission(requiredPermission)) {
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
            }}>
                <Lock size={64} color={binThemeTokens.danger} />
                <Typography variant="h4" sx={{ color: binThemeTokens.danger, fontWeight: 900, mt: 3, mb: 1 }}>
                    ACCESS RESTRICTED
                </Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4, maxWidth: 400 }}>
                    Your account does not have the required institutional permission: <strong>{requiredPermission}</strong>. Contact your administrator to request access.
                </Typography>
                <Button
                    variant="outlined"
                    onClick={() => window.history.back()}
                    sx={{ borderColor: binThemeTokens.border, color: binThemeTokens.textPrimary, fontWeight: 800 }}
                >
                    RETURN TO SAFETY
                </Button>
            </Box>
        );
    }

    const ownerLockedStatuses = ['pending', 'pending_approval', 'payment_pending', 'awaiting_verification', 'awaiting_approval', 'rejected', 'onboarding'];

    const isProtectedPortal = location.pathname.startsWith('/admin') ||
                              location.pathname.startsWith('/tenant') ||
                              location.pathname.startsWith('/technician') ||
                              location.pathname.startsWith('/broker');

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
                    backgroundImage: 'radial-gradient(circle at center, rgba(201, 166, 70, 0.08) 0%, transparent 70%)'
                }}>
                    <Box sx={{
                        p: 3,
                        borderRadius: '50%',
                        bgcolor: 'rgba(201, 166, 70, 0.1)',
                        border: `1px solid ${binThemeTokens.gold}44`,
                        mb: 4,
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
