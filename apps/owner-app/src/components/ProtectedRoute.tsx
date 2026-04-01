import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { Box, Typography, CircularProgress, Button, Stack } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';
import { ShieldAlert, Lock, LogOut } from 'lucide-react';
import { auth } from '../lib/firebase';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { user, role, status, isAdmin, loading } = useRole();
    const location = useLocation();

    if (loading) {
        return (
            <Box sx={{ 
                height: '100vh', 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center',
                bgcolor: '#000',
                color: binThemeTokens.gold
            }}>
                <CircularProgress color="inherit" />
                <Typography sx={{ mt: 2, fontWeight: 900, letterSpacing: 2 }}>
                    AUTHENTICATING SECURE ACCESS...
                </Typography>
            </Box>
        );
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // [SOVEREIGN ENFORCEMENT] Lock account if status is pending
    // Bypass lock for admins
    const currentStatus = (status || '').toLowerCase();
    if ((currentStatus === 'pending' || currentStatus === 'pending_approval') && !isAdmin && role === 'owner') {
        // If they are in onboarding, let them continue?
        // Actually, if they haven't finished onboarding, status is 'pending' in users collection.
        // But once they finish and pay, status is still 'pending' until admin verifies.
        // So we should only lock them out of the DASHBOARD, but allow ONBOARDING.
        
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

                    <Box sx={{ mt: 8, opacity: 0.3 }}>
                        <Box component="img" src="/logo.png" sx={{ width: 80, filter: 'grayscale(1)' }} />
                    </Box>
                </Box>
            );
        }
    }

    const normalizedRole = (role || '').toLowerCase();
    const isAccessAllowed = !allowedRoles || 
        (role && (
            allowedRoles.includes(normalizedRole) || 
            (normalizedRole === 'ceo' && allowedRoles.includes('owner'))
        )) || 
        isAdmin;

    if (!isAccessAllowed) {
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
                p: 4
            }}>
                <ShieldAlert size={80} color="#ff4d4d" style={{ marginBottom: 24 }} />
                <Typography variant="h2" sx={{ color: '#ff4d4d', fontWeight: 900, mb: 2 }}>
                    ACCESS VIOLATION
                </Typography>
                <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.7)', mb: 4, fontWeight: 700 }}>
                    Your account role ({(role || 'unknown').toUpperCase()}) does not have permission to view this sector.
                </Typography>
                <Button 
                    variant="contained" 
                    onClick={() => window.location.href = '/'}
                    sx={{ bgcolor: '#ff4d4d', color: '#fff', fontWeight: 900, px: 6, py: 1.5 }}
                >
                    RETURN TO TERMINAL
                </Button>
            </Box>
        );
    }

    return <>{children}</>;
};

export default ProtectedRoute;
