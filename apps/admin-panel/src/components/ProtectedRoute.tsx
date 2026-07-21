import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { canAccessAdminPath } from '../security/staffAccessPolicy';

type Props = {
    children: React.ReactNode;
    adminOnly?: boolean;
    extraRoles?: string[];
};

const ProtectedRoute: React.FC<Props> = ({ children }) => {
    const location = useLocation();
    const {
        isAuthenticated,
        user,
        loading,
        mfaEnrollmentRequired,
        mfaVerified,
        mfaFactorCount,
    } = useAuth();

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>Loading Auth...</Box>;
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    const isMfaEnrollmentRoute = location.pathname === '/profile';
    if (mfaEnrollmentRequired && !isMfaEnrollmentRoute) {
        return <Navigate to="/profile?mfa=enroll" replace />;
    }
    if (mfaFactorCount > 0 && !mfaVerified) {
        return <Navigate to="/login?mfa=required" replace />;
    }

    if (!canAccessAdminPath(user, location.pathname)) {
        console.warn(`[SECURITY] Module access denied for role ${user?.role || 'unknown'} at ${location.pathname}.`);
        return <Navigate to="/profile?access=denied" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
