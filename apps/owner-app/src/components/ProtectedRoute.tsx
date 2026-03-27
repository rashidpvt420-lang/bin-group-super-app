import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { Box, Typography, CircularProgress } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { user, role, isAdmin, godMode, loading } = useRole();
    const location = useLocation();

    if (loading) {
        return (
            <Box sx={{ 
                height: '100vh', 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center',
                bgcolor: 'background.default',
                color: 'primary.main'
            }}>
                <CircularProgress color="inherit" />
                <Typography sx={{ mt: 2, fontWeight: 900, letterSpacing: 2 }}>
                    AUTHENTICATING SECURE ACCESS...
                </Typography>
            </Box>
        );
    }

    if (!user) {
        // Redirect to login if not authenticated
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Auth logic: Check if role is allowed OR if user has God Mode / Admin override
    const isAccessAllowed = !allowedRoles || (role && allowedRoles.includes(role.toLowerCase())) || godMode || isAdmin;

    if (!isAccessAllowed) {
        // Branded Access Denied fallback
        return (
            <Box sx={{ 
                height: '100vh', 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center',
                bgcolor: 'background.default',
                color: 'text.primary',
                textAlign: 'center',
                p: 4
            }}>
                <Typography variant="h2" sx={{ color: '#ff4d4d', fontWeight: 900, mb: 2 }}>
                    ACCESS PRIVILEGE VIOLATION
                </Typography>
                <Typography variant="h5" sx={{ color: 'primary.main', mb: 4 }}>
                    Your account role ({(role || 'unknown').toUpperCase()}) does not have permission to view this portal.
                </Typography>
                <Box 
                    component="img" 
                    src="/logo.png" 
                    sx={{ width: 120, mb: 4, filter: 'grayscale(1) brightness(2)' }} 
                    onError={(e: any) => e.target.style.display = 'none'}
                />
                <Navigate to="/" replace />
            </Box>
        );
    }

    return <>{children}</>;
};

export default ProtectedRoute;
