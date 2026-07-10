import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Box, Divider, Drawer, List, ListItem, ListItemIcon, ListItemText, Typography, alpha } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LogoutIcon from '@mui/icons-material/Logout';
import FileTextIcon from '@mui/icons-material/Description';
import { Building2, Map, MessageSquare, Sparkles, Users, Wrench } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { signOut } from 'firebase/auth';

import { auth } from '../lib/firebase';
import { binThemeTokens } from '../theme/adminTheme';
import { useAuth } from '../context/AuthContext';
import CeoContactButtons from './CeoContactButtons';

type MenuItem = {
  text: string;
  path: string;
  icon: ReactNode;
  color?: string;
};

const Navigation = () => {
  const { t, tx, isRTL } = useLanguage();
  const { user } = useAuth();
  const isHRAuthorized = ['admin', 'super_admin', 'ceo', 'hr_admin', 'hr_manager', 'hr_staff'].includes(String(user?.role || ''));

  const commandMenu: MenuItem[] = [
    { text: tx('nav.dashboard', 'Dashboard'), icon: <DashboardIcon />, path: '/dashboard' },
    { text: 'Advanced Analytics', icon: <DashboardIcon />, path: '/dashboard/full', color: '#38bdf8' },
    { text: tx('fin.payroll', 'Treasury & Payroll'), icon: <AccountBalanceWalletIcon />, path: '/financials', color: '#6366f1' },
    { text: 'Payment Approvals', icon: <PendingActionsIcon />, path: '/payments', color: '#10b981' },
    { text: tx('nav.docs', 'Document Vault'), icon: <FileTextIcon />, path: '/document-vault', color: binThemeTokens.gold },
    { text: tx('nav.audit', 'Institutional Intake Vault'), icon: <SecurityIcon />, path: '/vault', color: binThemeTokens.gold },
    { text: 'Design Studio Manager', icon: <Sparkles size={20} />, path: '/design-studio', color: binThemeTokens.gold },
    { text: tx('nav.orphans', 'Orphan War Room'), icon: <SecurityIcon />, path: '/orphans', color: '#ef4444' },
    { text: 'Sovereign Control', icon: <SecurityIcon />, path: '/control-center', color: '#ef4444' },
    { text: 'BIN Connect Inbox', icon: <MessageSquare size={20} />, path: '/ops/bin-connect', color: '#38bdf8' },
    { text: 'Pilot Completion', icon: <PendingActionsIcon />, path: '/ops/pilot-completion', color: '#3b82f6' },
    { text: 'Public Launch Command', icon: <SecurityIcon />, path: '/ops/public-launch-command', color: binThemeTokens.gold },
    { text: 'Pricing Matrix 2026', icon: <AccountBalanceWalletIcon />, path: '/pricing-matrix', color: binThemeTokens.gold },
    { text: 'BIN-GPT Engineer', icon: <Sparkles size={20} />, path: '/bin-gpt-engineer', color: '#10b981' },
    { text: tx('nav.reports', 'Reports'), icon: <ReceiptIcon />, path: '/reports', color: '#8b5cf6' },
  ];

  const operationsMenu: MenuItem[] = [
    { text: 'Owners & Activations', icon: <Building2 size={20} />, path: '/owners' },
    { text: 'Property Approvals', icon: <PendingActionsIcon />, path: '/properties/approvals', color: binThemeTokens.gold },
    { text: tx('nav.tenants', 'Tenants'), icon: <PeopleIcon />, path: '/tenants' },
    { text: 'Tenant Unit Links', icon: <PendingActionsIcon />, path: '/unit-links', color: '#f59e0b' },
    { text: 'Tenant Services', icon: <ReceiptIcon />, path: '/tenant-services', color: '#38bdf8' },
    { text: 'Operations Messages', icon: <MessageSquare size={20} />, path: '/ops/messages', color: '#8b5cf6' },
    { text: tx('nav.brokers', 'Brokers'), icon: <PeopleIcon />, path: '/broker' },
    { text: 'Broker Attribution Queue', icon: <PendingActionsIcon />, path: '/broker-attributions', color: binThemeTokens.gold },
    { text: 'Broker Commission Hub', icon: <AccountBalanceWalletIcon />, path: '/broker-commissions', color: '#10b981' },
    { text: tx('nav.property_passport', 'Property Passports'), icon: <SecurityIcon />, path: '/properties/passport', color: binThemeTokens.gold },
    { text: 'Unit Status Control', icon: <DashboardIcon />, path: '/units', color: binThemeTokens.gold },
    { text: tx('nav.technicians', 'Technician Corps'), icon: <Wrench size={20} />, path: '/technicians' },
    { text: 'Duty Command Center', icon: <PendingActionsIcon />, path: '/ops/technicians', color: binThemeTokens.gold },
    { text: 'Technician Live Map', icon: <Map size={20} />, path: '/technicians/map', color: '#38bdf8' },
    { text: 'WhatsApp Triage', icon: <ReceiptIcon />, path: '/ops/whatsapp-triage', color: '#10b981' },
    { text: 'RFQ Trust Workflow', icon: <PendingActionsIcon />, path: '/ops/rfq', color: binThemeTokens.gold },
    { text: 'Vendor Command', icon: <Users size={20} />, path: '/ops/vendors', color: '#38bdf8' },
    { text: 'PDPL Governance', icon: <SecurityIcon />, path: '/ops/data-governance', color: '#c084fc' },
    { text: tx('nav.tickets', 'Mission Tickets'), icon: <ReceiptIcon />, path: '/tickets' },
    { text: 'Dispute Queue', icon: <PendingActionsIcon />, path: '/disputes', color: '#ef4444' },
    { text: tx('nav.sos_feed', 'SOS Live Feed'), icon: <ReceiptIcon />, path: '/sos', color: '#ef4444' },
    { text: tx('nav.audit_log', 'System Audit Log'), icon: <SecurityIcon />, path: '/audit' },
    ...(isHRAuthorized ? [{ text: 'HR Command', icon: <Users size={20} />, path: '/hr', color: binThemeTokens.gold }] : []),
    { text: 'Staff Access', icon: <PeopleIcon />, path: '/staff-access', color: '#38bdf8' },
    { text: tx('nav.support', 'Settings & Launch Evidence'), icon: <SettingsIcon />, path: '/settings' },
  ];

  const renderMenu = (label: string, items: MenuItem[]) => (
    <List sx={{ px: 2, pt: 2 }}>
      <Typography variant="overline" sx={{ px: 2, color: binThemeTokens.textTertiary, fontWeight: 900, textAlign: isRTL ? 'right' : 'left', display: 'block' }}>
        {label}
      </Typography>
      {items.map((item) => (
        <ListItem
          key={item.path}
          component={NavLink}
          to={item.path}
          sx={{
            borderRadius: 2,
            mb: 0.5,
            flexDirection: isRTL ? 'row-reverse' : 'row',
            textAlign: isRTL ? 'right' : 'left',
            '&.active': {
              bgcolor: alpha(binThemeTokens.gold, 0.1),
              '& .MuiTypography-root': { color: binThemeTokens.gold },
            },
          }}
        >
          <ListItemIcon sx={{ color: item.color || binThemeTokens.textSecondary, minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
            {item.icon}
          </ListItemIcon>
          <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
        </ListItem>
      ))}
    </List>
  );

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
          left: isRTL ? 'auto' : 0,
        },
      }}
    >
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 900, color: binThemeTokens.gold, letterSpacing: 2 }}>BIN GROUP</Typography>
        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 4 }}>{t('nav.administry') || 'ADMIN'}</Typography>
      </Box>
      <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.1) }} />

      {renderMenu(t('nav.sovereign_core') || 'COMMAND', commandMenu)}
      {renderMenu(t('nav.operations') || 'OPERATIONS', operationsMenu)}

      <Box sx={{ mt: 'auto', p: 2 }}>
        <CeoContactButtons compact />
        <ListItem
          component="button"
          onClick={() => {
            const currentLang = localStorage.getItem('bin_language');
            localStorage.clear();
            if (currentLang) localStorage.setItem('bin_language', currentLang);
            void signOut(auth).finally(() => { window.location.href = '/login'; });
          }}
          sx={{ width: '100%', border: 0, borderRadius: 2, mt: 2, bgcolor: alpha('#ef4444', 0.1), cursor: 'pointer', '&:hover': { bgcolor: alpha('#ef4444', 0.2) } }}
        >
          <ListItemIcon sx={{ color: '#ef4444', minWidth: 40 }}><LogoutIcon /></ListItemIcon>
          <ListItemText primary={t('nav.logout') || 'Sign Out'} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.85rem', color: '#ef4444' }} />
        </ListItem>
      </Box>
    </Drawer>
  );
};

export default Navigation;
