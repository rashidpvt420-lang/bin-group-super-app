import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({ children, adminOnly = false }) => {
    const { isAuthenticated, user, loading } = useAuth();

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>Loading Auth...</Box>;
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    // AuthContext already computes isAdmin from ADMIN_ROLES (claims + profile + founder
    // bootstrap), deliberately excluding STAFF_ROLES (hr_manager, hr_staff, etc). Trust it
    // instead of re-deriving admin status from a second, independent role list here — a prior
    // local copy of that list incorrectly included two staff roles, granting them access to
    // every adminOnly route (financials, payroll, payment approvals, audit log, settings).
    const hasAdminAccess = user?.isAdmin === true || user?.claims?.admin === true;

    if (adminOnly && !hasAdminAccess) {
        console.warn(`[SECURITY] Unauthorized role attempt: ${user?.role}. Redirecting.`);
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
