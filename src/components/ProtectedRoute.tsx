import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRole, type SovereignPermission } from '../context/RoleContext';
import { useLanguage } from '@bin/shared';
import { Box, Typography, Button, Stack, CircularProgress } from '@mui/material';
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
    const { user, role, status, isAdmin, loading, hasPermission, refreshRole } = useRole();
    const { t, lang } = useLanguage();
    const location = useLocation();
    const isRTL = lang === 'ar';

    if (loading) {
        return (
            <Box role="status" aria-live="polite" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: binThemeTokens.canvas }}>
                <Stack spacing={2} alignItems="center">
                    <CircularProgress sx={{ color: binThemeTokens.gold }} />
                    <Typography color={binThemeTokens.textSecondary}>
                        {lang === 'ar' ? 'جارٍ التحقق من حالة الحساب…' : 'Verifying account status…'}
                    </Typography>
                </Stack>
            </Box>
        );
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

    if (allowedRoles && !allowedRoles.includes(normalizedRole)) {
        return <Navigate to={resolveRoleHomePath(normalizedRole)} replace />;
    }

    if (currentStatus === 'profile_unavailable' || currentStatus === 'profile_missing') {
        return (
            <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: binThemeTokens.canvas, p: 4 }}>
                <Stack spacing={3} alignItems="center" sx={{ maxWidth: 560, textAlign: 'center' }}>
                    <Lock size={56} color={binThemeTokens.gold} />
                    <Typography variant="h4" fontWeight={900}>
                        {lang === 'ar' ? 'تعذر التحقق من حالة الحساب' : 'ACCOUNT STATUS UNVERIFIED'}
                    </Typography>
                    <Typography color={binThemeTokens.textSecondary}>
                        {lang === 'ar'
                            ? 'تم إيقاف الوصول لحماية بياناتك. أعد المحاولة بعد استعادة الاتصال أو تواصل مع الدعم إذا استمرت المشكلة.'
                            : 'Portal access is paused because the server profile could not be verified. Retry after restoring connectivity or contact support if this continues.'}
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Button variant="contained" onClick={() => void refreshRole()}>
                            {lang === 'ar' ? 'إعادة المحاولة' : 'RETRY VERIFICATION'}
                        </Button>
                        <Button variant="outlined" startIcon={<LogOut size={18} />} onClick={() => auth.signOut()}>
                            {lang === 'ar' ? 'تسجيل الخروج' : 'SIGN OUT'}
                        </Button>
                    </Stack>
                </Stack>
            </Box>
        );
    }

    const pendingPortalStatuses: Record<string, Set<string>> = {
        tenant: new Set(['pending_invitation', 'suspended', 'rejected']),
        technician: new Set(['pending', 'pending_approval', 'suspended', 'rejected']),
        broker: new Set(['pending', 'pending_kyc', 'pending_approval', 'suspended', 'rejected']),
    };
    const pendingProfilePaths: Record<string, string> = {
        technician: '/technician/profile',
        broker: '/broker/profile',
    };
    const pendingStatuses = pendingPortalStatuses[normalizedRole];
    const pendingProfilePath = pendingProfilePaths[normalizedRole];
    if (
        !isAdmin &&
        pendingStatuses?.has(currentStatus) &&
        (!pendingProfilePath || location.pathname !== pendingProfilePath)
    ) {
        return (
            <Box sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: binThemeTokens.canvas,
                color: binThemeTokens.textPrimary,
                p: 4,
                direction: isRTL ? 'rtl' : 'ltr',
            }}>
                <Stack spacing={3} sx={{ maxWidth: 560, textAlign: 'center', alignItems: 'center' }}>
                    <Lock size={56} color={binThemeTokens.gold} />
                    <Typography variant="h4" fontWeight={900}>
                        {isRTL ? 'مراجعة الحساب مطلوبة' : 'ACCOUNT REVIEW REQUIRED'}
                    </Typography>
                    <Typography color={binThemeTokens.textSecondary}>
                        {isRTL
                            ? 'ستبقى البوابة مقفلة أثناء التحقق من الحساب. لا تتوفر أي إجراءات تشغيلية أو مالية في هذه الحالة.'
                            : 'This portal remains locked while account verification is pending. No operational or financial action is available in this state.'}
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        {pendingProfilePath && (
                            <Button variant="contained" href={pendingProfilePath}>
                                {isRTL ? 'مراجعة الملف' : 'REVIEW PROFILE'}
                            </Button>
                        )}
                        <Button variant="outlined" startIcon={<LogOut size={18} />} onClick={() => auth.signOut()}>
                            {t('lock.signout')}
                        </Button>
                    </Stack>
                </Stack>
            </Box>
        );
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
                direction: isRTL ? 'rtl' : 'ltr',
            }}>
                <Lock size={64} color={binThemeTokens.danger} />
                <Typography variant="h4" sx={{ color: binThemeTokens.danger, fontWeight: 900, mt: 3, mb: 1 }}>
                    {isRTL ? 'الوصول مقيّد' : 'ACCESS RESTRICTED'}
                </Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4, maxWidth: 400 }}>
                    {isRTL
                        ? <>لا يملك حسابك الصلاحية المؤسسية المطلوبة: <strong>{requiredPermission}</strong>. تواصل مع المسؤول لطلب الوصول.</>
                        : <>Your account does not have the required institutional permission: <strong>{requiredPermission}</strong>. Contact your administrator to request access.</>}
                </Typography>
                <Button
                    variant="outlined"
                    onClick={() => window.history.back()}
                    sx={{ borderColor: binThemeTokens.border, color: binThemeTokens.textPrimary, fontWeight: 800 }}
                >
                    {isRTL ? 'العودة بأمان' : 'RETURN TO SAFETY'}
                </Button>
            </Box>
        );
    }

    const ownerLockedStatuses = [
        'pending',
        'pending_approval',
        'pending_admin_approval',
        'payment_pending',
        'payment_pending_approval',
        'payment_pending_admin_verification',
        'awaiting_verification',
        'awaiting_approval',
        'rejected',
        'onboarding',
        'suspended',
    ];

    const ownerStatusAllowedPaths = new Set([
        '/owner/activation',
        '/owner/onboarding-status',
        '/owner/contracts',
        '/owner/documents',
    ]);
    const ownerStatusPathAllowed = currentStatus !== 'suspended' && ownerStatusAllowedPaths.has(location.pathname);

    if (
        normalizedRole === 'owner' &&
        ownerLockedStatuses.includes(currentStatus) &&
        !isAdmin &&
        location.pathname.startsWith('/owner') &&
        !ownerStatusPathAllowed
    ) {
            const isPendingApproval = ['pending', 'pending_approval', 'pending_admin_approval', 'awaiting_verification', 'payment_pending', 'payment_pending_approval', 'payment_pending_admin_verification'].includes(currentStatus);

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
                    direction: isRTL ? 'rtl' : 'ltr',
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

    return <>{children}</>;
};

export default ProtectedRoute;
