import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { Box, Typography, CircularProgress, Button, Stack } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';
import { Lock, LogOut } from 'lucide-react';
import { auth } from '../lib/firebase';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { user, role, status, isAdmin, loading } = useRole();
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
    // If a user doesn't have the required role, bounce them to their specific portal
    if (allowedRoles && !allowedRoles.includes(normalizedRole) && !isAdmin) {
        if (normalizedRole === 'tenant') return <Navigate to="/tenant" replace />;
        if (normalizedRole === 'technician') return <Navigate to="/tech" replace />;
        if (normalizedRole === 'broker') return <Navigate to="/broker" replace />;
        return <Navigate to="/dashboard" replace />;
    }

    // 2. [OWNER LOCK PROTOCOL]
    // Only lock out owners who are pending or haven't paid. 
    // Tenants/Technicians bypass this as their status is managed differently.
    if (normalizedRole === 'owner' && (currentStatus === 'pending' || currentStatus === 'pending_approval') && !isAdmin) {
        if (!location.pathname.startsWith('/onboarding')) {
            const isPendingApproval = status === 'pending_approval';

            return (
                <Box sx={{ 
                    height: '100vh', 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center',
                    bgcolor: '#000',
                    color: '#fff',
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
                    <Typography variant="h3" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, letterSpacing: -1 }}>
                        {isPendingApproval ? 'OFFLINE SETTLEMENT RECORDED' : 'PROTOCOL LOCKED'}
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)', mb: 4, maxWidth: 600, fontWeight: 700 }}>
                        {isPendingApproval 
                            ? "Your payment method has been recorded. An admin will contact you shortly to collect payment and verify your account."
                            : "Your institutional profile is awaiting final administrative verification. Access to the sovereign dashboard will be granted once your activation settlement is confirmed."
                        }
                    </Typography>
                    
                    <Stack direction="row" spacing={2} sx={{ justifyContent: 'center' }}>
                        <Button 
                            variant="outlined" 
                            startIcon={<LogOut size={18} />}
                            onClick={() => auth.signOut()}
                            sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 800, px: 4 }}
                        >
                            SIGN OUT
                        </Button>
                        {!isPendingApproval && (
                            <Button 
                                variant="contained" 
                                href="/onboarding"
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 4, '&:hover': { bgcolor: '#b59410' } }}
                            >
                                RESUME ONBOARDING
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
