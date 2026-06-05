import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import BinGroupHeader from './SovereignHeader';
import { NavigationControl } from './navigation/NavigationControl';
import { RoleProvider, useRole } from '../context/RoleContext';
import { AIProvider } from '../context/AIContext';
import { SovereignAIChat } from './SovereignAIChat';
import { SovereignAlertHandler } from './SovereignAlertHandler';

declare global {
  interface Window {
    __BIN_GROUPS_BOOT__?: {
      staticReady?: boolean;
      reactMounted?: boolean;
      authReady?: boolean;
      startedAt?: number;
      mountedAt?: number;
    };
  }
}

type AuthenticatedShellProps = {
  children: React.ReactNode;
  showChrome?: boolean;
  publicAuth?: boolean;
  loadingFallback?: React.ReactNode;
};

const ADMIN_STAFF_ROLES = [
  'admin',
  'super_admin',
  'ceo',
  'manager',
  'operations_admin',
  'finance_admin',
  'hr_admin',
  'support_admin',
  'hr_manager',
  'hr_staff',
  'finance_staff',
  'account_manager',
  'dispatcher',
  'operations_manager',
];

const ROLE_PORTAL_PREFIXES = ['/owner', '/tenant', '/technician', '/broker', '/admin'];

function PushNotificationBootstrap() {
  const { user, role } = useRole();

  React.useEffect(() => {
    let detach: undefined | (() => void);
    let cancelled = false;

    if (!user?.uid) return undefined;

    import('../services/pushNotificationService')
      .then(({ attachForegroundPushListener, registerPushNotifications, shouldRequestPushForRole }) => {
        if (cancelled || !shouldRequestPushForRole(role)) return;

        registerPushNotifications(user.uid, role)
          .then((result) => {
            if (!result.enabled) {
              const reason = 'reason' in result ? result.reason : 'unknown';
              console.warn('[Push] Registration skipped:', reason);
            }
          })
          .catch((error) => console.warn('[Push] Registration failed:', error));

        attachForegroundPushListener().then((unsubscribe) => {
          if (cancelled && typeof unsubscribe === 'function') unsubscribe();
          else detach = typeof unsubscribe === 'function' ? unsubscribe : undefined;
        });
      })
      .catch((error) => console.warn('[Push] Bootstrap import failed:', error));

    return () => {
      cancelled = true;
      if (detach) detach();
    };
  }, [user?.uid, role]);

  return null;
}

function AuthenticatedShellContent({ children, showChrome = true, publicAuth = false, loadingFallback }: AuthenticatedShellProps) {
  const { loading: roleLoading, error: roleError, user, role } = useRole();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isRolePortalRoute = ROLE_PORTAL_PREFIXES.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
  const shouldRenderGlobalHeader = showChrome && !isRolePortalRoute;
  const shouldRenderFloatingNavigation = showChrome && !isRolePortalRoute && !isAdminRoute;

  if (roleLoading && !publicAuth) {
    return <>{loadingFallback}</>;
  }

  if (roleError && !user && !publicAuth) {
    return (
      <Box sx={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#FFFFFF', p: 4, textAlign: 'center', overflowY: 'auto' }}>
        <Typography variant="h4" sx={{ color: '#ef4444', fontWeight: 900, mb: 2 }}>IDENTITY FAULT</Typography>
        <Typography variant="body1" sx={{ color: '#667085', mb: 4, maxWidth: 600 }}>
          Role Authorization Error: {roleError}
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#C9A646', color: '#111827', fontWeight: 900 }}>RELOAD SYSTEM</Button>
      </Box>
    );
  }

  const isAuthEntryPage = location.pathname === '/' || location.pathname === '/login' || location.pathname === '/gateway';
  if (user && !roleLoading && isAuthEntryPage) {
    const normalizedRole = (role || '').toLowerCase();
    if (normalizedRole === 'tenant') return <Navigate to="/tenant/dashboard" replace />;
    if (normalizedRole === 'technician') return <Navigate to="/technician/dashboard" replace />;
    if (normalizedRole === 'broker') return <Navigate to="/broker/dashboard" replace />;
    if (ADMIN_STAFF_ROLES.includes(normalizedRole)) return <Navigate to="/admin/dashboard" replace />;
    if (normalizedRole === 'owner') return <Navigate to="/owner/dashboard" replace />;
  }

  return (
    <>
      <PushNotificationBootstrap />
      {shouldRenderGlobalHeader && <BinGroupHeader />}
      {children}
      {showChrome && !isAdminRoute && ['owner', 'tenant'].includes((role || '').toLowerCase()) && (
        <SovereignAIChat role={(role || 'unknown').toLowerCase() as any} onNavigate={navigate} />
      )}
      {shouldRenderFloatingNavigation && <NavigationControl />}
      <SovereignAlertHandler />
    </>
  );
}

export default function AuthenticatedShell(props: AuthenticatedShellProps) {
  return (
    <RoleProvider>
      <AIProvider>
        <AuthenticatedShellContent {...props} />
      </AIProvider>
    </RoleProvider>
  );
}
