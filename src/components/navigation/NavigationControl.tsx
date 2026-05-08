import React, { useEffect, useState } from 'react';
import { Box, IconButton, Tooltip, Breadcrumbs, Typography, Stack, alpha, useTheme, useMediaQuery } from '@mui/material';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, LayoutDashboard, ChevronRight, ChevronLeft } from 'lucide-react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export const NavigationControl: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { role } = useRole();
    const { isRTL, t } = useLanguage();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            const scrollTop = window.scrollY;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;
            
            setShowScrollTop(scrollTop > 200);
            setShowScrollBottom(scrollTop + clientHeight < scrollHeight - 200);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll(); // Initial check
        return () => window.removeEventListener('scroll', handleScroll);
    }, [location.pathname]);

    const getDashboardRoute = () => {
        const r = (role || '').toLowerCase();
        if (r === 'admin') return '/admin/dashboard';
        if (r === 'tenant') return '/tenant';
        if (r === 'technician') return '/technician';
        if (r === 'broker') return '/broker';
        if (r === 'owner' || r === 'ceo') return '/owner-dashboard';
        return '/';
    };

    const handleBack = () => {
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            navigate(getDashboardRoute());
        }
    };

    const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    const scrollToBottom = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });

    // Generate breadcrumbs
    const pathSegments = location.pathname.split('/').filter(Boolean);
    
    const isPublic = location.pathname === '/' || location.pathname === '/login' || location.pathname === '/gateway';
    if (isPublic) return null;

    return (
        <>
            {/* Floating Navigation Controls */}
            <Box 
                sx={{
                    position: 'fixed',
                    bottom: { xs: 20, sm: 30 },
                    right: isRTL ? 'auto' : { xs: 16, sm: 30 },
                    left: isRTL ? { xs: 16, sm: 30 } : 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                    zIndex: 1300,
                    pointerEvents: 'none'
                }}
            >
                <Stack 
                    direction="column" 
                    spacing={1.5} 
                    sx={{ 
                        pointerEvents: 'auto',
                        '& > button': {
                            bgcolor: alpha('#020617', 0.9),
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.8)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            '&:hover': {
                                bgcolor: alpha(binThemeTokens.gold, 0.2),
                                color: binThemeTokens.gold,
                                borderColor: alpha(binThemeTokens.gold, 0.5),
                                transform: 'scale(1.1) translateY(-2px)'
                            },
                            '&:active': {
                                transform: 'scale(0.95)'
                            }
                        }
                    }}
                >
                    {showScrollTop && (
                        <Tooltip title={t('nav.scroll_top') || "Scroll to Top"} placement={isRTL ? "right" : "left"}>
                            <IconButton size="medium" onClick={scrollToTop}>
                                <ArrowUp size={20} />
                            </IconButton>
                        </Tooltip>
                    )}
                    
                    <Tooltip title={t('nav.back') || "Go Back"} placement={isRTL ? "right" : "left"}>
                        <IconButton size="medium" onClick={handleBack}>
                            {isRTL ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={t('nav.dashboard') || "Dashboard"} placement={isRTL ? "right" : "left"}>
                        <IconButton 
                            size="medium" 
                            onClick={() => navigate(getDashboardRoute())}
                            sx={{ color: `${binThemeTokens.gold} !important`, borderColor: `${alpha(binThemeTokens.gold, 0.3)} !important` }}
                        >
                            <LayoutDashboard size={20} />
                        </IconButton>
                    </Tooltip>

                    {showScrollBottom && (
                        <Tooltip title={t('nav.scroll_bottom') || "Scroll to Bottom"} placement={isRTL ? "right" : "left"}>
                            <IconButton size="medium" onClick={scrollToBottom}>
                                <ArrowDown size={20} />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>
            </Box>

            {/* Mobile Breadcrumb Overlay (Optional/Contextual) */}
            {isMobile && pathSegments.length > 1 && (
                <Box sx={{
                    position: 'fixed',
                    top: 70,
                    left: 0,
                    right: 0,
                    px: 2,
                    py: 1,
                    bgcolor: alpha('#000', 0.6),
                    backdropFilter: 'blur(8px)',
                    zIndex: 1100,
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                }}>
                    <Breadcrumbs 
                        separator={isRTL ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                        sx={{ 
                            '& .MuiBreadcrumbs-li': { color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 700 },
                            '& .MuiBreadcrumbs-separator': { color: 'rgba(255,255,255,0.2)' }
                        }}
                    >
                        {pathSegments.map((segment, index) => {
                            const isLast = index === pathSegments.length - 1;
                            const path = `/${pathSegments.slice(0, index + 1).join('/')}`;
                            return isLast ? (
                                <Typography key={path} variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                                    {segment.toUpperCase()}
                                </Typography>
                            ) : (
                                <Typography key={path} variant="caption">
                                    {segment.toUpperCase()}
                                </Typography>
                            );
                        })}
                    </Breadcrumbs>
                </Box>
            )}
        </>
    );
};
