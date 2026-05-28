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
  Typography,
  alpha,
} from '@mui/material';
import { ArrowLeft, Briefcase, Building, FileUp, Globe, Home, Paintbrush, Users, Wallet } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { auth } from '../lib/firebase';
import { NotificationBell } from '../components/NotificationBell';

import BrokerDashboardPage from './pages/BrokerDashboardPage';
import BrokerLeadsPage from './pages/BrokerLeadsPage';
import BrokerReferralsPage from './pages/BrokerReferralsPage';
import BrokerCommissionsPage from './pages/BrokerCommissionsPage';
import BrokerDocumentsPage from './pages/BrokerDocumentsPage';
import BrokerProfilePage from './pages/BrokerProfilePage';

const BrokerLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useRole();
  const { toggleLanguage, isRTL, language, tx } = useLanguage();

  const label = (key: string, en: string, ar: string) => language === 'ar' ? ar : tx(key, en);

  const handleLogout = () => {
    auth.signOut();
    navigate('/login');
  };

  const menuItems = [
    { key: 'broker.nav.dashboard', label: label('broker.nav.dashboard', 'Dashboard', 'لوحة التحكم'), path: '/broker/dashboard', icon: <Home size={18} /> },
    { key: 'broker.nav.leads', label: label('broker.nav.leads', 'Leads', 'العملاء المحتملون'), path: '/broker/leads', icon: <Users size={18} /> },
    { key: 'broker.nav.referrals', label: label('broker.nav.referrals', 'Referrals', 'الإحالات'), path: '/broker/referrals', icon: <Building size={18} /> },
    { key: 'broker.nav.commissions', label: label('broker.nav.commissions', 'Commissions', 'العمولات'), path: '/broker/commissions', icon: <Wallet size={18} /> },
    { key: 'broker.nav.documents', label: label('broker.nav.documents', 'Documents', 'المستندات'), path: '/broker/documents', icon: <FileUp size={18} /> },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#fff', direction: isRTL ? 'rtl' : 'ltr', pb: { xs: 10, lg: 0 } }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'rgba(2,6,23,0.86)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 }, minHeight: 76, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
            <Box onClick={() => navigate('/broker/dashboard')} sx={{ p: 1, bgcolor: binThemeTokens.gold, borderRadius: 2, color: '#000', cursor: 'pointer', display: 'flex' }}>
              <Briefcase size={20} />
            </Box>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2, lineHeight: 1 }}>
                {label('broker.portal.title', 'BIN BROKER', 'وسيط BIN')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 900 }}>
                {label('broker.portal.subtitle', 'PARTNER PORTAL · MADE IN UAE 🇦🇪', 'بوابة الشركاء · صنع في الإمارات 🇦🇪')}
              </Typography>
            </Box>
          </Stack>

          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
            <IconButton onClick={() => navigate('/design-studio')} sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.08) }} title={label('nav.ai_studio', 'AI Studio', 'استوديو الذكاء الاصطناعي')}>
              <Paintbrush size={18} />
            </IconButton>
            <IconButton onClick={toggleLanguage} sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.06), borderRadius: 3, px: 1.5 }}>
              <Globe size={18} />
              <Typography variant="caption" sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, fontWeight: 950 }}>{language === 'en' ? 'AR' : 'EN'}</Typography>
            </IconButton>
            <NotificationBell />
            <Box onClick={() => navigate('/broker/profile')} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', px: 1 }}>
              <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }}>
                {user?.displayName?.charAt(0) || 'B'}
              </Avatar>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 1 }} />
            <Button onClick={handleLogout} startIcon={<ArrowLeft size={16} />} sx={{ color: '#ef4444', fontWeight: 950, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>
              {label('nav.logout', 'Logout', 'تسجيل الخروج')}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 5 }}>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} sx={{ display: { xs: 'none', lg: 'flex' }, mb: 4 }}>
          {menuItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Button key={item.key} onClick={() => navigate(item.path)} startIcon={item.icon} sx={{ color: active ? '#000' : 'rgba(255,255,255,0.62)', bgcolor: active ? binThemeTokens.gold : 'rgba(255,255,255,0.03)', fontWeight: 950, borderRadius: 3, px: 2.5, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 } }}>
                {item.label}
              </Button>
            );
          })}
        </Stack>
        {children}
      </Container>

      <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(11, 11, 12, 0.5)', mt: 'auto', mb: { xs: 8, lg: 0 } }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800, letterSpacing: 2 }}>
          {label('broker.footer', '© 2026 BIN GROUP SOVEREIGN · BROKER TERMINAL · MADE IN UAE 🇦🇪', '© 2026 BIN GROUP SOVEREIGN · محطة الوسطاء · صنع في الإمارات 🇦🇪')}
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ display: { xs: 'flex', lg: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(2,6,23,0.94)', borderTop: '1px solid rgba(255,255,255,0.08)', zIndex: 1300, justifyContent: 'space-around', py: 1, direction: isRTL ? 'rtl' : 'ltr' }}>
        {menuItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <IconButton key={item.key} onClick={() => navigate(item.path)} sx={{ color: active ? binThemeTokens.gold : 'rgba(255,255,255,0.45)', flexDirection: 'column', gap: 0.4 }}>
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
