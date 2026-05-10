import React, { useEffect, useState } from 'react';
import { Box, IconButton, Tooltip, Breadcrumbs, Link, Typography, Stack, alpha } from '@mui/material';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, LayoutDashboard, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../admin/theme/adminTheme';

export const NavigationControl: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { role } = useRole();
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            const scrollTop = window.scrollY;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;
            
            setShowScrollTop(scrollTop > 100);
            setShowScrollBottom(scrollTop + clientHeight < scrollHeight - 100);
        };

        window.addEventListener('scroll', handleScroll);
        // Initial check
        setTimeout(handleScroll, 100);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [location.pathname]);

    const getDashboardRoute = () => {
        const r = (role || '').toLowerCase();
        if (r === 'admin') return '/admin';
        if (r === 'tenant') return '/tenant';
        if (r === 'technician') return '/technician';
        if (r === 'broker') return '/broker';
        if (r === 'owner' || r === 'ceo') return '/owner/dashboard';
        return '/';
    };

    const handleBack = () => {
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            navigate(getDashboardRoute());
        }
    };

    const handleForward = () => {
        navigate(1);
    };

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const scrollToBottom = () => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    };

    // Generate basic breadcrumbs from path
    const pathSegments = location.pathname.split('/').filter(Boolean);
    
    // Don't show floating navigation on public landing pages or login unless specifically needed
    const isPublic = location.pathname === '/' || location.pathname === '/login' || location.pathname === '/gateway';
    if (isPublic) return null;

    return (
        <Box 
            sx={{
                position: 'fixed',
                bottom: { xs: 80, sm: 24 }, // higher on mobile to avoid bottom nav if any
                right: { xs: 16, sm: 24 },
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                zIndex: 9999,
                pointerEvents: 'none' // allow clicking through empty space
            }}
        >
            <Stack 
                direction="column" 
                spacing={1} 
                sx={{ 
                    pointerEvents: 'auto',
                    '& > button': {
                        bgcolor: alpha('#020617', 0.8),
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.7)',
                        '&:hover': {
                            bgcolor: alpha(binThemeTokens.gold, 0.2),
                            color: binThemeTokens.gold,
                            borderColor: alpha(binThemeTokens.gold, 0.5)
                        }
                    }
                }}
            >
                {showScrollTop && (
                    <Tooltip title="Scroll to Top" placement="left">
                        <IconButton size="small" onClick={scrollToTop}>
                            <ArrowUp size={18} />
                        </IconButton>
                    </Tooltip>
                )}
                
                <Tooltip title="Go Back" placement="left">
                    <IconButton size="small" onClick={handleBack}>
                        <ArrowLeft size={18} />
                    </IconButton>
                </Tooltip>

                <Tooltip title="Dashboard" placement="left">
                    <IconButton size="small" onClick={() => navigate(getDashboardRoute())}>
                        <LayoutDashboard size={18} />
                    </IconButton>
                </Tooltip>

                {window.history.length > 2 && (
                    <Tooltip title="Go Forward" placement="left">
                        <IconButton size="small" onClick={handleForward}>
                            <ArrowRight size={18} />
                        </IconButton>
                    </Tooltip>
                )}

                {showScrollBottom && (
                    <Tooltip title="Scroll to Bottom" placement="left">
                        <IconButton size="small" onClick={scrollToBottom}>
                            <ArrowDown size={18} />
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>
        </Box>
    );
};
