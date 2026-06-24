import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
  alpha,
} from '@mui/material';
import { Briefcase, Building, FileUp, Home, Link2, Paintbrush, Users, Wallet } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { useRole } from '../context/RoleContext';
import { NotificationBell } from '../components/NotificationBell';
import PortalSessionControls from '../components/PortalSessionControls';
import BrandWatermark from '../components/BrandWatermark';
import SafeIcon, { renderSafeIcon } from '../components/SafeIcon';
import BinConnectChatBox from '../components/BinConnectChatBox';
import PilotCompletionPage from '../components/PilotCompletionPage';
import BinConnectInboxPage from '../components/BinConnectInboxPage';

import BrokerDashboardPage from './pages/BrokerDashboardPage';
import BrokerLeadsPage from './pages/BrokerLeadsPage';
import BrokerReferralsPage from './pages/BrokerReferralsPage';
import BrokerCommissionsPage from './pages/BrokerCommissionsPage';
import BrokerDocumentsPage from './pages/BrokerDocumentsPage';
import BrokerProfilePage from './pages/BrokerProfilePage';
import BrokerAttributionProofPage from './pages/BrokerAttributionProofPage';

type BrokerMenuItem = {
  key: string;
  label: string;
  path: string;
  icon: React.ElementType;
};

const BrokerLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useRole();
  const { isRTL, lang, tx } = useLanguage();

  const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

  const menuItems: BrokerMenuItem[] = [
    { key: 'broker.nav.dashboard', label: label('broker.nav.dashboard', 'Dashboard', 'لوحة التحكم'), path: '/broker/dashboard', icon: Home },
    { key: 'broker.nav.leads', label: label('broker.nav.leads', 'Leads', 'العملاء المحتملون'), path: '/broker/leads', icon: Users },
    { key: 'broker.nav.referrals', label: label('broker.nav.referrals', 'Referrals', 'الإحالات'), path: '/broker/referrals', icon: Building },
    { key: 'broker.nav.commissions', label: label('broker.nav.commissions', 'Commissions', 'العمولات'), path: '/broker/commissions', icon: Wallet },
    { key: 'broker.nav.attribution', label: label('broker.nav.attribution', 'Attribution', 'الإسناد'), path: '/broker/attribution', icon: Link2 },
    { key: 'broker.nav.documents', label: label('broker.nav.documents', 'Documents', 'المستندات'), path: '/broker/documents', icon: FileUp },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', color: '#111827', direction: isRTL ? 'rtl' : 'ltr', pb: { xs: 10, lg: 0 }, position: 'relative', isolation: 'isolate' }}>
      <BrandWatermark opacity={0.035} compact />
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: '#FFFFFF', borderBottom: '1px solid #E5E7EB', zIndex: 1200 }}>
        <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 }, minHeight: 76, flexDirection: isRTL ? 'row-reverse' : 'row', gap: 1 }}>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
            <Box onClick={() => navigate('/broker/dashboard')} sx={{ p: 1, bgcolor: '#B8932F', borderRadius: 2, color: '#FFFFFF', cursor: 'pointer', display: 'flex' }}>
              <SafeIcon icon={Briefcase} size={20} />
            </Box>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
              <Typography variant="h6" sx={{ color: '#B8932F', fontWeight: 950, letterSpacing: 2, lineHeight: 1 }}>
                {label('broker.portal.title', 'BIN BROKER', 'وسيط BIN')}
              </Typography>
              <Typography variant="caption" sx={{ color: '#667085', fontWeight: 900 }}>
                {label('broker.portal.subtitle', 'PARTNER PORTAL - MADE IN UAE', 'بوابة الشركاء - صنع في الإمارات')}
              </Typography>
            </Box>
          </Stack>

          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
            <IconButton
              onClick={() => navigate('/broker/referrals')}
              sx={{ color: '#B8932F', bgcolor: alpha('#B8932F', 0.08) }}
              title={label('nav.ai_studio', 'AI Studio requests are available after an owner or tenant contract is linked', 'طلبات الاستوديو متاحة بعد ربط عقد مالك أو مستأجر')}
            >
              <SafeIcon icon={Paintbrush} size={18} />
            </IconButton>
            <NotificationBell />
            <Box onClick={() => navigate('/broker/profile')} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', px: 1 }}>
              <Avatar sx={{ width: 36, height: 36, bgcolor: alpha('#B8932F', 0.12), color: '#B8932F', border: '1px solid rgba(184,147,47,0.3)' }}>
                {user?.displayName?.charAt(0) || 'B'}
              </Avatar>
            </Box>
            <PortalSessionControls role="broker" accent="#B8932F" />
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 5, position: 'relative', zIndex: 1 }}>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} sx={{ display: { xs: 'none', lg: 'flex' }, mb: 4 }}>
          {menuItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Button id={`broker-nav-${item.path.split('/').pop()}`} key={item.key} onClick={() => navigate(item.path)} startIcon={renderSafeIcon(item.icon, { size: 18 })} sx={{ color: active ? '#FFFFFF' : '#667085', bgcolor: active ? '#B8932F' : '#F3F4F6', fontWeight: 950, borderRadius: 3, px: 2.5, '& .MuiButton-startIcon': { mr: isRTL ? 0 : 1, ml: isRTL ? 1 : 0 }, '&:hover': { bgcolor: active ? '#A08027' : '#E5E7EB' } }}>
                {item.label}
              </Button>
            );
          })}
        </Stack>
        {children}
      </Container>

      <BinConnectChatBox role="broker" />

      <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid #E5E7EB', bgcolor: '#FFFFFF', mt: 'auto', mb: { xs: 8, lg: 0 }, position: 'relative', zIndex: 1 }}>
        <Typography variant="caption" sx={{ color: '#667085', fontWeight: 800, letterSpacing: 2 }}>
          {label('broker.footer', '© 2026 BIN GROUP SOVEREIGN - BROKER TERMINAL - MADE IN UAE', '© 2026 BIN GROUP SOVEREIGN - محطة الوسطاء - صنع في الإمارات')}
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ display: { xs: 'flex', lg: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: '#FFFFFF', borderTop: '1px solid #E5E7EB', zIndex: 1300, justifyContent: 'space-around', py: 1, direction: isRTL ? 'rtl' : 'ltr' }}>
        {menuItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <IconButton id={`broker-mobile-nav-${item.path.split('/').pop()}`} key={item.key} onClick={() => navigate(item.path)} sx={{ color: active ? '#B8932F' : '#667085', flexDirection: 'column', gap: 0.4 }}>
              <SafeIcon icon={item.icon} size={18} />
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
        <Route path="/attribution" element={<BrokerAttributionProofPage />} />
        <Route path="/documents" element={<BrokerDocumentsPage />} />
        <Route path="/profile" element={<BrokerProfilePage />} />
        <Route path="/bin-connect" element={<BinConnectInboxPage role="broker" />} />
        <Route path="/pilot-completion" element={<PilotCompletionPage role="broker" />} />
      </Routes>
    </BrokerLayout>
  );
}
