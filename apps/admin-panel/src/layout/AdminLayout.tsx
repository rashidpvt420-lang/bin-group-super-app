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
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const DRAWER_WIDTH = 260;

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage: string;
}

export default function AdminLayout({ children, currentPage }: AdminLayoutProps) {
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
    alert('Logged out');
    navigate('/login');
  };

  const menuItems = [
    { label: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
    { label: 'Live Map', icon: <MapIcon />, path: '/live-map' },
    { label: 'Owners', icon: <PeopleIcon />, path: '/owners' },
    { label: 'Tickets', icon: <BuildIcon />, path: '/tickets' },
    { label: 'Technicians', icon: <PeopleIcon />, path: '/technicians' },
    { label: 'SOS Feed', icon: <Badge badgeContent={sosCount} color="error"><WarningIcon /></Badge>, path: '/sos' },
    { label: 'Reports', icon: <BarChartIcon />, path: '/reports' },
    { label: 'Settings', icon: <SettingsIcon />, path: '/settings' },
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          ml: `${DRAWER_WIDTH}px`,
          backgroundColor: '#1976d2',
        }}
      >
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">HOME OS Admin Panel</Typography>
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
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
            <MenuItem>👤 Admin User</MenuItem>
            <MenuItem>admin@homeOS.com</MenuItem>
            <Divider />
            <MenuItem onClick={() => { navigate('/settings'); handleMenuClose(); }}>
              ⚙ Settings
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1 }} /> Logout
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
          },
        }}
        variant="permanent"
        anchor="left"
      >
        {/* Logo */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <HomeIcon sx={{ fontSize: 32, color: '#00bcd4' }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            HOME OS
          </Typography>
        </Box>

        <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />

        {/* Navigation Menu */}
        <List sx={{ flex: 1 }}>
          {menuItems.map((item) => (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                onClick={() => navigate(item.path)}
                selected={currentPage.includes(item.label.toLowerCase())}
                sx={{
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
                <ListItemIcon sx={{ color: '#00bcd4', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />

        {/* Footer */}
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            v1.0.0 | Go-Live: Jun 6, 2026
          </Typography>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          ml: 0,
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
