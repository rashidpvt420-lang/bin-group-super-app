// admin-panel/src/layout/AdminLayout.tsx
import React, { useState } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Avatar,
  Menu,
  MenuItem,
  Badge,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Map as MapIcon,
  People as PeopleIcon,
  Build as BuildIcon,
  BarChart as BarChartIcon,
  Warning as WarningIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Home as HomeIcon,
  AccountBalance as TreasuryIcon,
  History as AuditIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';

const DRAWER_WIDTH = 260;

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage: string;
}

export default function AdminLayout({ children, currentPage }: AdminLayoutProps) {
  const { t, isRTL, lang } = useLanguage();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [sosCount] = useState(3); // Mock SOS count

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    alert(t('nav.logout'));
    navigate('/login');
  };

  const menuItems = [
    { label: t('nav.dashboard'), icon: <DashboardIcon />, path: '/dashboard' },
    { label: t('nav.live_map'), icon: <MapIcon />, path: '/live-map' },
    { label: t('nav.tenants'), icon: <PeopleIcon />, path: '/owners' },
    { label: t('nav.tickets'), icon: <BuildIcon />, path: '/tickets' },
    { label: t('nav.technicians'), icon: <PeopleIcon />, path: '/technicians' },
    { label: t('nav.financials'), icon: <TreasuryIcon />, path: '/financials' },
    { label: t('nav.sos_feed'), icon: <Badge badgeContent={sosCount} color="error"><WarningIcon /></Badge>, path: '/sos' },
    { label: t('nav.audit'), icon: <AuditIcon />, path: '/audit' },
    { label: t('nav.reports'), icon: <BarChartIcon />, path: '/reports' },
    { label: t('nav.settings'), icon: <SettingsIcon />, path: '/settings' },
  ];

  return (
    <Box sx={{ display: 'flex', direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          ml: isRTL ? 0 : `${DRAWER_WIDTH}px`,
          mr: isRTL ? `${DRAWER_WIDTH}px` : 0,
          backgroundColor: '#1976d2',
        }}
      >
        <Toolbar sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Box sx={{ flexGrow: 1, textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="h6">{t('nav.admin_panel_title')}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {currentPage}
            </Typography>
          </Box>

          {/* User Menu */}
          <Avatar
            onClick={handleMenuOpen}
            sx={{ cursor: 'pointer', bgcolor: '#1565c0' }}
          >
            AD
          </Avatar>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose} dir={isRTL ? 'rtl' : 'ltr'}>
            <MenuItem sx={{ justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>👤 {t('nav.admin_user')}</MenuItem>
            <MenuItem sx={{ justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>admin@bin-groups.com</MenuItem>
            <Divider />
            <MenuItem onClick={() => { navigate('/settings'); handleMenuClose(); }} sx={{ justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
              ⚙ {t('nav.settings')}
            </MenuItem>
            <MenuItem onClick={handleLogout} sx={{ justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
              <LogoutIcon sx={{ mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 }} /> {t('nav.logout')}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Drawer
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            backgroundColor: '#263238',
            color: '#fff',
            left: isRTL ? 'auto' : 0,
            right: isRTL ? 0 : 'auto',
          },
        }}
        variant="permanent"
        anchor={isRTL ? 'right' : 'left'}
      >
        {/* Logo */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <HomeIcon sx={{ fontSize: 32, color: '#00bcd4' }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            BIN-GROUP
          </Typography>
        </Box>

        <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />

        {/* Navigation Menu */}
        <List sx={{ flex: 1 }}>
          {menuItems.map((item) => (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                onClick={() => navigate(item.path)}
                selected={currentPage.toLowerCase().includes(item.label.toLowerCase())}
                sx={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  '&.Mui-selected': {
                    backgroundColor: '#00bcd4',
                    color: '#000',
                    '& .MuiListItemIcon-root': {
                      color: '#000',
                    },
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(0,188,212,0.1)',
                  },
                }}
              >
                <ListItemIcon sx={{ color: '#00bcd4', minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />

        {/* Footer */}
        <Box sx={{ p: 2, textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {t('nav.version_info')}
          </Typography>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          ml: isRTL ? 0 : 0,
          mr: isRTL ? 0 : 0,
          mt: '64px',
          backgroundColor: '#fafafa',
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
