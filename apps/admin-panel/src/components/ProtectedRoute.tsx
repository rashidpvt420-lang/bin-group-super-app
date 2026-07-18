import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from '../context/AuthContext';

type Props = {
    children: React.ReactNode;
    adminOnly?: boolean;
    extraRoles?: string[];
};

const ProtectedRoute: React.FC<Props> = ({
    children,
    adminOnly = false,
    extraRoles = [],
}) => {
    const location = useLocation();
    const {
        isAuthenticated,
        user,
        loading,
        mfaEnrollmentRequired,
        mfaVerified,
        mfaFactorCount,
    } = useAuth();
    const adminRoles = new Set([
        'admin',
        'super_admin',
        'ceo',
        'manager',
        'operations_admin',
        'finance_admin',
        'hr_admin',
        'support_admin',
        ...extraRoles,
    ]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>Loading Auth...</Box>;
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    const isMfaEnrollmentRoute = location.pathname === '/profile';
    if (mfaEnrollmentRequired && !isMfaEnrollmentRoute) {
        return <Navigate to="/profile?mfa=enroll" replace />;
    }
    if (mfaFactorCount > 0 && !mfaVerified) {
        return <Navigate to="/login?mfa=required" replace />;
    }

    const hasAdminAccess = user?.claims?.admin === true || user?.isAdmin === true || adminRoles.has(user?.role);

    if (adminOnly && !hasAdminAccess) {
        console.warn(`[SECURITY] Unauthorized role attempt: ${user?.role}. Redirecting.`);
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
