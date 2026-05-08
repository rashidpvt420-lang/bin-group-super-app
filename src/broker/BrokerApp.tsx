import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box, Container, AppBar, Toolbar, Typography, IconButton, Breadcrumbs, Link as MuiLink, alpha, Avatar, Tooltip, Divider } from '@mui/material';
import { ArrowLeft, Home, Bell, Globe, Briefcase, ChevronRight, Users, Building, Wallet, FileUp } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';

import BrokerDashboardPage from './pages/BrokerDashboardPage';
import BrokerLeadsPage from './pages/BrokerLeadsPage';
import BrokerReferralsPage from './pages/BrokerReferralsPage';
import BrokerCommissionsPage from './pages/BrokerCommissionsPage';
import BrokerDocumentsPage from './pages/BrokerDocumentsPage';
import BrokerProfilePage from './pages/BrokerProfilePage';

const BrokerLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useRole();
    const { toggleLanguage, isRTL, language, t } = useLanguage();

    const menuItems = [
        { label: 'DASHBOARD', path: '/broker/dashboard', icon: <Home size={18} /> },
        { label: 'LEADS', path: '/broker/leads', icon: <Users size={18} /> },
        { label: 'REFERRALS', path: '/broker/referrals', icon: <Building size={18} /> },
        { label: 'COMMISSIONS', path: '/broker/commissions', icon: <Wallet size={18} /> },
        { label: 'DOCUMENTS', path: '/broker/documents', icon: <FileUp size={18} /> },
    ];

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflow: 'hidden' }}>
            {/* Background Gradient Orbs */}
            <Box sx={{ position: 'fixed', top: '-10%', left: '-5%', width: '40vw', height: '40vw', borderRadius: '50%', background: `radial-gradient(circle, ${alpha(binThemeTokens.gold, 0.05)} 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />
            <Box sx={{ position: 'fixed', bottom: '-10%', right: '-5%', width: '40vw', height: '40vw', borderRadius: '50%', background: `radial-gradient(circle, ${alpha('#3b82f6', 0.05)} 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />

            <AppBar 
                position="sticky" 
                sx={{ 
                    bgcolor: 'rgba(2, 6, 23, 0.7)', 
                    backdropFilter: 'blur(30px)', 
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    px: { xs: 1, md: 4 },
                    zIndex: 1100
                }} 
                elevation={0}
            >
                <Toolbar sx={{ justifyContent: 'space-between', px: 0, height: 80 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Typography 
                            variant="h5" 
                            fontWeight="950" 
                            onClick={() => navigate('/broker')}
                            sx={{ 
                                cursor: 'pointer',
                                color: binThemeTokens.gold, 
                                textTransform: 'uppercase', 
                                letterSpacing: 4,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                                fontSize: { xs: '1rem', md: '1.4rem' }
                            }}
                        >
                            <Box sx={{ p: 1, bgcolor: binThemeTokens.gold, borderRadius: 2, color: '#000', display: 'flex' }}>
                                <Briefcase size={20} />
                            </Box>
                            BIN <Typography component="span" variant="inherit" sx={{ display: { xs: 'none', sm: 'inline' } }}>SOVEREIGN</Typography>
                        </Typography>

                        <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', lg: 'flex' } }}>
                            {menuItems.map((item) => {
                                const isActive = location.pathname.startsWith(item.path);
                                return (
                                    <Button
                                        key={item.path}
                                        onClick={() => navigate(item.path)}
                                        startIcon={item.icon}
                                        sx={{
                                            color: isActive ? binThemeTokens.gold : 'rgba(255,255,255,0.5)',
                                            fontWeight: 900,
                                            fontSize: '0.75rem',
                                            letterSpacing: 1,
                                            px: 2,
                                            py: 1,
                                            borderRadius: 2,
                                            bgcolor: isActive ? alpha(binThemeTokens.gold, 0.05) : 'transparent',
                                            '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }
                                        }}
                                    >
                                        {item.label}
                                    </Button>
                                );
                            })}
                        </Stack>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 } }}>
                        <IconButton 
                            onClick={toggleLanguage} 
                            sx={{ 
                                color: binThemeTokens.gold, 
                                bgcolor: alpha(binThemeTokens.gold, 0.05), 
                                borderRadius: 3, 
                                px: 2,
                                border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                                '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1) }
                            }}
                        >
                            <Globe size={18} />
                            <Typography variant="caption" sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, fontWeight: 950 }}>
                                {language === 'en' ? 'AR' : 'EN'}
                            </Typography>
                        </IconButton>
                        
                        <Tooltip title="Notifications">
                            <IconButton sx={{ color: 'rgba(255,255,255,0.4)', bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}>
                                <Bell size={20} />
                            </IconButton>
                        </Tooltip>

                        <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 1 }} />

                        <Box 
                            onClick={() => navigate('/broker/profile')}
                            sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 2, 
                                cursor: 'pointer',
                                p: 0.5,
                                pr: 2,
                                borderRadius: 4,
                                transition: 'all 0.3s ease',
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                            }}
                        >
                            <Avatar 
                                sx={{ 
                                    width: 40, 
                                    height: 40, 
                                    bgcolor: alpha(binThemeTokens.gold, 0.1), 
                                    border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, 
                                    color: binThemeTokens.gold,
                                    fontSize: '1rem',
                                    fontWeight: 950
                                }}
                            >
                                {user?.displayName?.charAt(0) || 'B'}
                            </Avatar>
                            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                                <Typography variant="body2" fontWeight="950" color="#FFF">{user?.displayName?.split(' ')[0]}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mt: -0.5, fontSize: '0.65rem' }}>BROKER</Typography>
                            </Box>
                        </Box>
                        
                        <IconButton 
                            onClick={logout}
                            sx={{ color: '#ef4444', bgcolor: alpha('#ef4444', 0.05), borderRadius: 3, ml: 1 }}
                        >
                            <Box sx={{ transform: isRTL ? 'rotate(180deg)' : 'none' }}>
                                <ArrowLeft size={20} />
                            </Box>
                        </IconButton>
                    </Box>
                </Toolbar>
            </AppBar>
            
            <Container maxWidth="xl" sx={{ py: 6, position: 'relative', zIndex: 1 }}>
                <Box sx={{ animation: 'fadeIn 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                    {children}
                </Box>
            </Container>

            {/* Mobile Navigation Bar */}
            <Paper 
                sx={{ 
                    display: { xs: 'flex', lg: 'none' }, 
                    position: 'fixed', 
                    bottom: 0, 
                    left: 0, 
                    right: 0, 
                    bgcolor: 'rgba(2, 6, 23, 0.9)', 
                    backdropFilter: 'blur(20px)', 
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    zIndex: 1100,
                    justifyContent: 'space-around',
                    py: 1.5,
                    px: 1
                }}
                elevation={0}
            >
                {menuItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                        <IconButton 
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            sx={{ color: isActive ? binThemeTokens.gold : 'rgba(255,255,255,0.4)', flexDirection: 'column', gap: 0.5 }}
                        >
                            {item.icon}
                            <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 900 }}>{item.label}</Typography>
                        </IconButton>
                    );
                })}
            </Paper>
        </Box>
    );
};

export default function BrokerApp() {
    return (
        <BrokerLayout>
            <Routes>
                <Route path="/" element={<BrokerDashboardPage />} />
                <Route path="/dashboard" element={<BrokerDashboardPage />} />
                <Route path="/leads" element={<BrokerLeadsPage />} />
                <Route path="/referrals" element={<BrokerReferralsPage />} />
                <Route path="/commissions" element={<BrokerCommissionsPage />} />
                <Route path="/documents" element={<BrokerDocumentsPage />} />
                <Route path="/profile" element={<BrokerProfilePage />} />
            </Routes>
        </BrokerLayout>
    );
}
