import { NavLink } from 'react-router-dom';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Divider, Box, Typography, alpha } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
// import RadarIcon from '@mui/icons-material/Radar';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LogoutIcon from '@mui/icons-material/Logout';
import { binThemeTokens } from '../theme/adminTheme';
import { useLanguage } from '@bin/shared';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

const Navigation = () => {
    const { t, isRTL } = useLanguage();

    const primaryMenu = [
        { text: t('nav.dashboard'), icon: <DashboardIcon />, path: '/dashboard' },
        { text: t('nav.financials'), icon: <AccountBalanceWalletIcon />, path: '/admin/financials', color: binThemeTokens.gold },
        { text: t('nav.audit'), icon: <SecurityIcon />, path: '/admin/vault', color: binThemeTokens.gold },
        { text: t('onboarding.payment.verify_btn'), icon: <PendingActionsIcon />, path: '/admin/manual-approvals', color: '#10b981' },
    ];

    const managementMenu = [
        { text: "Onboard Asset", icon: <PeopleIcon />, path: '/admin/onboard-property' },
        { text: t('admin.active_tenants'), icon: <PeopleIcon />, path: '/owners' },
        { text: t('nav.brokers'), icon: <PeopleIcon />, path: '/broker' },
        { text: t('nav.tenants'), icon: <PeopleIcon />, path: '/tenants' },
        { text: t('nav.technicians'), icon: <PeopleIcon />, path: '/technicians' },
        { text: t('nav.tickets'), icon: <ReceiptIcon />, path: '/tickets' },
    ];

    const systemMenu = [
        { text: t('nav.support'), icon: <SettingsIcon />, path: '/settings' },
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
                        href="mailto:hq@bin-groups.com"
                        target="_blank"
                        sx={{ borderRadius: 2, mt: 1, bgcolor: alpha('#DAA520', 0.05), textAlign: isRTL ? 'right' : 'left', flexDirection: isRTL ? 'row-reverse' : 'row' }}
                    >
                        <ListItemIcon sx={{ color: '#DAA520', minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><SecurityIcon /></ListItemIcon>
                        <ListItemText primary={t('nav.support')} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.85rem', color: '#DAA520' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
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
