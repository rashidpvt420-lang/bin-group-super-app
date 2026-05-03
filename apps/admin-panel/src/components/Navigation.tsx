import { NavLink } from 'react-router-dom';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Divider, Box, Typography, alpha } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LogoutIcon from '@mui/icons-material/Logout';
import FileTextIcon from '@mui/icons-material/Description';
import { Sparkles, Users } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';
import { useLanguage } from '@bin/shared';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import CeoContactButtons from './CeoContactButtons';

import { useAuth } from '../context/AuthContext';

const Navigation = () => {
    const { t, tx, isRTL } = useLanguage();
    const { user } = useAuth();
    
    const isHRAuthorized = user?.role === 'admin' || user?.role === 'ceo' || user?.role === 'hr_manager' || user?.role === 'hr_staff';

const primaryMenu = [
    { text: tx('nav.dashboard', 'Dashboard'), icon: <DashboardIcon />, path: '/dashboard' },
    { text: tx('fin.payroll', 'Payroll Hub'), icon: <AccountBalanceWalletIcon />, path: '/financials', color: '#6366f1' },
    { text: tx('nav.docs', 'Document Vault'), icon: <FileTextIcon />, path: '/document-vault', color: binThemeTokens.gold },
    { text: tx('nav.audit', 'Institutional Audit'), icon: <SecurityIcon />, path: '/vault', color: binThemeTokens.gold },
    { text: 'Design Studio Manager', icon: <Sparkles size={20} />, path: '/design-studio', color: binThemeTokens.gold },
    { text: tx('nav.orphans', 'Orphan War Room'), icon: <SecurityIcon />, path: '/orphans', color: '#ef4444' },
    { text: tx('onboarding.payment.verify_btn', 'Verify Payment'), icon: <PendingActionsIcon />, path: '/manual-approvals', color: '#10b981' },
    { text: 'Sovereign Control', icon: <SecurityIcon />, path: '/control-center', color: '#ef4444' },
    { text: 'Pricing Matrix 2026', icon: <AccountBalanceWalletIcon />, path: '/admin/pricing-matrix', color: binThemeTokens.gold },
];

    const managementMenu = [
        { text: tx('admin.active_tenants', 'ACTIVE TENANTS'), icon: <PeopleIcon />, path: '/owners' },
        { text: tx('nav.brokers', 'Brokers'), icon: <PeopleIcon />, path: '/broker' },
        { text: tx('nav.tenants', 'Tenants'), icon: <PeopleIcon />, path: '/tenants' },
        { text: tx('nav.property_passport', 'Property Passports'), icon: <SecurityIcon />, path: '/properties/passport', color: binThemeTokens.gold },
        { text: tx('nav.technicians', 'TECHNICIAN CORPS'), icon: <PeopleIcon />, path: '/technicians' },
        { text: "Duty Command Center", icon: <PendingActionsIcon />, path: '/ops/technicians', color: binThemeTokens.gold },
        { text: tx('nav.tickets', 'Mission Logs'), icon: <ReceiptIcon />, path: '/tickets' },
        { text: tx('nav.sos_feed', 'SOS Live Feed'), icon: <ReceiptIcon />, path: '/sos' },
        { text: tx('nav.audit_log', 'Systemic Audit Log'), icon: <SecurityIcon />, path: '/audit' },
        ...(isHRAuthorized ? [{ text: 'HR Command', icon: <Users size={20} />, path: '/hr', color: binThemeTokens.gold }] : []),
    ];

    const systemMenu = [
        { text: tx('nav.support', 'Support'), icon: <SettingsIcon />, path: '/settings' },
    ];

    return (
        <Drawer
            variant="permanent"
            anchor={isRTL ? 'right' : 'left'}
            sx={{
                width: 280,
                flexShrink: 0,
                '& .MuiDrawer-paper': { 
                    width: 280, 
                    boxSizing: 'border-box',
                    bgcolor: '#020617',
                    borderRight: isRTL ? 'none' : `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                    borderLeft: isRTL ? `1px solid ${alpha(binThemeTokens.gold, 0.1)}` : 'none',
                    right: isRTL ? 0 : 'auto',
                    left: isRTL ? 'auto' : 0
                },
            }}
        >
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 900, color: binThemeTokens.gold, letterSpacing: 2 }}>
                    BIN GROUP
                </Typography>
                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 4 }}>
                    {t('nav.administry')}
                </Typography>
            </Box>
            
            <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.1) }} />
            
            <List sx={{ px: 2, pt: 2 }}>
                <Typography variant="overline" sx={{ px: 2, color: binThemeTokens.textTertiary, fontWeight: 900, textAlign: isRTL ? 'right' : 'left', display: 'block' }}>
                    {t('nav.sovereign_core')}
                </Typography>
                {primaryMenu.map((item) => (
                    <ListItem 
                        key={item.text} 
                        component={NavLink} 
                        to={item.path} 
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                            textAlign: isRTL ? 'right' : 'left',
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold } }
                        }}
                    >
                        <ListItemIcon sx={{ color: item.color || binThemeTokens.textSecondary, minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                ))}
            </List>

            <List sx={{ px: 2 }}>
                <Typography variant="overline" sx={{ px: 2, color: binThemeTokens.textTertiary, fontWeight: 900, textAlign: isRTL ? 'right' : 'left', display: 'block' }}>
                    {t('nav.operations')}
                </Typography>
                {managementMenu.map((item) => (
                    <ListItem 
                        key={item.text} 
                        component={NavLink} 
                        to={item.path}
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                            textAlign: isRTL ? 'right' : 'left',
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold } }
                        }}
                    >
                        <ListItemIcon sx={{ color: binThemeTokens.textSecondary, minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                ))}
            </List>

            <Box sx={{ mt: 'auto', p: 2 }}>
                <List>
                    {systemMenu.map((item) => (
                        <ListItem 
                            key={item.text} 
                            component={NavLink} 
                            to={item.path}
                            sx={{ borderRadius: 2, textAlign: isRTL ? 'right' : 'left', flexDirection: isRTL ? 'row-reverse' : 'row' }}
                        >
                            <ListItemIcon sx={{ color: binThemeTokens.textSecondary, minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                        </ListItem>
                    ))}
                    <ListItem
                        component="a"
                        href="mailto:Ceo@bin-groups.com"
                        target="_blank"
                        sx={{ borderRadius: 2, mt: 1, bgcolor: alpha('#DAA520', 0.05), textAlign: isRTL ? 'right' : 'left', flexDirection: isRTL ? 'row-reverse' : 'row' }}
                    >
                        <ListItemIcon sx={{ color: '#DAA520', minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><SecurityIcon /></ListItemIcon>
                        <ListItemText primary={t('nav.support')} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.85rem', color: '#DAA520' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                    <Box sx={{ mt: 2, mb: 1, px: 2 }}>
                        <CeoContactButtons compact />
                    </Box>
                    <ListItem
                        component="a"
                        href="https://bin-groups.com"
                        target="_blank"
                        sx={{ borderRadius: 2, mt: 1, bgcolor: alpha('#10b981', 0.05), textAlign: isRTL ? 'right' : 'left', flexDirection: isRTL ? 'row-reverse' : 'row' }}
                    >
                        <ListItemIcon sx={{ color: '#10b981', minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><PeopleIcon /></ListItemIcon>
                        <ListItemText primary={t('nav.owner_portal_link')} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.85rem', color: '#10b981' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                    <ListItem
                        button
                        onClick={() => { localStorage.clear(); signOut(auth).then(() => window.location.href = '/'); }}
                        sx={{ borderRadius: 2, mt: 4, bgcolor: alpha('#ef4444', 0.1), textAlign: isRTL ? 'right' : 'left', flexDirection: isRTL ? 'row-reverse' : 'row', '&:hover': { bgcolor: alpha('#ef4444', 0.2) } }}
                    >
                        <ListItemIcon sx={{ color: '#ef4444', minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><LogoutIcon /></ListItemIcon>
                        <ListItemText primary={t('nav.logout') || 'Sign Out'} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.85rem', color: '#ef4444' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                </List>
            </Box>
        </Drawer>
    );
};

export default Navigation;
