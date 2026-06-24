import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean; extraRoles?: string[] }> = ({ children, adminOnly = false, extraRoles = [] }) => {
    const { isAuthenticated, user, loading } = useAuth();
    const adminRoles = new Set([
        'admin',
        'super_admin',
        'ceo',
        'manager',
        'operations_admin',
        'finance_admin',
        'hr_admin',
        'hr_manager',
        'hr_staff',
        'support_admin',
        ...extraRoles,
    ]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>Loading Auth...</Box>;
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    const hasAdminAccess = user?.claims?.admin === true || user?.isAdmin === true || adminRoles.has(user?.role);

    if (adminOnly && !hasAdminAccess) {
        console.warn(`[SECURITY] Unauthorized role attempt: ${user?.role}. Redirecting.`);
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
