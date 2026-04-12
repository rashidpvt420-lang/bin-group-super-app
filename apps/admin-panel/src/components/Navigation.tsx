import { NavLink } from 'react-router-dom';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Divider, Box, Typography, alpha } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import RadarIcon from '@mui/icons-material/Radar';
import { binThemeTokens } from '../theme/adminTheme';

const Navigation = () => {
    const primaryMenu = [
        { text: 'DASHBOARD', icon: <DashboardIcon />, path: '/dashboard' },
        { text: 'INTAKE VAULT', icon: <SecurityIcon />, path: '/admin/vault', color: binThemeTokens.gold },
        { text: 'PAYMENT APPROVALS', icon: <PendingActionsIcon />, path: '/admin/manual-approvals', color: '#10b981' },
    ];

    const managementMenu = [
        { text: 'Live Operations', icon: <RadarIcon />, path: '/admin/live-ops' },
        { text: 'Owners', icon: <PeopleIcon />, path: '/owners' },
        { text: 'Brokers', icon: <PeopleIcon />, path: '/broker' },
        { text: 'Tenants', icon: <PeopleIcon />, path: '/tenants' },
        { text: 'Technicians', icon: <PeopleIcon />, path: '/technicians' },
        { text: 'Tickets', icon: <ReceiptIcon />, path: '/tickets' },
    ];

    const systemMenu = [
        { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
    ];

    return (
        <Drawer
            variant="permanent"
            sx={{
                width: 280,
                flexShrink: 0,
                '& .MuiDrawer-paper': { 
                    width: 280, 
                    boxSizing: 'border-box',
                    bgcolor: '#020617',
                    borderRight: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                },
            }}
        >
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 900, color: binThemeTokens.gold, letterSpacing: 2 }}>
                    BIN GROUP
                </Typography>
                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 4 }}>
                    ADMINISTRY
                </Typography>
            </Box>
            
            <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.1) }} />
            
            <List sx={{ px: 2, pt: 2 }}>
                <Typography variant="overline" sx={{ px: 2, color: binThemeTokens.textTertiary, fontWeight: 900 }}>SOVEREIGN CORE</Typography>
                {primaryMenu.map((item) => (
                    <ListItem 
                        key={item.text} 
                        component={NavLink} 
                        to={item.path} 
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold } }
                        }}
                    >
                        <ListItemIcon sx={{ color: item.color || binThemeTokens.textSecondary, minWidth: 40 }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} />
                    </ListItem>
                ))}
            </List>

            <List sx={{ px: 2 }}>
                <Typography variant="overline" sx={{ px: 2, color: binThemeTokens.textTertiary, fontWeight: 900 }}>OPERATIONS</Typography>
                {managementMenu.map((item) => (
                    <ListItem 
                        key={item.text} 
                        component={NavLink} 
                        to={item.path}
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold } }
                        }}
                    >
                        <ListItemIcon sx={{ color: binThemeTokens.textSecondary, minWidth: 40 }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} />
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
                            sx={{ borderRadius: 2 }}
                        >
                            <ListItemIcon sx={{ color: binThemeTokens.textSecondary, minWidth: 40 }}>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} />
                        </ListItem>
                    ))}
                    <ListItem
                        component="a"
                        href="http://localhost:3001"
                        target="_blank"
                        sx={{ borderRadius: 2, mt: 1, bgcolor: alpha('#10b981', 0.05) }}
                    >
                        <ListItemIcon sx={{ color: '#10b981', minWidth: 40 }}><PeopleIcon /></ListItemIcon>
                        <ListItemText primary="Owner Portal ↗" primaryTypographyProps={{ fontWeight: 900, fontSize: '0.85rem', color: '#10b981' }} />
                    </ListItem>
                </List>
            </Box>
        </Drawer>
    );
};

export default Navigation;
