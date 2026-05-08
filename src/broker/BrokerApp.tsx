import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import { ArrowLeft, Bell, Briefcase, Building, FileUp, Globe, Home, Paintbrush, Users, Wallet } from 'lucide-react';
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
  const { toggleLanguage, isRTL, language } = useLanguage();

  const menuItems = [
    { label: 'Dashboard', path: '/broker/dashboard', icon: <Home size={18} /> },
    { label: 'Leads', path: '/broker/leads', icon: <Users size={18} /> },
    { label: 'Referrals', path: '/broker/referrals', icon: <Building size={18} /> },
    { label: 'Commissions', path: '/broker/commissions', icon: <Wallet size={18} /> },
    { label: 'Documents', path: '/broker/documents', icon: <FileUp size={18} /> },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#fff', direction: isRTL ? 'rtl' : 'ltr', pb: { xs: 10, lg: 0 } }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'rgba(2,6,23,0.86)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 }, minHeight: 76 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box onClick={() => navigate('/broker/dashboard')} sx={{ p: 1, bgcolor: binThemeTokens.gold, borderRadius: 2, color: '#000', cursor: 'pointer', display: 'flex' }}>
              <Briefcase size={20} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2, lineHeight: 1 }}>BIN BROKER</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 900 }}>PARTNER PORTAL</Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton onClick={() => navigate('/design-studio')} sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.08) }}>
              <Paintbrush size={18} />
            </IconButton>
            <IconButton onClick={toggleLanguage} sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.06), borderRadius: 3, px: 1.5 }}>
              <Globe size={18} />
              <Typography variant="caption" sx={{ ml: 1, fontWeight: 950 }}>{language === 'en' ? 'AR' : 'EN'}</Typography>
            </IconButton>
            <Tooltip title="Notifications">
              <IconButton sx={{ color: 'rgba(255,255,255,0.6)' }}><Bell size={19} /></IconButton>
            </Tooltip>
            <Box onClick={() => navigate('/broker/profile')} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', px: 1 }}>
              <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }}>
                {user?.displayName?.charAt(0) || 'B'}
              </Avatar>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 1 }} />
            <Button onClick={logout} startIcon={<ArrowLeft size={16} />} sx={{ color: '#ef4444', fontWeight: 950 }}>
              Logout
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 5 }}>
        <Stack direction="row" spacing={1.2} sx={{ display: { xs: 'none', lg: 'flex' }, mb: 4 }}>
          {menuItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Button key={item.path} onClick={() => navigate(item.path)} startIcon={item.icon} sx={{ color: active ? '#000' : 'rgba(255,255,255,0.62)', bgcolor: active ? binThemeTokens.gold : 'rgba(255,255,255,0.03)', fontWeight: 950, borderRadius: 3, px: 2.5 }}>
                {item.label}
              </Button>
            );
          })}
        </Stack>
        {children}
      </Container>

      <Paper elevation={0} sx={{ display: { xs: 'flex', lg: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(2,6,23,0.94)', borderTop: '1px solid rgba(255,255,255,0.08)', zIndex: 1300, justifyContent: 'space-around', py: 1 }}>
        {menuItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <IconButton key={item.path} onClick={() => navigate(item.path)} sx={{ color: active ? binThemeTokens.gold : 'rgba(255,255,255,0.45)', flexDirection: 'column', gap: 0.4 }}>
              {item.icon}
              <Typography variant="caption" sx={{ fontSize: '0.58rem', fontWeight: 900 }}>{item.label}</Typography>
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
