import React from 'react';
import { alpha } from '@mui/material/styles';
import { NavLink } from 'react-router-dom';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Divider, Box, Typography, useMediaQuery } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SecurityIcon from '@mui/icons-material/Security';
import FileTextIcon from '@mui/icons-material/Description';
import LogoutIcon from '@mui/icons-material/Logout';
import { Users, Zap, Shield, Activity, DollarSign, LayoutDashboard, Cpu, Building2, FileSignature, Bot } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';
import { useLanguage } from '../../context/LanguageContext';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import CeoContactButtons from './CeoContactButtons';
import { useAuth } from '../context/AuthContext';

const Navigation = () => {
    const { tx, isRTL } = useLanguage();
    const { user } = useAuth();

    const compact = useMediaQuery('(max-width:1100px)');
    const drawerWidth = compact ? 88 : 280;
    
    const isHRAuthorized = user?.role === 'admin' || user?.role === 'ceo' || user?.role === 'hr_manager' || user?.role === 'hr_staff' || user?.role === 'finance_staff' || user?.role === 'account_manager' || user?.role === 'finance_admin' || user?.role === 'dispatcher' || user?.role === 'operations_manager';

    const primaryMenu = [
        { text: tx('nav.dashboard', 'Dashboard'), icon: <LayoutDashboard size={20} />, path: '/admin/dashboard' },
        { text: 'BIN-GPT Engineer™', icon: <Bot size={20} />, path: '/admin/bingpt-engineer', color: binThemeTokens.gold },
        { text: 'Admin AI Studio', icon: <Bot size={20} />, path: '/admin/ai-studio', color: binThemeTokens.gold },
        { text: 'Design Studio', icon: <Zap size={20} />, path: '/admin/design-studio', color: binThemeTokens.gold },
        { text: 'Smart Building Monitor', icon: <Cpu size={20} />, path: '/admin/smart-building', color: binThemeTokens.gold },
        { text: 'Sovereign Control', icon: <Shield size={20} />, path: '/admin/sovereign-control', color: binThemeTokens.gold },
        { text: tx('fin.title', 'Financials'), icon: <DollarSign size={20} />, path: '/admin/financials', color: binThemeTokens.gold },
        { text: 'Document OS™', icon: <FileSignature size={20} />, path: '/admin/document-os', color: binThemeTokens.gold },
        { text: tx('nav.docs', 'Document Vault'), icon: <FileTextIcon />, path: '/admin/document-vault', color: binThemeTokens.gold },
        { text: 'Company Identity', icon: <Building2 size={20} />, path: '/admin/company-profile', color: binThemeTokens.gold },
        { text: tx('nav.audit', 'Institutional Audit'), icon: <SecurityIcon />, path: '/admin/audit-shield', color: binThemeTokens.gold },
        { text: 'Pricing Matrix 2026', icon: <Zap size={20} />, path: '/admin/pricing', color: binThemeTokens.gold },
    ];

    const managementMenu = [
        { text: tx('nav.owners', 'Owner Registry'), icon: <PeopleIcon />, path: '/admin/owners' },
        { text: tx('nav.tenants', 'Tenant Registry'), icon: <PeopleIcon />, path: '/admin/tenants' },
        { text: tx('nav.technicians', 'Technician Corps'), icon: <Users size={20} />, path: '/admin/technicians' },
        { text: "Duty Command Center", icon: <Activity size={20} />, path: '/admin/duty-command', color: binThemeTokens.gold },
        { text: tx('nav.tickets', 'Maintenance Logs'), icon: <ReceiptIcon />, path: '/admin/tickets' },
        { text: 'HR Command', icon: <Users size={20} />, path: '/admin/hr', color: binThemeTokens.gold, hidden: !isHRAuthorized },
    ];

    return (
        <Drawer
            variant="permanent"
            anchor={isRTL ? 'right' : 'left'}
            sx={{
                width: drawerWidth,
                flexShrink: 0,
                transition: 'width 0.22s',
                '& .MuiDrawer-paper': { 
                    width: drawerWidth, 
                    boxSizing: 'border-box',
                    bgcolor: '#020617',
                    borderRight: isRTL ? 'none' : `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                    borderLeft: isRTL ? `1px solid ${alpha(binThemeTokens.gold, 0.1)}` : 'none',
                    overflowX: 'hidden',
                    transition: 'width 0.22s',
                },
            }}
        >
            <Box sx={{ p: compact ? 2 : 4, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 950, color: binThemeTokens.gold, letterSpacing: compact ? 0 : 2 }}>
                    {compact ? 'BG' : 'BIN GROUP'}
                </Typography>
                {!compact && (
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', letterSpacing: 4, fontWeight: 900 }}>
                        SOVEREIGN ADMIN
                    </Typography>
                )}
            </Box>
            
            <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.1) }} />
            
            <List sx={{ px: compact ? 1 : 2, pt: 2 }}>
                {!compact && (
                    <Typography variant="overline" sx={{ px: 2, color: 'rgba(255,255,255,0.2)', fontWeight: 950, letterSpacing: 1 }}>
                        COMMAND CORE
                    </Typography>
                )}
                {primaryMenu.map((item) => (
                    <ListItem 
                        key={item.text} 
                        component={NavLink} 
                        to={item.path} 
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            justifyContent: compact ? 'center' : 'flex-start',
                            px: compact ? 1.5 : 2,
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold }, '& .MuiListItemIcon-root': { color: binThemeTokens.gold } }
                        }}
                        title={compact ? item.text : undefined}
                    >
                        <ListItemIcon sx={{ color: item.color || 'rgba(255,255,255,0.4)', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}>{item.icon}</ListItemIcon>
                        {!compact && <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 800, fontSize: '0.8rem' }} />}
                    </ListItem>
                ))}
            </List>

            <List sx={{ px: compact ? 1 : 2, mt: 2 }}>
                {!compact && (
                    <Typography variant="overline" sx={{ px: 2, color: 'rgba(255,255,255,0.2)', fontWeight: 950, letterSpacing: 1 }}>
                        OPERATIONS
                    </Typography>
                )}
                {managementMenu.filter(i => !i.hidden).map((item) => (
                    <ListItem 
                        key={item.text} 
                        component={NavLink} 
                        to={item.path}
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            justifyContent: compact ? 'center' : 'flex-start',
                            px: compact ? 1.5 : 2,
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold }, '& .MuiListItemIcon-root': { color: binThemeTokens.gold } }
                        }}
                        title={compact ? item.text : undefined}
                    >
                        <ListItemIcon sx={{ color: item.color || 'rgba(255,255,255,0.4)', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}>{item.icon}</ListItemIcon>
                        {!compact && <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 800, fontSize: '0.8rem' }} />}
                    </ListItem>
                ))}
            </List>

            <Box sx={{ mt: 'auto', p: compact ? 1 : 2 }}>
                {!compact && <CeoContactButtons compact />}
                <ListItem
                    button
                    onClick={() => { 
                        const currentLang = localStorage.getItem('bin_language');
                        const activeOnboarding = localStorage.getItem('bin-group-onboarding-v3');
                        localStorage.clear(); 
                        if (currentLang) localStorage.setItem('bin_language', currentLang);
                        if (activeOnboarding) localStorage.setItem('bin-group-onboarding-v3', activeOnboarding);
                        signOut(auth).then(() => window.location.href = '/'); 
                    }}
                    sx={{ borderRadius: 2, mt: 2, bgcolor: alpha('#ef4444', 0.1), '&:hover': { bgcolor: alpha('#ef4444', 0.2) }, justifyContent: compact ? 'center' : 'flex-start', px: compact ? 1.5 : 2 }}
                    title={compact ? 'Secure Logout' : undefined}
                >
                    <ListItemIcon sx={{ color: '#ef4444', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}><LogoutIcon /></ListItemIcon>
                    {!compact && <ListItemText primary="SECURE LOGOUT" primaryTypographyProps={{ fontWeight: 900, fontSize: '0.75rem', color: '#ef4444' }} />}
                </ListItem>
            </Box>
        </Drawer>
    );
};

export default Navigation;
